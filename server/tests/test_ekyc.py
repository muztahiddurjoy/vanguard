"""e-KYC by court and jail staff: an NID and date of birth against the NID registry."""

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.database import utcnow
from app.models import EkycCheck
from app.services.ekyc import normalize_nid
from tests.records_helpers import (
    CJM,
    JALAL_NID,
    NST,
    RCJ,
    admit,
    audit,
    check,
    fake_registry,
)


def test_nid_is_read_as_digits_in_either_script():
    assert normalize_nid("2854 106-397") == JALAL_NID
    assert normalize_nid("২৮৫৪১০৬৩৯৭") == JALAL_NID
    assert len(normalize_nid("19901234567890123")) == 17
    for bad in ("285410639", "28541063971", "2854106397x", "", "abc"):
        with pytest.raises(ValueError):
            normalize_nid(bad)


def test_verified_check_returns_the_registry_record_without_the_nid(client, db, monkeypatch):
    fake_registry(monkeypatch)
    r = client.post(
        "/court/ekyc",
        json={"nid": "২৮৫৪ ১০৬ ৩৯৭", "date_of_birth": "1990-06-05", "name": "Jalal Uddin"},
        headers=CJM,
    )
    assert r.status_code == 200, r.text
    assert JALAL_NID not in r.text
    out = r.json()
    assert out["status"] == "verified" and len(out["checkId"]) == 32
    person = out["person"]
    assert person["name"] == "Jalal Uddin" and person["nameBn"] == "জালাল উদ্দিন"
    assert person["fatherName"] == "Abdus Sattar" and person["fatherNameBn"] == "আব্দুস সাত্তার"
    assert person["dateOfBirth"] == "1990-06-05" and person["nidLast4"] == "6397"
    assert person["upazila"] == "Pirgachha" and person["age"] >= 36

    stored = db.scalars(select(EkycCheck)).one()
    assert stored.office_kind == "court" and stored.office_id == "RNG-CJM"
    assert stored.performed_by == "court:CS-11"
    assert stored.citizen["nid"] == JALAL_NID  # kept to fill the application, never returned
    [entry] = audit(db, "ekyc.checked")
    assert entry.details == {"result": "verified", "nidLast4": "6397", "office": "RNG-CJM"}
    assert JALAL_NID not in str(entry.details)


@pytest.mark.parametrize(
    "body",
    [
        {"nid": JALAL_NID, "date_of_birth": "1990-06-06"},  # wrong date of birth
        {"nid": JALAL_NID, "date_of_birth": "1990-06-05", "name": "Sohel Rana"},  # wrong name
        {"nid": "1234567890", "date_of_birth": "1990-06-05"},  # no such NID
    ],
)
def test_not_matched_never_says_which_detail_failed(client, monkeypatch, body):
    fake_registry(monkeypatch)
    r = client.post("/prison/ekyc", json=body, headers=RCJ)
    assert r.status_code == 200
    out = r.json()
    assert set(out) == {"checkId", "status", "person"}
    assert out["status"] == "notMatched" and out["person"] is None
    assert body["nid"] not in r.text


def test_unavailable_without_a_registry_or_when_it_is_down(client, db, monkeypatch):
    # NID_SERVER_URL is empty in tests: there is no registry to ask.
    out = check(client, CJM)
    assert out == {"checkId": None, "status": "unavailable", "person": None}
    fake_registry(monkeypatch, down=True)
    assert check(client, CJM)["status"] == "unavailable"
    assert [e.details["result"] for e in audit(db, "ekyc.checked")] == ["unavailable"] * 2


def test_bad_nid_is_rejected_without_echoing_it(client, monkeypatch):
    fake_registry(monkeypatch)
    r = client.post("/court/ekyc", json={"nid": "28541063971", "date_of_birth": "1990-06-05"},
                    headers=CJM)  # fmt: skip
    assert r.status_code == 422
    assert "28541063971" not in r.text
    # A missing field reports the whole body as its input in FastAPI's own errors.
    r = client.post("/court/ekyc", json={"nid": JALAL_NID}, headers=CJM)
    assert r.status_code == 422 and JALAL_NID not in r.text
    assert r.json()["detail"][0]["loc"] == ["body", "date_of_birth"]


def test_staff_must_sign_in(client):
    body = {"nid": JALAL_NID, "date_of_birth": "1990-06-05"}
    assert client.post("/court/ekyc", json=body).status_code == 401
    assert client.post("/court/ekyc", json=body, headers=RCJ).status_code == 401
    assert client.post("/prison/ekyc", json=body, headers=CJM).status_code == 401


def test_a_check_is_used_once(client, monkeypatch):
    fake_registry(monkeypatch)
    check_id = check(client, RCJ)["checkId"]
    admit(client, ekyc_check_id=check_id)
    r = client.post(
        "/prison/prisoners",
        json={"prisoner_no": "RCJ-2026-9999", "name": "Jalal Uddin", "admitted_on": "2026-06-15",
              "ekyc_check_id": check_id},
        headers=RCJ,
    )  # fmt: skip
    assert r.status_code == 409
    assert r.json()["detail"] == "This e-KYC check has expired or was already used"


def test_a_check_expires(client, db, monkeypatch):
    fake_registry(monkeypatch)
    check_id = check(client, RCJ)["checkId"]
    stored = db.scalars(select(EkycCheck)).one()
    stored.created_at = utcnow() - timedelta(minutes=121)
    db.commit()
    r = client.post("/prison/prisoners",
                    json={"prisoner_no": "X-1", "name": "Jalal", "admitted_on": "2026-06-15",
                          "ekyc_check_id": check_id}, headers=RCJ)  # fmt: skip
    assert r.status_code == 409


def test_another_offices_check_cannot_be_used(client, monkeypatch):
    fake_registry(monkeypatch)
    court_check = check(client, CJM)["checkId"]
    other_court = check(client, NST)["checkId"]
    body = {"prisoner_no": "X-1", "name": "Jalal", "admitted_on": "2026-06-15"}
    for check_id in (court_check, other_court, "not-a-check"):
        r = client.post("/prison/prisoners", json={**body, "ekyc_check_id": check_id},
                        headers=RCJ)  # fmt: skip
        assert r.status_code == 409


def test_a_not_matched_check_cannot_be_used(client, monkeypatch):
    fake_registry(monkeypatch)
    failed = check(client, RCJ, dob="1991-01-01")
    assert failed["status"] == "notMatched" and failed["checkId"]
    r = client.post("/prison/prisoners",
                    json={"prisoner_no": "X-1", "name": "Jalal", "admitted_on": "2026-06-15",
                          "ekyc_check_id": failed["checkId"]}, headers=RCJ)  # fmt: skip
    assert r.status_code == 409
