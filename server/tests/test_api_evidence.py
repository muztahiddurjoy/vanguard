"""Attaching a person's papers to their case, from whichever counter they reached.

A centre, a court and a jail may each add papers to the application they submitted, and
the officer to any case in their office. The rules are the same wherever the file comes
from, and one office's papers are never another's to read.
"""

import pytest

from app.services import adnsms
from tests.records_helpers import (
    CJM,
    NST,
    OFFICER,
    RCJ_DESK,
    admit,
    application,
    audit,
    check,
    fake_registry,
    register_case,
)
from tests.test_api_udc_applications import MTP, PGC, udc_application

# A one-page scan, small enough to keep in the test.
PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
KHATIAN = ("khatian.pdf", PDF, "application/pdf")
NID_SCAN = ("nid.txt", b"National ID card of Jalal Uddin, father Abdus Sattar", "text/plain")

TOO_BIG = "Files must be 10 MB or smaller"
WRONG_TYPE = "Upload a PDF, JPEG, PNG or text file"
SIGNATURE_NOT_EVIDENCE = "The applicant's signature is taken after e-KYC"


@pytest.fixture
def sms(monkeypatch) -> list[tuple[str, str]]:  # type: ignore[no-untyped-def]
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        adnsms.AdnSmsClient,
        "send",
        lambda self, mobile, message: (
            sent.append((mobile, message)),
            adnsms.SmsResult(ok=True, dry_run=True),
        )[1],
    )
    return sent


def attach(client, base: str, ref: str, headers: dict, file=KHATIAN, kind: str | None = None):  # type: ignore[no-untyped-def]
    data = {"kind": kind} if kind else None
    return client.post(f"{base}/{ref}/documents", files={"file": file}, data=data, headers=headers)


@pytest.fixture
def udc_case(client, monkeypatch, sms) -> str:  # type: ignore[no-untyped-def]
    fake_registry(monkeypatch)
    r = client.post("/udc/applications", json=udc_application(), headers=MTP)
    assert r.status_code == 201, r.text
    return str(r.json()["id"])


def test_a_centre_attaches_the_papers_the_person_brought(client, db, udc_case):
    r = attach(client, "/udc/applications", udc_case, MTP, KHATIAN, "land_record")
    assert r.status_code == 201, r.text
    stored = r.json()

    assert stored["document"]["kind"] == "land_record"
    assert len(stored["document"]["sha256"]) == 64
    # T6 rebuilds what the case still needs, so the entrepreneur knows what to ask for.
    assert isinstance(stored["checklist"], list) and isinstance(stored["missing"], list)

    listed = client.get(f"/udc/applications/{udc_case}/documents", headers=MTP).json()
    assert [d["filename"] for d in listed["documents"]] == ["khatian.pdf"]
    assert listed["documents"][0]["uploadedBy"] == "udc:UDC-MTP"
    assert listed["documents"][0]["withheld"] is False
    # What the dashboard must refuse before it sends anything.
    assert listed["limits"]["maxBytes"] == 10 * 1024 * 1024
    assert "application/pdf" in listed["limits"]["contentTypes"]

    # The ledger records the hash of the bytes that arrived.
    [entry] = audit(db, "document.uploaded")
    assert entry.actor == "udc:UDC-MTP"
    assert entry.details["sha256"] == stored["document"]["sha256"]

    # The count reaches the list the centre works from.
    [listed_app] = client.get("/udc/applications", headers=MTP).json()
    assert listed_app["evidence"] == 1


def test_the_file_can_be_read_back_but_only_by_the_centre_that_added_it(client, udc_case):
    document_id = attach(client, "/udc/applications", udc_case, MTP).json()["document"]["id"]

    r = client.get(f"/udc/applications/{udc_case}/documents/{document_id}/file", headers=MTP)
    assert r.status_code == 200
    assert r.content == PDF
    assert r.headers["content-type"] == "application/pdf"
    # Shown in the browser rather than downloaded blindly, under the name given.
    assert "inline" in r.headers["content-disposition"]
    assert "khatian.pdf" in r.headers["content-disposition"]

    for headers in (PGC, {}):
        assert client.get(
            f"/udc/applications/{udc_case}/documents/{document_id}/file", headers=headers
        ).status_code in (401, 404)
    assert attach(client, "/udc/applications", udc_case, PGC).status_code == 404


