from datetime import timedelta

import pytest
from sqlalchemy import select

from app.database import utcnow
from app.models import AuditEntry, Case, PartyRole, SafetyLevel, UdcNotice
from app.services import adnsms, mediation
from tests.test_mediation_notices import attend, new_case, past, schedule

MTP = {"X-Udc-Id": "UDC-MTP"}  # Mithapukur, where the respondent lives
PGC = {"X-Udc-Id": "UDC-PGC"}  # Pirgachha, where the applicant lives
OFFICER = {"X-Officer-Id": "DLAO-RGP-0142"}
UDC_PHONES = {"01700000102", "01700000103"}


@pytest.fixture
def sms(monkeypatch) -> list[tuple[str, str]]:
    sent: list[tuple[str, str]] = []

    def fake_send(self, mobile: str, message: str) -> adnsms.SmsResult:
        sent.append((mobile, message))
        return adnsms.SmsResult(ok=True, dry_run=True)

    monkeypatch.setattr(adnsms.AdnSmsClient, "send", fake_send)
    return sent


def to_udcs(sms: list[tuple[str, str]]) -> list[tuple[str, str]]:
    return [(to, text) for to, text in sms if to in UDC_PHONES]


def missed_twice(client, case: Case, applicant: str = "present") -> None:
    """The respondent (and, if asked, the applicant) missed the last two sessions."""
    for days in (20, 10):
        session = schedule(client, case, past(days))
        attend(client, session["id"], applicant, "absent")


def test_the_next_session_after_two_misses_asks_the_udc(client, db, sms):
    case = new_case(client, db, sms)
    missed_twice(client, case)
    assert to_udcs(sms) == []  # nothing was scheduled yet

    at = utcnow() + timedelta(days=7)
    session = schedule(client, case, at)
    [(to, text)] = to_udcs(sms)
    assert to == "01700000102"
    assert text == (
        f"জেলা লিগ্যাল এইড অফিস, রংপুর: অনুগ্রহ করে Abdul Jalil (পিতা Abdul Gafur, গ্রাম Latibpur)-কে "
        f"সরাসরি জানান, মামলা {case.display_id}-এর পরবর্তী মধ্যস্থতা সভা "
        f"{mediation.written_date(at, 'bn')}। স্থান: জেলা লিগ্যাল এইড অফিস, রংপুর (জেলা জজ আদালত ভবন)। "
        "জানানো হলে অফিসকে জানান।"
    )
    assert "farmland" not in text and case.summary not in text

    [notice] = client.get(f"/mediation/cases/{case.display_id}").json()["udcNotices"]
    assert notice["status"] == "sent" and notice["reasons"] == []
    assert notice["role"] == "respondent" and notice["missedInARow"] == 2
    assert notice["caseRef"] == case.display_id
    assert notice["party"] == {"name": "Abdul Jalil", "nameBn": None, "fatherName": "Abdul Gafur",
                               "village": "Latibpur", "upazila": "Mithapukur"}  # fmt: skip
    assert notice["udc"]["id"] == "UDC-MTP" and notice["udc"]["entrepreneur"] == "Rehana Parvin"
    assert notice["session"]["id"] == session["id"]
    assert notice["session"]["place"].startswith("District Legal Aid Office")
    assert notice["informedAt"] is None and notice["informedNote"] is None

    [logged] = db.scalars(select(AuditEntry).where(AuditEntry.action == "udc.notified")).all()
    assert logged.details["udcId"] == "UDC-MTP" and logged.details["dryRun"] is True
    assert "Jalil" not in str(logged.details) and "Latibpur" not in str(logged.details)


