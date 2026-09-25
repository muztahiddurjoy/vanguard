"""Panel lawyers: assignment by the DLAO, and the lawyer's own API."""

import base64
from datetime import datetime, timedelta

from sqlalchemy import select

from app.database import utcnow
from app.models import Case, LawyerUpdate
from tests.test_api_intake_dlao import create_moyuri

YEAR = utcnow().year
REF = f"APP-{YEAR}-001"
OFFICER = {"X-Officer-Id": "DLAO-RGP-0142"}


def assign(client, lawyer_id: str, **extra: str):  # type: ignore[no-untyped-def]
    return client.post(
        f"/dlao/cases/{REF}/lawyer", json={"lawyer_id": lawyer_id, **extra}, headers=OFFICER
    )


def test_only_panel_lawyers_can_be_assigned(client):
    create_moyuri(client)
    assert assign(client, "LAW-99").status_code == 422
    r = assign(client, "law-21")
    assert r.status_code == 200
    assert r.json()["lawyer"]["id"] == "LAW-21"
    assert assign(client, "LAW-21").status_code == 409


def test_reassigning_records_who_had_it_and_why(client):
    create_moyuri(client)
    assign(client, "LAW-07")
    reason = "Missed two progress updates and did not answer the reminder."
    assert assign(client, "LAW-21", reason=reason).status_code == 200
    entries = [
        a for a in client.get(f"/dlao/cases/{REF}").json()["activity"]
        if a["action"] == "lawyer.assigned"
    ]  # fmt: skip
    assert entries[0]["details"] == {"lawyerId": "LAW-07"}
    assert entries[1]["details"] == {"lawyerId": "LAW-21", "from": "LAW-07"}
    assert entries[1]["justification"] == reason


# --- the lawyer's own API ------------------------------------------------------

LAWYER = {"X-Lawyer-Id": "LAW-21"}
UPDATE = {
    "stage": "evidenceRecorded",
    "summary": "The applicant and one witness gave evidence. Cross-examination is next.",
    "court": "Nari O Shishu Nirjatan Daman Tribunal, Rangpur",
}


def later(**delta: float) -> str:
    return (utcnow() + timedelta(**delta)).isoformat()


def post_update(client, body: dict | None = None, headers: dict | None = None):  # type: ignore[no-untyped-def]
    return client.post(
        f"/lawyer/cases/{REF}/updates", json=body or UPDATE, headers=headers or LAWYER
    )


def test_lawyer_must_be_on_the_panel(client):
    assert client.get("/lawyer/me").status_code == 401
    assert client.get("/lawyer/me", headers={"X-Lawyer-Id": "LAW-99"}).status_code == 401
    me = client.get("/lawyer/me", headers=LAWYER).json()
    assert me["name"] == "Adv. Taslima Akter" and me["nameBn"] == "অ্যাড. তাসলিমা আক্তার"


def test_lawyer_sees_only_their_own_cases(client):
    create_moyuri(client)
    assert client.get("/lawyer/cases", headers=LAWYER).json() == []
    assign(client, "LAW-21")
    [case] = client.get("/lawyer/cases", headers=LAWYER).json()
    assert case["id"] == REF
    assert case["client"]["name"] == "Moyuri Akter"
    # Her phone is watched: the lawyer gets the number with the same safe window.
    assert case["client"]["phone"] == "01712345318"
    assert case["client"]["safeContactWindows"] == [{"day": 2, "start_hour": 14, "end_hour": 16}]
    assert case["respondent"] == {"name": "Jalal Uddin", "nameBn": None, "relation": "husband"}
    assert case["missedUpdates"] == 0 and case["updates"] == []
    other = {"X-Lawyer-Id": "LAW-07"}
    assert client.get("/lawyer/cases", headers=other).json() == []
    assert client.get(f"/lawyer/cases/{REF}", headers=other).status_code == 403
    assert post_update(client, headers=other).status_code == 403


