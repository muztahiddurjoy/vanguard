from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select

from app.database import utcnow
from app.models import (
    AuditEntry,
    Case,
    MediationNotice,
    PartyRole,
    SafetyLevel,
    Track,
)
from app.models import case as case_model
from app.services import adnsms, mediation, safe_contact

DHAKA = ZoneInfo("Asia/Dhaka")
# A Tuesday afternoon, in office time.
TUESDAY = datetime(2026, 9, 29, 14, 30, tzinfo=DHAKA)
LAND = {
    "applicant": {
        "name": "Abdul Malek",
        "phone": "01819000560",
        "district": "Rangpur",
        "upazila": "Pirgachha",
        "village": "Kandi",
        "guardian_name": "Abdul Kader",
        "preferred_language": "en",
    },
    "narrative": "My cousins have occupied 22 decimals of my inherited farmland.",
    "respondent": {"name": "Abdul Jalil", "relation": "cousin"},
}
RESPONDENT_SIMS = ["01911000001", "01611000002"]


@pytest.fixture
def sms(monkeypatch) -> list[tuple[str, str]]:
    sent: list[tuple[str, str]] = []

    def fake_send(self, mobile: str, message: str) -> adnsms.SmsResult:
        sent.append((mobile, message))
        return adnsms.SmsResult(ok=True, dry_run=True)

    monkeypatch.setattr(adnsms.AdnSmsClient, "send", fake_send)
    return sent


def new_case(client, db, sms, body=LAND) -> Case:
    """A land dispute the officer sends to mediation; the respondent's SIMs are on record."""
    ref = client.post("/intake/web", json=body).json()["id"]
    case = db.scalars(select(Case).where(Case.application_id == ref)).one()
    assert case.track != Track.SENSITIVE
    respondent = case.party_with_role(PartyRole.RESPONDENT)
    assert respondent is not None
    respondent.registered_phones = RESPONDENT_SIMS
    respondent.guardian_name = "Abdul Gafur"
    respondent.village = "Latibpur"
    respondent.upazila = "Mithapukur"
    db.commit()
    sms.clear()  # the filer's receipt
    return case