def test_attendance_asks_the_udc_when_the_next_session_is_already_set(client, db, sms):
    case = new_case(client, db, sms)
    ahead = schedule(client, case, utcnow() + timedelta(days=5))
    first, second = (schedule(client, case, past(days))["id"] for days in (20, 10))
    attend(client, first, "present", "absent")
    assert to_udcs(sms) == []
    attend(client, second, "present", "absent")
    assert [to for to, _ in to_udcs(sms)] == ["01700000102"]
    [notice] = db.scalars(select(UdcNotice)).all()
    assert notice.session_id == ahead["id"] and notice.status == "sent"

    # Once per session and party: recording it again asks nobody twice.
    attend(client, second, "present", "absent")
    assert len(to_udcs(sms)) == 1 and len(db.scalars(select(UdcNotice)).all()) == 1


def test_a_party_who_keeps_missing_is_looked_for_again_for_each_new_session(client, db, sms):
    case = new_case(client, db, sms)
    missed_twice(client, case)
    schedule(client, case, utcnow() + timedelta(days=3))
    schedule(client, case, utcnow() + timedelta(days=10))
    notices = client.get(f"/mediation/cases/{case.display_id}").json()["udcNotices"]
    assert len(notices) == 2 and len(to_udcs(sms)) == 2
    # Newest first.
    assert notices[0]["session"]["scheduledFor"] > notices[1]["session"]["scheduledFor"]


def test_an_applicant_at_risk_is_not_named_to_a_udc_until_an_officer_says_so(client, db, sms):
    case = new_case(client, db, sms)
    assert case.applicant is not None
    case.applicant.safety_level = SafetyLevel.CAUTION
    db.commit()
    missed_twice(client, case, applicant="absent")
    schedule(client, case, utcnow() + timedelta(days=7))

    notices = client.get(f"/mediation/cases/{case.display_id}").json()["udcNotices"]
    held = next(n for n in notices if n["role"] == "applicant")
    sent = next(n for n in notices if n["role"] == "respondent")
    assert held["status"] == "held" and held["reasons"] == ["applicantSafety"]
    assert held["udc"]["id"] == "UDC-PGC"
    assert sent["status"] == "sent"
    assert [to for to, _ in to_udcs(sms)] == ["01700000102"]  # the respondent's UDC only
    entry = db.scalars(select(AuditEntry).where(AuditEntry.action == "notice.held")).all()[-1]
    assert entry.details["notice"] == "udc" and entry.details["reasons"] == ["applicantSafety"]

    # The applicant's UDC does not see it, and cannot act on it.
    assert client.get("/udc/notices", headers=PGC).json() == []
    informed = client.post(f"/udc/notices/{held['id']}/informed", json={}, headers=PGC)
    assert informed.status_code == 404

    url = f"/mediation/udc-notices/{held['id']}/release"
    assert client.post(url, json={"justification": "ok"}, headers=OFFICER).status_code == 422
    why = "She moved to her parents' home; the UDC there is safe to use."
    released = client.post(url, json={"justification": why}, headers=OFFICER)
    assert released.status_code == 200, released.text
    assert released.json()["status"] == "sent" and released.json()["reasons"] == []
    assert [to for to, _ in to_udcs(sms)] == ["01700000102", "01700000103"]
    assert "Abdul Malek (পিতা Abdul Kader, গ্রাম Kandi)" in to_udcs(sms)[1][1]
    entry = db.scalars(select(AuditEntry).where(AuditEntry.action == "udc.released")).one()
    assert (entry.actor, entry.justification) == ("DLAO-RGP-0142", why)
    assert db.get(UdcNotice, held["id"]).released_by == "DLAO-RGP-0142"

    assert client.post(url, json={"justification": why}).status_code == 409
    missing = client.post("/mediation/udc-notices/999/release", json={"justification": why})
    assert missing.status_code == 404
    assert [n["id"] for n in client.get("/udc/notices", headers=PGC).json()] == [held["id"]]