def test_a_file_id_from_another_case_is_not_found(client, monkeypatch, sms, udc_case):
    mine = attach(client, "/udc/applications", udc_case, MTP).json()["document"]["id"]

    other = client.post(
        "/udc/applications",
        json=udc_application(client_ref="3f1c2a9e-0000-4000-8000-00000000beef"),
        headers=MTP,
    )
    assert other.status_code == 201, other.text
    ref = other.json()["id"]
    r = client.get(f"/udc/applications/{ref}/documents/{mine}/file", headers=MTP)
    assert r.status_code == 404 and r.json()["detail"] == "No such file on this case"


def test_the_server_refuses_what_it_cannot_store(client, udc_case):
    base, ref = "/udc/applications", udc_case

    r = attach(client, base, ref, MTP, ("notes.docx", b"not a scan", "application/msword"))
    assert r.status_code == 415 and r.json()["detail"] == WRONG_TYPE

    r = attach(client, base, ref, MTP, ("big.pdf", b"%PDF-1.4\n" + b"x" * (10 * 1024 * 1024), "application/pdf"))  # fmt: skip
    assert r.status_code == 413 and r.json()["detail"] == TOO_BIG

    r = attach(client, base, ref, MTP, ("empty.pdf", b"", "application/pdf"))
    assert r.status_code == 422

    # A signature belongs to e-KYC and a draft to the office: neither is brought in.
    r = attach(client, base, ref, MTP, KHATIAN, "applicant_signature")
    assert r.status_code == 422 and r.json()["detail"] == SIGNATURE_NOT_EVIDENCE
    assert attach(client, base, ref, MTP, KHATIAN, "settlement_draft").status_code == 422
    assert attach(client, base, ref, MTP, KHATIAN, "court_order").status_code == 422

    assert client.get(f"{base}/{ref}/documents", headers=MTP).json()["documents"] == []


def test_a_signature_is_listed_apart_from_the_papers(client, monkeypatch, sms):
    fake_registry(monkeypatch)
    from tests.records_helpers import signature

    r = client.post(
        "/udc/applications",
        json=udc_application(ekyc_check_id=check(client, MTP)["checkId"], signature=signature()),
        headers=MTP,
    )
    ref = r.json()["id"]
    assert r.json()["signature"] is not None

    attach(client, "/udc/applications", ref, MTP, KHATIAN, "land_record")
    listed = client.get(f"/udc/applications/{ref}/documents", headers=MTP).json()["documents"]
    # The signature is stored, but it is not one of the person's papers.
    assert [d["kind"] for d in listed] == ["land_record"]
    assert client.get("/udc/applications", headers=MTP).json()[0]["evidence"] == 1


def test_a_court_attaches_to_its_own_application(client, monkeypatch):
    fake_registry(monkeypatch)
    court_case = register_case(client)
    body = application(court_case_id=court_case["id"], in_custody=True)
    ref = client.post("/court/applications", json=body, headers=CJM).json()["id"]

    r = attach(client, "/court/applications", ref, CJM, NID_SCAN, "nid_copy")
    assert r.status_code == 201, r.text
    listed = client.get(f"/court/applications/{ref}/documents", headers=CJM).json()
    assert listed["documents"][0]["uploadedBy"] == "court:CS-11"
    # Another court cannot read or add to it.
    assert client.get(f"/court/applications/{ref}/documents", headers=NST).status_code == 404
    assert attach(client, "/court/applications", ref, NST).status_code == 404


def test_a_jail_attaches_to_its_own_application(client, monkeypatch):
    fake_registry(monkeypatch)
    prisoner = admit(client)
    body = application(prisoner_id=prisoner["id"])
    ref = client.post("/prison/applications", json=body, headers=RCJ_DESK).json()["id"]

    r = attach(client, "/prison/applications", ref, RCJ_DESK, NID_SCAN, "nid_copy")
    assert r.status_code == 201, r.text
    listed = client.get(f"/prison/applications/{ref}/documents", headers=RCJ_DESK).json()
    assert [d["kind"] for d in listed["documents"]] == ["nid_copy"]


def test_the_officer_adds_papers_handed_in_at_the_office(client, db, udc_case):
    r = client.post(
        f"/dlao/cases/{udc_case}/documents",
        files={"file": KHATIAN},
        data={"kind": "land_record"},
        headers=OFFICER,
    )
    assert r.status_code == 201, r.text
    document_id = r.json()["document"]["id"]

    case = client.get(f"/dlao/cases/{udc_case}", headers=OFFICER).json()
    assert [d["id"] for d in case["documents"]] == [document_id]

    opened = client.get(f"/dlao/cases/{udc_case}/documents/{document_id}/file", headers=OFFICER)
    assert opened.status_code == 200 and opened.content == PDF
    # Opening a file is recorded, as revealing a sensitive case's file names is.
    assert [e.details["documentId"] for e in audit(db, "evidence.viewed")] == [document_id]
