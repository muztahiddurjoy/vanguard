"""A Union Digital Centre files for a neighbour, and attaches the papers they brought.

The centre is the one channel that reaches someone who cannot read the forms or use a
phone app, so these tests cover what makes it different from a court or a jail: the
applicant is standing at the counter with their own phone, nobody is in custody, and
the reason someone else is filing is recorded.
"""

import pytest
from sqlalchemy import select

from app.models import Case, Party
from app.services import adnsms
from tests.records_helpers import (
    CJM,
    JALAL_NID,
    OFFICER,
    application,
    audit,
    check,
    fake_registry,
    signature,
)

MTP = {"X-Udc-Id": "UDC-MTP"}  # Latibpur centre, Mithapukur
PGC = {"X-Udc-Id": "UDC-PGC"}  # Tambulpur centre, Pirgachha
PHONE = "01712345678"

CENTRE_FILES = "A Union Digital Centre files for a neighbour, not about a court case or a prisoner"
CUSTODY_ELSEWHERE = "Someone in custody applies through the court or the jail holding them"


@pytest.fixture
def sms(monkeypatch) -> list[tuple[str, str]]:  # type: ignore[no-untyped-def]
    sent: list[tuple[str, str]] = []

    def fake_send(self, mobile: str, message: str) -> adnsms.SmsResult:  # type: ignore[no-untyped-def]
        sent.append((mobile, message))
        return adnsms.SmsResult(ok=True, dry_run=True)

    monkeypatch.setattr(adnsms.AdnSmsClient, "send", fake_send)
    return sent


def udc_application(**fields: object) -> dict:
    """What the dashboard sends: a neighbour who cannot read, and their own phone."""
    body = application(**fields)
    body["applicant"] = {
        **body["applicant"],
        "phone": PHONE,
        "accessibility_flags": ["low_literacy"],
    }
    body["help_needed"] = "family"
    body["narrative"] = "Her husband has stopped paying maintenance for their two children."
    return body