def test_no_phone_number_when_the_applicant_must_not_be_called(client, db):
    create_moyuri(client)
    assign(client, "LAW-21")
    case = db.scalars(select(Case)).one()
    case.do_not_call_reason = "hostage"
    db.commit()
    view = client.get(f"/lawyer/cases/{REF}", headers=LAWYER).json()
    assert view["client"]["phone"] is None
    assert view["doNotCall"] == {"reason": "hostage"}


def test_update_reaches_the_dlao_and_clears_the_inactivity_alert(client, db):
    create_moyuri(client)
    assign(client, "LAW-21")
    case = db.scalars(select(Case)).one()
    case.lawyer_last_update_at = utcnow() - timedelta(days=30)
    db.commit()
    before = client.get(f"/dlao/cases/{REF}").json()
    assert "lawyerInactivity" in before["flags"]
    assert before["lawyer"]["missedUpdates"] == 2

    hearing = later(days=12)
    r = post_update(client, {**UPDATE, "hearing_held_on": str(utcnow().date()),
                             "next_hearing_at": hearing})  # fmt: skip
    assert r.status_code == 201, r.text
    mine = r.json()
    assert mine["missedUpdates"] == 0 and mine["courtStage"] == "evidenceRecorded"
    assert mine["nextHearing"]["court"] == UPDATE["court"]

    after = client.get(f"/dlao/cases/{REF}", headers=OFFICER).json()
    assert "lawyerInactivity" not in after["flags"]
    assert after["lawyer"]["missedUpdates"] == 0
    assert after["courtStage"] == "evidenceRecorded"
    assert datetime.fromisoformat(after["nextHearing"]["at"]) == datetime.fromisoformat(hearing)
    [update] = after["lawyerUpdates"]
    assert update["lawyerId"] == "LAW-21" and update["summary"] == UPDATE["summary"]
    entry = next(a for a in after["activity"] if a["action"] == "lawyer.update")
    assert entry["actor"] == "LAW-21" and entry["details"]["stage"] == "evidenceRecorded"


def test_update_is_due_three_days_after_the_hearing(client, db):
    create_moyuri(client)
    assign(client, "LAW-21")
    post_update(client, {**UPDATE, "next_hearing_at": later(days=2)})
    due = datetime.fromisoformat(client.get(f"/dlao/cases/{REF}").json()["lawyer"]["updateDueAt"])
    assert timedelta(days=4, hours=23) < due - utcnow() < timedelta(days=5, hours=1)

    # The hearing was a week ago and nothing has been reported since.
    update = db.scalars(select(LawyerUpdate)).one()
    case = db.scalars(select(Case)).one()
    update.submitted_at = case.lawyer_last_update_at = utcnow() - timedelta(days=10)
    update.next_hearing_at = utcnow() - timedelta(days=7)
    db.commit()
    view = client.get(f"/dlao/cases/{REF}").json()
    assert "lawyerInactivity" in view["flags"] and view["lawyer"]["missedUpdates"] == 1
    # The hearing is still shown until the lawyer reports on it.
    assert view["nextHearing"] is not None

    post_update(client, {**UPDATE, "stage": "hearingAdjourned"})
    view = client.get(f"/dlao/cases/{REF}").json()
    assert "lawyerInactivity" not in view["flags"] and view["nextHearing"] is None


def test_update_validation(client):
    create_moyuri(client)
    assign(client, "LAW-21")
    assert post_update(client, {**UPDATE, "summary": "Adjourned."}).status_code == 422
    assert post_update(client, {**UPDATE, "summary": " " * 30}).status_code == 422
    assert post_update(client, {**UPDATE, "stage": "won"}).status_code == 422
    assert post_update(client, {**UPDATE, "next_hearing_at": later(days=-1)}).status_code == 422
    tomorrow = str((utcnow() + timedelta(days=2)).date())
    assert post_update(client, {**UPDATE, "hearing_held_on": tomorrow}).status_code == 422
    judgment = {**UPDATE, "stage": "judgment", "next_hearing_at": later(days=9)}
    assert post_update(client, judgment).status_code == 422
    assert client.get(f"/dlao/cases/{REF}").json()["lawyerUpdates"] == []