def schedule(client, case: Case, at: datetime, **extra) -> dict:
    body = {"case_ref": case.display_id, "scheduled_for": at.isoformat(), "mode": "in_person"}
    r = client.post("/mediation/sessions", json={**body, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def test_both_parties_get_a_notice_with_its_number_and_the_helpline(client, db, sms):
    case = new_case(client, db, sms)
    session = schedule(client, case, TUESDAY)

    applicant, respondent = session["notices"]
    assert [applicant["role"], respondent["role"]] == ["applicant", "respondent"]
    assert applicant["status"] == respondent["status"] == "sent"
    assert (applicant["sentTo"], respondent["sentTo"]) == (1, 2)
    assert applicant["dryRun"] is True and applicant["reasons"] == []
    code_a, code_r = applicant["code"], respondent["code"]
    assert code_a != code_r and len(code_a) == 9 and code_a[4] == "-"

    place = "District Legal Aid Office, Rangpur (District Judge Court building)"
    assert (session["place"], session["placeBn"]) == (
        place,
        "জেলা লিগ্যাল এইড অফিস, রংপুর (জেলা জজ আদালত ভবন)",
    )
    assert session["attendance"] == {"applicant": None, "respondent": None}
    assert sms[0] == (
        "01819000560",
        f"Notice of a mediation meeting on case {case.display_id}. When: Tuesday 29 September "
        f"2026, 2:30 pm. Where: {place}. Notice number: {code_a}. Please bring your NID. For "
        "questions call 16430 and say the notice number. - District Legal Aid Office, Rangpur",
    )
    # The respondent's language was never asked: Bangla, with the date in Bangla.
    bangla = (
        f"মামলা {case.display_id}-এর মধ্যস্থতা সভার নোটিশ। সময়: মঙ্গলবার, ২৯ সেপ্টেম্বর ২০২৬, দুপুর ২:৩০। "
        f"স্থান: জেলা লিগ্যাল এইড অফিস, রংপুর (জেলা জজ আদালত ভবন)। নোটিশ নম্বর: {code_r}। আপনার এনআইডি "
        "সঙ্গে আনুন। কিছু জানতে 16430 নম্বরে ফোন করে নোটিশ নম্বরটি বলুন। - জেলা লিগ্যাল এইড অফিস, রংপুর"
    )
    assert sms[1:] == [("01911000001", bangla), ("01611000002", bangla)]

    audits = db.scalars(select(AuditEntry).where(AuditEntry.action == "mediation.notice")).all()
    assert [(a.details["role"], a.details["status"]) for a in audits] == [
        ("applicant", "sent"),
        ("respondent", "sent"),
    ]
    listed = client.get("/mediation/sessions", params={"case_ref": case.display_id}).json()
    assert listed == [session]


def test_notify_parties_false_sends_nothing_and_the_old_flag_still_asks(client, db, sms):
    case = new_case(client, db, sms)
    quiet = schedule(client, case, TUESDAY, notify_parties=False)
    assert quiet["notices"] == [] and sms == []
    loud = schedule(client, case, TUESDAY, notify_parties=False, notify_applicant=True)
    assert len(loud["notices"]) == 2 and len(sms) == 3


def test_a_restricted_applicant_gets_the_neutral_text_inside_the_window(
    client, db, sms, monkeypatch
):
    case = new_case(client, db, sms)
    assert case.applicant is not None
    case.applicant.safety_level = SafetyLevel.RESTRICTED
    case.applicant.safe_contact_windows = [{"day": 2, "start_hour": 14, "end_hour": 16}]
    db.commit()

    monkeypatch.setattr(safe_contact, "utcnow", lambda: TUESDAY - timedelta(days=7))
    session = schedule(client, case, TUESDAY)
    code = session["notices"][0]["code"]
    assert sms[0] == (
        "01819000560",
        f"Your appointment: Tuesday 29 September 2026, 2:30 pm. Your number: {code}. "
        "Call 16430 and say the number for details.",
    )
    for word in ("mediation", "case", "Legal Aid", case.display_id):
        assert word not in sms[0][1]
    sent = db.scalars(select(MediationNotice).where(MediationNotice.role == "applicant")).one()
    assert sent.details["variant"] == "neutral"

    # Outside the window nothing goes, and the dashboard says why.
    monkeypatch.setattr(safe_contact, "utcnow", lambda: TUESDAY + timedelta(days=1))
    blocked = schedule(client, case, TUESDAY)["notices"][0]
    assert blocked["status"] == "blocked" and blocked["reasons"] == ["outside_safe_window"]
    assert blocked["code"] is not None  # the officer can still hand it over


def test_the_respondent_notice_never_reaches_the_applicants_side(client, db, sms):
    case = new_case(client, db, sms)
    respondent = case.party_with_role(PartyRole.RESPONDENT)
    assert respondent is not None
    # A SIM registered under his NID that the applicant uses.
    respondent.registered_phones = ["01819000560", "01911000001"]
    db.commit()
    session = schedule(client, case, TUESDAY)
    assert [to for to, _ in sms] == ["01819000560", "01911000001"]
    assert sms[0][1].startswith("Notice of a mediation meeting")  # the applicant's own
    assert session["notices"][1]["sentTo"] == 1


def test_a_respondent_without_a_number_is_kept_as_not_found(client, db, sms):
    case = new_case(client, db, sms)
    respondent = case.party_with_role(PartyRole.RESPONDENT)
    assert respondent is not None
    respondent.registered_phones = []
    db.commit()
    notice = schedule(client, case, TUESDAY)["notices"][1]
    assert notice["status"] == "notFound" and notice["sentTo"] == 0
    assert notice["code"] is not None and notice["dryRun"] is None


@pytest.mark.parametrize(
    ("setup", "reasons"),
    [("sensitive", ["sensitive"]), ("doNotCall", ["doNotCall"])],
)
def test_notices_are_held_for_a_sensitive_or_do_not_call_case(client, db, sms, setup, reasons):
    case = new_case(client, db, sms)
    if setup == "sensitive":
        case.track = Track.SENSITIVE
    else:
        assert case.applicant is not None
        case.do_not_call_reason = "hostage"
        case.applicant.safety_level = SafetyLevel.NO_CONTACT
    db.commit()

    session = schedule(client, case, TUESDAY)
    assert sms == []
    for notice in session["notices"]:
        assert notice["status"] == "held" and notice["reasons"] == reasons
        assert notice["code"] is None  # nothing to give out, and nothing the helpline finds
    held = db.scalars(select(MediationNotice)).all()
    assert len(held) == 2 and all(n.code is None for n in held)
    audits = db.scalars(select(AuditEntry).where(AuditEntry.action == "mediation.notice")).all()
    assert [a.details["status"] for a in audits] == ["held", "held"]
    assert all(a.details["reasons"] == reasons for a in audits)


def test_notice_numbers_and_tracking_numbers_never_coincide(client, db, sms, monkeypatch):
    case = new_case(client, db, sms)
    token = int(case.tracking_token or "")
    # The draw repeats the case's tracking number first, then the applicant's notice number.
    draws = iter([token, 11112222, 11112222, 33334444, 33334444, 55556666])
    monkeypatch.setattr(case_model.secrets, "randbelow", lambda _n: next(draws))
    applicant, respondent = schedule(client, case, TUESDAY)["notices"]
    assert (applicant["code"], respondent["code"]) == ("1111-2222", "3333-4444")

    # A new application's tracking number skips a notice's number too.
    other = client.post("/intake/web", json=LAND).json()["id"]
    assert db.scalars(select(Case.tracking_token).where(Case.application_id == other)).one() == (
        "55556666"
    )


def test_codes_are_unique_across_many_notices(client, db, sms):
    case = new_case(client, db, sms)
    for days in range(5):
        schedule(client, case, TUESDAY + timedelta(days=days))
    codes = db.scalars(select(MediationNotice.code)).all()
    tokens = set(db.scalars(select(Case.tracking_token)).all())
    assert len(codes) == len(set(codes)) == 10 and not tokens & set(codes)


def test_written_dates_suit_an_sms(db):
    evening = datetime(2026, 10, 4, 18, 5, tzinfo=DHAKA)
    assert mediation.written_date(evening, "en") == "Sunday 4 October 2026, 6:05 pm"
    assert mediation.written_date(evening, "bn") == "রবিবার, ৪ অক্টোবর ২০২৬, সন্ধ্যা ৬:০৫"
    assert mediation.place_of("odr_phone") == ("By phone (the office will call)",
                                               "ফোনে (অফিস থেকে ফোন করা হবে)")  # fmt: skip


# --- attendance ------------------------------------------------------------------------


def attend(client, session_id: int, applicant: str, respondent: str, **extra):
    body = {"applicant": applicant, "respondent": respondent, **extra}
    return client.post(
        f"/mediation/sessions/{session_id}/attendance",
        json=body,
        headers={"X-Officer-Id": "DLAO-RGP-0142"},
    )


def past(days: int) -> datetime:
    return utcnow() - timedelta(days=days)


def test_attendance_marks_the_session_held_or_missed(client, db, sms):
    case = new_case(client, db, sms)
    first = schedule(client, case, past(14))
    r = attend(client, first["id"], "present", "present", notes="Both came; terms discussed.")
    assert r.status_code == 200, r.text
    view = r.json()
    assert view["status"] == "held" and view["notes"] == "Both came; terms discussed."
    assert view["attendance"] == {"applicant": "present", "respondent": "present"}
    assert len(view["notices"]) == 2  # the full SessionView

    # Recording it again replaces it.
    view = attend(client, first["id"], "present", "absent").json()
    assert view["status"] == "missed"
    assert view["attendance"] == {"applicant": "present", "respondent": "absent"}
    entries = db.scalars(select(AuditEntry).where(AuditEntry.action == "mediation.attendance"))
    last = entries.all()[-1]
    assert last.actor == "DLAO-RGP-0142"
    assert last.details == {"sessionId": first["id"], "applicant": "present",
                            "respondent": "absent", "status": "missed"}  # fmt: skip


def test_attendance_is_refused_before_the_session_or_once_cancelled(client, db, sms):
    case = new_case(client, db, sms)
    ahead = schedule(client, case, utcnow() + timedelta(days=2))
    r = attend(client, ahead["id"], "present", "present")
    assert r.status_code == 409 and r.json()["detail"] == "This session has not started yet"

    gone = schedule(client, case, past(3))
    client.post(f"/mediation/sessions/{gone['id']}/status", json={"status": "cancelled"})
    r = attend(client, gone["id"], "present", "present")
    assert r.status_code == 409 and r.json()["detail"] == "This session was cancelled"
    assert attend(client, 999, "present", "present").status_code == 404
    bad = client.post(f"/mediation/sessions/{gone['id']}/attendance", json={"applicant": "late"})
    assert bad.status_code == 422


def test_absences_in_a_row_flag_the_case_and_coming_resets_them(client, db, sms):
    case = new_case(client, db, sms)
    ref = case.display_id
    s1, s2, s3, s4 = (schedule(client, case, past(days))["id"] for days in (40, 30, 20, 10))

    attend(client, s1, "present", "absent")
    summary = client.get(f"/mediation/cases/{ref}").json()
    assert summary["missedInARow"] == {"applicant": 0, "respondent": 1}
    assert summary["noShowLimit"] == 2
    assert "mediationNoShow" not in client.get(f"/dlao/cases/{ref}").json()["flags"]

    attend(client, s2, "absent", "absent")
    summary = client.get(f"/mediation/cases/{ref}").json()
    assert summary["missedInARow"] == {"applicant": 1, "respondent": 2}
    assert "mediationNoShow" in client.get(f"/dlao/cases/{ref}").json()["flags"]

    # He came, so his count starts again; she has now missed two.
    attend(client, s3, "absent", "present")
    summary = client.get(f"/mediation/cases/{ref}").json()
    assert summary["missedInARow"] == {"applicant": 2, "respondent": 0}
    assert "mediationNoShow" in client.get(f"/dlao/cases/{ref}").json()["flags"]
    # Both came: nobody is at the limit any more, so the flag goes.
    attend(client, s4, "present", "present")
    summary = client.get(f"/mediation/cases/{ref}").json()
    assert summary["missedInARow"] == {"applicant": 0, "respondent": 0}
    assert "mediationNoShow" not in client.get(f"/dlao/cases/{ref}").json()["flags"]

    # Sessions come soonest first, each in full.
    assert [s["id"] for s in summary["sessions"]] == [s1, s2, s3, s4]
    assert [s["status"] for s in summary["sessions"]] == ["missed", "missed", "missed", "held"]
    assert summary["udcNotices"] == []  # nothing was scheduled after the misses


def test_a_cancelled_session_no_longer_counts(client, db, sms):
    case = new_case(client, db, sms)
    s1, s2 = (schedule(client, case, past(days))["id"] for days in (20, 10))
    attend(client, s1, "present", "absent")
    attend(client, s2, "present", "absent")
    ref = case.display_id
    assert "mediationNoShow" in client.get(f"/dlao/cases/{ref}").json()["flags"]
    client.post(f"/mediation/sessions/{s2}/status", json={"status": "cancelled"})
    summary = client.get(f"/mediation/cases/{ref}").json()
    assert summary["missedInARow"]["respondent"] == 1
    assert "mediationNoShow" not in client.get(f"/dlao/cases/{ref}").json()["flags"]


def test_case_summary_is_404_for_an_unknown_case(client):
    assert client.get("/mediation/cases/APP-2026-999").status_code == 404