def submit(client, headers: dict = MTP, **fields: object) -> dict:  # type: ignore[no-untyped-def]
    r = client.post("/udc/applications", json=udc_application(**fields), headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_the_centre_files_for_a_neighbour_and_she_is_sent_the_tracking_number(
    client, db, monkeypatch, sms
):
    fake_registry(monkeypatch)
    check_id = check(client, MTP)["checkId"]
    status = submit(client, ekyc_check_id=check_id, signature=signature())

    assert JALAL_NID not in str(status)
    assert status["id"].startswith("APP-")
    # The entrepreneur is who acted, not the centre's own ID as a name.
    assert status["submittedBy"] == {
        "id": "UDC-MTP",
        "name": "Rehana Parvin",
        "nameBn": "রেহানা পারভীন",
    }
    assert status["helpNeeded"] == "family" and status["inCustody"] is False
    assert status["identity"]["verified"] is True and status["identity"]["nidLast4"] == "6397"
    assert status["signature"]["by"] == "udc:UDC-MTP"
    assert status["stage"] == "received"
    # Not a court's case and not a jail's prisoner: a centre has neither.
    assert status["courtCase"] is None and status["prisoner"] is None

    # She has a phone, so the tracking number reaches her by SMS rather than by hand.
    assert status["applicant"]["hasPhone"] is True
    assert status["applicant"]["accessibilityFlags"] == ["low_literacy"]
    assert status["noticeToApplicant"]["status"] == "sent"
    assert [to for to, _ in sms] == [PHONE]
    assert status["trackingToken"].replace("-", "") in sms[0][1].replace("-", "")

    case = db.scalars(select(Case)).one()
    assert case.channel == "udc"
    applicant = db.scalars(select(Party).where(Party.name == "Jalal Uddin")).one()
    assert applicant.provenance == "udc_operator" and applicant.phone == PHONE


def test_without_a_phone_the_centre_hands_the_number_over_itself(client, monkeypatch, sms):
    fake_registry(monkeypatch)
    body = udc_application(ekyc_check_id=check(client, MTP)["checkId"])
    body["applicant"]["phone"] = None
    body["applicant"]["accessibility_flags"] = ["low_literacy", "no_own_phone"]

    r = client.post("/udc/applications", json=body, headers=MTP)
    assert r.status_code == 201, r.text
    status = r.json()

    assert status["applicant"]["hasPhone"] is False
    assert status["noticeToApplicant"] == {
        "status": "handedOver",
        "via": "udc",
        "at": status["noticeToApplicant"]["at"],
    }
    assert sms == []
    # The centre reads the number out, so it must still come back in the answer.
    assert len(status["trackingToken"]) == 9


def test_a_centre_cannot_claim_custody_or_a_court_record(client, monkeypatch):
    fake_registry(monkeypatch)
    r = client.post("/udc/applications", json=udc_application(in_custody=True), headers=MTP)
    assert r.status_code == 422 and r.json()["detail"] == CUSTODY_ELSEWHERE

    r = client.post("/udc/applications", json=udc_application(court_case_id=1), headers=MTP)
    assert r.status_code == 422 and r.json()["detail"] == CENTRE_FILES

    r = client.post("/udc/applications", json=udc_application(prisoner_id=1), headers=MTP)
    assert r.status_code == 422 and r.json()["detail"] == CENTRE_FILES


def test_a_centre_sees_only_its_own_applications(client, monkeypatch, sms):
    fake_registry(monkeypatch)
    mine = submit(client, MTP)

    assert [a["id"] for a in client.get("/udc/applications", headers=MTP).json()] == [mine["id"]]
    assert client.get("/udc/applications", headers=PGC).json() == []
    # Another centre's application is not even confirmed to exist.
    assert client.get(f"/udc/applications/{mine['id']}", headers=PGC).status_code == 404
    # Nor is a court's, and nor is the centre's to the court.
    assert client.get(f"/court/applications/{mine['id']}", headers=CJM).status_code == 404


def test_sending_the_same_application_twice_files_it_once(client, monkeypatch, sms):
    fake_registry(monkeypatch)
    first = submit(client, MTP)
    again = client.post("/udc/applications", json=udc_application(), headers=MTP)
    assert again.status_code == 200
    assert again.json()["id"] == first["id"]
    assert len(client.get("/udc/applications", headers=MTP).json()) == 1
    # And she is not sent a second SMS about the same case.
    assert [to for to, _ in sms] == [PHONE]


def test_an_unknown_centre_cannot_file(client, monkeypatch):
    fake_registry(monkeypatch)
    r = client.post("/udc/applications", json=udc_application(), headers={"X-Udc-Id": "UDC-NOPE"})
    assert r.status_code == 401
    assert client.get("/udc/applications").status_code == 401


def test_the_centre_verifies_and_signs_after_filing(client, monkeypatch, sms):
    fake_registry(monkeypatch)
    status = submit(client, MTP)
    assert status["identity"]["verified"] is False

    # A signature is refused until the registry has confirmed who signed.
    r = client.post(f"/udc/applications/{status['id']}/signature", json=signature(), headers=MTP)
    assert r.status_code == 409

    check_id = check(client, MTP)["checkId"]
    verified = client.post(
        f"/udc/applications/{status['id']}/ekyc", json={"check_id": check_id}, headers=MTP
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["identity"]["verified"] is True

    signed = client.post(
        f"/udc/applications/{status['id']}/signature", json=signature(), headers=MTP
    )
    assert signed.status_code == 200, signed.text
    assert signed.json()["signature"]["by"] == "udc:UDC-MTP"


def test_one_centres_ekyc_check_is_no_use_to_another(client, monkeypatch, sms):
    fake_registry(monkeypatch)
    check_id = check(client, PGC)["checkId"]
    r = client.post("/udc/applications", json=udc_application(ekyc_check_id=check_id), headers=MTP)
    assert r.status_code == 409


def test_the_officer_sees_which_centre_filed(client, db, monkeypatch, sms):
    fake_registry(monkeypatch)
    status = submit(client, MTP)

    case = client.get(f"/dlao/cases/{status['id']}", headers=OFFICER).json()
    assert case["submittedBy"]["kind"] == "udc"
    assert case["submittedBy"]["officeName"] == "Latibpur Union Digital Centre"
    assert case["submittedBy"]["staffName"] == "Rehana Parvin"
    # The ledger names the centre, so the officer can see who filed what.
    assert any(e.actor == "udc:UDC-MTP" for e in audit(db, "case.created"))


def test_the_roster_of_centres_is_public_to_a_signed_in_centre(client):
    centres = client.get("/udc/centres", headers=MTP).json()
    assert len(centres) == 8
    assert {"id": "UDC-MTP", "name": "Latibpur Union Digital Centre"}.items() <= centres[1].items()
    # A centre's own record says who runs it.
    assert client.get("/udc/me", headers=MTP).json()["entrepreneur"] == "Rehana Parvin"