def test_update_carries_the_certified_copy(client):
    create_moyuri(client)
    assign(client, "LAW-21")
    pdf = base64.b64encode(b"%PDF-1.4 order sheet").decode()
    attachment = {"filename": "order-sheet.pdf", "content_type": "application/pdf", "data_b64": pdf}
    r = post_update(client, {**UPDATE, "attachment": attachment})
    assert r.status_code == 201, r.text
    assert r.json()["updates"][0]["attachment"]["filename"] == "order-sheet.pdf"
    docs = client.get(f"/dlao/cases/{REF}").json()["documents"]
    assert [d["kind"] for d in docs] == ["court_order"]

    bad = {**attachment, "content_type": "application/zip"}
    assert post_update(client, {**UPDATE, "attachment": bad}).status_code == 415
    garbled = {**attachment, "data_b64": "not base64!"}
    assert post_update(client, {**UPDATE, "attachment": garbled}).status_code == 422


def test_reassigned_case_moves_to_the_new_lawyer_with_its_history(client):
    create_moyuri(client)
    assign(client, "LAW-21")
    post_update(client)
    assign(client, "LAW-07", reason="The applicant asked for a different lawyer.")
    assert client.get("/lawyer/cases", headers=LAWYER).json() == []
    assert post_update(client).status_code == 403
    [case] = client.get("/lawyer/cases", headers={"X-Lawyer-Id": "LAW-07"}).json()
    assert [u["lawyerId"] for u in case["updates"]] == ["LAW-21"]


def test_reminder_reaches_the_lawyer_and_waits_one_period(client, db):
    create_moyuri(client)
    assert client.post(f"/dlao/cases/{REF}/lawyer-reminder").status_code == 409
    assign(client, "LAW-21")
    case = db.scalars(select(Case)).one()
    case.lawyer_last_update_at = utcnow() - timedelta(days=20)
    db.commit()
    assert "alerts" in client.get(f"/dlao/cases/{REF}").json()["queues"]

    r = client.post(f"/dlao/cases/{REF}/lawyer-reminder", headers=OFFICER)
    assert r.status_code == 200
    # Still late, but now waiting on the lawyer rather than the officer.
    assert "lawyerInactivity" in r.json()["flags"] and "alerts" not in r.json()["queues"]
    assert r.json()["lawyer"]["remindedAt"] is not None
    mine = client.get(f"/lawyer/cases/{REF}", headers=LAWYER).json()
    assert mine["remindedAt"] == r.json()["lawyer"]["remindedAt"]
    entry = client.get(f"/dlao/cases/{REF}").json()["activity"][-1]
    assert entry["action"] == "lawyer.reminded" and entry["details"] == {"lawyerId": "LAW-21"}

    # A reminder answered by an update is done with.
    post_update(client)
    assert client.get(f"/lawyer/cases/{REF}", headers=LAWYER).json()["remindedAt"] is None


def test_unanswered_reminder_raises_the_alert_again(client, db):
    create_moyuri(client)
    assign(client, "LAW-21")
    case = db.scalars(select(Case)).one()
    case.lawyer_last_update_at = utcnow() - timedelta(days=40)
    case.notices = {
        **case.notices,
        "lawyerReminder": {"lawyerId": "LAW-21", "at": (utcnow() - timedelta(days=15)).isoformat()},
    }
    db.commit()
    assert "alerts" in client.get(f"/dlao/cases/{REF}").json()["queues"]


def test_hearings_list_the_dates_lawyers_reported(client, db):
    create_moyuri(client)
    assign(client, "LAW-21")
    assert client.get("/dlao/hearings").json() == []
    post_update(client, {**UPDATE, "next_hearing_at": later(days=3)})
    [hearing] = client.get("/dlao/hearings").json()
    assert hearing["caseId"] == REF and hearing["kind"] == "court"
    assert hearing["place"] == UPDATE["court"] and hearing["lawyerId"] == "LAW-21"
    assert hearing["stage"] == "evidenceRecorded"
    assert client.get("/dlao/hearings", params={"days": 2}).json() == []