def test_no_udc_for_the_upazila(client, db, sms):
    case = new_case(client, db, sms)
    respondent = case.party_with_role(PartyRole.RESPONDENT)
    assert respondent is not None
    respondent.upazila = "Savar"
    db.commit()
    missed_twice(client, case)
    schedule(client, case, utcnow() + timedelta(days=7))
    [notice] = client.get(f"/mediation/cases/{case.display_id}").json()["udcNotices"]
    assert notice["status"] == "noUdc" and notice["udc"] is None and notice["reasons"] == []
    assert to_udcs(sms) == []

    respondent.upazila = None
    db.commit()
    schedule(client, case, utcnow() + timedelta(days=14))
    newest = client.get(f"/mediation/cases/{case.display_id}").json()["udcNotices"][0]
    assert newest["status"] == "noUdc" and newest["reasons"] == ["noUpazila"]


def test_a_udc_signs_in_with_its_id(client):
    assert client.get("/udc/me").status_code == 401
    r = client.get("/udc/me", headers={"X-Udc-Id": "UDC-XYZ"})
    assert r.status_code == 401 and r.json()["detail"] == "Sign in with a UDC ID (X-Udc-Id)"
    me = client.get("/udc/me", headers={"X-Udc-Id": "udc-mtp"}).json()
    assert me == {"id": "UDC-MTP", "name": "Latibpur Union Digital Centre",
                  "nameBn": "লতিবপুর ইউনিয়ন ডিজিটাল সেন্টার", "upazila": "Mithapukur",
                  "upazilaBn": "মিঠাপুকুর", "entrepreneur": "Rehana Parvin",
                  "entrepreneurBn": "রেহানা পারভীন"}  # fmt: skip


def test_a_udc_sees_its_own_notices_and_reports_that_it_told_them(client, db, sms):
    case = new_case(client, db, sms)
    missed_twice(client, case)
    schedule(client, case, utcnow() + timedelta(days=7))
    [notice] = client.get("/udc/notices", headers=MTP).json()
    assert notice["party"]["name"] == "Abdul Jalil" and notice["status"] == "sent"
    assert client.get("/udc/notices", headers=PGC).json() == []

    url = f"/udc/notices/{notice['id']}/informed"
    assert client.post(url, json={}, headers=PGC).status_code == 404  # another centre's
    assert client.post(url, json={"note": "x" * 501}, headers=MTP).status_code == 422
    r = client.post(url, json={"note": "Told him at his shop; he will come."}, headers=MTP)
    assert r.status_code == 200, r.text
    done = r.json()
    assert done["status"] == "informed" and done["informedAt"] is not None
    assert done["informedNote"] == "Told him at his shop; he will come."
    assert client.post(url, json={}, headers=MTP).status_code == 409
    assert client.post("/udc/notices/999/informed", json={}, headers=MTP).status_code == 404

    entry = db.scalars(select(AuditEntry).where(AuditEntry.action == "udc.informed")).one()
    assert entry.actor == "udc:UDC-MTP" and entry.details["withNote"] is True
    assert "shop" not in str(entry.details)
    officer_view = client.get(f"/mediation/cases/{case.display_id}").json()["udcNotices"][0]
    assert officer_view["status"] == "informed"
    assert client.get("/udc/notices", headers=MTP).json()[0]["status"] == "informed"
    assert client.get("/dlao/audit/verify").json()["ok"] is True


def test_a_udc_sms_that_fails_is_still_on_the_udcs_list(client, db, monkeypatch):
    def failing(self, mobile: str, message: str) -> adnsms.SmsResult:
        if mobile in UDC_PHONES:
            return adnsms.SmsResult(ok=False, dry_run=False, error="HTTP 500")
        return adnsms.SmsResult(ok=True, dry_run=True)

    monkeypatch.setattr(adnsms.AdnSmsClient, "send", failing)
    case = new_case(client, db, [])
    missed_twice(client, case)
    schedule(client, case, utcnow() + timedelta(days=7))
    [notice] = client.get("/udc/notices", headers=MTP).json()
    assert notice["status"] == "failed" and notice["reasons"] == ["smsFailed"]
