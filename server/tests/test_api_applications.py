"""Legal aid applications a court or a jail submits, as the office and the DLAO see them."""

import base64

from sqlalchemy import select

from app.models import Case, Document, EkycCheck, InstitutionApplication, Party
from tests.records_helpers import (
    CJM,
    JALAL_NID,
    NDJ,
    NST,
    PNG,
    RCJ,
    RCJ_DESK,
    SOHEL_NID,
    admit,
    application,
    audit,
    check,
    fake_registry,
    register_case,
    signature,
)

SIGN_FIRST = "Verify the applicant's identity (e-KYC) before adding their signature"


def submit_from_court(client, monkeypatch, **fields):  # type: ignore[no-untyped-def]
    fake_registry(monkeypatch)
    court_case = register_case(client)
    check_id = check(client, CJM)["checkId"]
    body = application(court_case_id=court_case["id"], in_custody=True, ekyc_check_id=check_id,
                       signature=signature(), **fields)  # fmt: skip
    r = client.post("/court/applications", json=body, headers=CJM)
    assert r.status_code == 201, r.text
    return court_case, r


def test_a_court_submits_a_verified_signed_application(client, db, monkeypatch):
    court_case, r = submit_from_court(client, monkeypatch)
    assert JALAL_NID not in r.text
    status = r.json()
    assert status["id"].startswith("APP-") and status["applicationId"] == status["id"]
    assert len(status["trackingToken"]) == 9 and status["trackingToken"][4] == "-"
    assert status["submittedBy"] == {"id": "CS-11", "name": "Md. Abdul Hakim",
                                     "nameBn": "মো. আব্দুল হাকিম"}  # fmt: skip
    # Details come from the registry, not the form.
    assert status["applicant"] == {"name": "Jalal Uddin", "nameBn": "জালাল উদ্দিন"}
    assert status["helpNeeded"] == "defence" and status["inCustody"] is True
    assert status["identity"]["verified"] is True and status["identity"]["method"] == "ekyc"
    assert status["identity"]["nidLast4"] == "6397" and status["identity"]["verifiedAt"]
    assert status["signature"]["by"] == "court:CS-11"
    assert status["stage"] == "received" and status["lawyer"] is None
    assert status["courtCase"] == {"id": court_case["id"], "caseNumber": "G.R. 455/2026",
                                   "court": court_case["court"]}  # fmt: skip
    assert status["prisoner"] is None

    case = db.scalars(select(Case)).one()
    assert case.channel == "court" and case.category == "criminalDefence"
    assert "inCustody" in case.flags and case.priority in ("critical", "high")
    assert (
        case.notices["filer"]["status"] == "handedOver" and case.notices["filer"]["via"] == "court"
    )
    assert "respondent" not in case.notices  # no SMS to anyone
    applicant = db.get(Party, case.applicant.id)
    assert applicant.nid_verified and applicant.provenance == "court_referral"
    assert applicant.accessibility_flags == ["no_own_phone"] and applicant.phone is None
    assert db.scalars(select(EkycCheck)).one().used_for_case_id == case.id
    [doc] = db.scalars(select(Document)).all()
    assert doc.kind == "applicant_signature" and doc.content_type == "image/png"
    assert doc.extracted_text is None  # T6 does not read it

    assert [e.actor for e in audit(db, "case.created")] == ["court:CS-11"]
    [linked] = audit(db, "record.linked")
    assert linked.details == {"courtCaseId": court_case["id"]}
    [signed] = audit(db, "signature.uploaded")
    assert signed.details["sha256"] == doc.sha256 and signed.details["ekycCheckId"]
    assert audit(db, "identity.checked")[0].details["callerVerifiedBy"] == "ekyc"


def test_the_dlao_sees_who_submitted_it_and_how_they_were_verified(client, monkeypatch):
    submit_from_court(client, monkeypatch)
    [listed] = client.get("/dlao/cases").json()
    assert listed["channel"] == "court"
    assert listed["submittedBy"] == {
        "kind": "court", "officeId": "RNG-CJM",
        "officeName": "Chief Judicial Magistrate Court, Rangpur",
        "officeNameBn": "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
        "staffName": "Md. Abdul Hakim", "staffNameBn": "মো. আব্দুল হাকিম",
    }  # fmt: skip
    r = client.get(f"/dlao/cases/{listed['id']}", headers={"X-Officer-Id": "DLAO-RNG-01"})
    assert JALAL_NID not in r.text
    detail = r.json()
    assert detail["identity"]["callerVerified"] is True
    assert detail["identity"]["callerVerifiedBy"] == "ekyc"
    assert detail["applicant"]["nidVerified"] is True
    assert "inCustody" in detail["flags"] and detail["category"] == "criminalDefence"
    assert [d["kind"] for d in detail["documents"]] == ["applicant_signature"]
    signature = detail["documents"][0]
    assert len(signature["sha256"]) == 64 and signature["createdAt"]
    # Not from a court or a jail: no one submitted it on the applicant's behalf.
    client.post("/intake/web", json={
        "applicant": {"name": "Abdul Malek", "phone": "01819000560", "district": "Rangpur"},
        "narrative": "My employer has not paid my wages for three months.",
    })  # fmt: skip
    views = {c["channel"]: c for c in client.get("/dlao/cases").json()}
    assert views["online"]["submittedBy"] is None


def test_custody_raises_a_low_priority_to_high_and_is_audited(client, db, monkeypatch):
    fake_registry(monkeypatch)
    body = application(in_custody=True, help_needed="other",
                       narrative="He would like advice about a document he was asked to sign.")  # fmt: skip
    r = client.post("/court/applications", json=body, headers=CJM)
    assert r.status_code == 201, r.text
    case = db.scalars(select(Case)).one()
    assert case.priority == "high" and case.category != "criminalDefence"
    assert case.due_at is not None
    reasons = [e.details.get("reason") for e in audit(db, "triage.generated")]
    assert "applicant in custody" in reasons


def test_a_signature_needs_ekyc_first(client, db, monkeypatch):
    fake_registry(monkeypatch)
    body = application(signature=signature())
    r = client.post("/court/applications", json=body, headers=CJM)
    assert r.status_code == 409 and r.json()["detail"] == SIGN_FIRST
    assert db.scalars(select(Case)).all() == []  # nothing half-made

    r = client.post("/court/applications", json=application(), headers=CJM)
    ref = r.json()["id"]
    assert r.json()["identity"] == {"verified": False, "method": None, "verifiedAt": None,
                                    "nidLast4": None}  # fmt: skip
    later = client.post(f"/court/applications/{ref}/signature", json=signature(), headers=CJM)
    assert later.status_code == 409 and later.json()["detail"] == SIGN_FIRST


def test_signature_type_size_and_encoding(client, monkeypatch):
    fake_registry(monkeypatch)
    ref = client.post("/court/applications", json=application(), headers=CJM).json()["id"]
    check_id = check(client, CJM)["checkId"]
    assert client.post(f"/court/applications/{ref}/ekyc", json={"check_id": check_id},
                       headers=CJM).status_code == 200  # fmt: skip
    path = f"/court/applications/{ref}/signature"
    assert client.post(path, json=signature(content_type="application/pdf"),
                       headers=CJM).status_code == 415  # fmt: skip
    # Said to be a PNG, but it is not one.
    assert client.post(path, json=signature(b"GIF89a..."), headers=CJM).status_code == 415
    big = PNG + b"0" * (2 * 1024 * 1024)
    assert client.post(path, json=signature(big), headers=CJM).status_code == 413
    bad = {"content_type": "image/png", "data_b64": "not base64!"}
    assert client.post(path, json=bad, headers=CJM).status_code == 422
    jpeg = signature(b"\xff\xd8\xff\xe0 strokes", "image/jpeg")
    r = client.post(path, json=jpeg, headers=CJM)
    assert r.status_code == 200 and r.json()["signature"]["by"] == "court:CS-11"
    again = client.post(path, json=signature(), headers=CJM)
    assert again.status_code == 409 and again.json()["detail"] == "The applicant has already signed"


def test_ekyc_after_submitting(client, db, monkeypatch):
    fake_registry(monkeypatch)
    r = client.post("/court/applications", json=application(), headers=CJM)
    ref = r.json()["id"]
    case = db.scalars(select(Case)).one()
    assert case.intake_data["identity"]["caller"] == "unverified"

    wrong = check(client, CJM, dob="1990-01-01")["checkId"]
    path = f"/court/applications/{ref}/ekyc"
    assert client.post(path, json={"check_id": wrong}, headers=CJM).status_code == 409
    other_office = check(client, NST)["checkId"]
    assert client.post(path, json={"check_id": other_office}, headers=CJM).status_code == 409

    r = client.post(path, json={"check_id": check(client, CJM)["checkId"]}, headers=CJM)
    assert r.status_code == 200 and JALAL_NID not in r.text
    assert r.json()["identity"]["verified"] is True
    db.expire_all()
    case = db.scalars(select(Case)).one()
    assert case.applicant.nid_verified and case.applicant.upazila == "Pirgachha"
    assert case.intake_data["identity"]["callerVerifiedBy"] == "ekyc"
    again = client.post(path, json={"check_id": check(client, CJM)["checkId"]}, headers=CJM)
    assert again.status_code == 409


def test_resending_with_the_same_client_ref_returns_the_same_application(client, db, monkeypatch):
    court_case, first = submit_from_court(client, monkeypatch)
    # The check and signature are already used: a replay must not try them again.
    body = application(court_case_id=court_case["id"], in_custody=True,
                       ekyc_check_id="used-check", signature=signature())  # fmt: skip
    again = client.post("/court/applications", json=body, headers=CJM)
    assert again.status_code == 200
    assert again.json() == first.json()
    assert len(db.scalars(select(Case)).all()) == 1
    assert len(db.scalars(select(InstitutionApplication)).all()) == 1
    assert len(db.scalars(select(Document)).all()) == 1
    assert len(audit(db, "record.linked")) == 1
    # Another office cannot claim it by its client_ref.
    stolen = client.post("/court/applications", json=application(), headers=NST)
    assert stolen.status_code == 409


def test_a_court_sees_only_its_own_applications_and_cases(client, monkeypatch):
    fake_registry(monkeypatch)
    theirs = register_case(client, NST, case_type="womenChildren")
    r = client.post("/court/applications", json=application(court_case_id=theirs["id"]),
                    headers=CJM)  # fmt: skip
    assert r.status_code == 404
    r = client.post("/court/applications", json=application(prisoner_id=1), headers=CJM)
    assert r.status_code == 422
    ref = client.post("/court/applications", json=application(), headers=CJM).json()["id"]
    assert [a["id"] for a in client.get("/court/applications", headers=CJM).json()] == [ref]
    assert client.get("/court/applications", headers=NST).json() == []
    assert client.get(f"/court/applications/{ref}", headers=NST).status_code == 404
    assert client.get(f"/court/applications/{ref}", headers=CJM).status_code == 200
    assert client.get(f"/prison/applications/{ref}", headers=RCJ).status_code == 404
    web = client.post("/intake/web", json={
        "applicant": {"name": "Abdul Malek", "district": "Rangpur"},
        "narrative": "My employer has not paid my wages for three months.",
    }).json()  # fmt: skip
    assert client.get(f"/court/applications/{web['id']}", headers=CJM).status_code == 404
    listed = client.get("/court/applications", headers=CJM).json()
    assert [a["id"] for a in listed] == [ref]


# --- from a jail -----------------------------------------------------------------------


def test_a_jail_applies_for_its_prisoner(client, db, monkeypatch):
    fake_registry(monkeypatch)
    court_case = register_case(client)
    prisoner = admit(client, cases=[{"court_id": "RNG-CJM", "case_number": "G.R. 455/2026"},
                                    {"court_id": "RNG-DSJ", "case_number": "Sessions 76/2026"}])  # fmt: skip
    body = application(prisoner_id=prisoner["id"], help_needed="bail",
                       client_ref="7a1d0c5e-0000-4000-8000-000000000002")  # fmt: skip
    r = client.post("/prison/applications", json=body, headers=RCJ_DESK)
    assert r.status_code == 201, r.text
    status = r.json()
    assert status["inCustody"] is True and status["identity"]["verified"] is False
    assert status["submittedBy"]["id"] == "JS-08"
    assert status["prisoner"] == {"id": prisoner["id"], "prisonerNo": "RCJ-2026-0412",
                                  "prison": prisoner["prison"]}  # fmt: skip
    # The registered case it is held on (the other one the court has not registered).
    assert status["courtCase"]["id"] == court_case["id"]

    case = db.scalars(select(Case)).one()
    assert case.channel == "prison" and case.applicant.provenance == "prison_referral"
    assert case.notices["filer"] == {**case.notices["filer"], "status": "handedOver",
                                     "via": "prison"}  # fmt: skip
    assert [e.details for e in audit(db, "record.linked")] == [
        {"prisonerId": prisoner["id"]}, {"courtCaseId": court_case["id"]},
    ]  # fmt: skip
    # The jail staff can see it on its prisoner; so can the court on its case.
    detail = client.get(f"/prison/prisoners/{prisoner['id']}", headers=RCJ).json()
    assert detail["legalAid"] == [{"id": status["id"], "stage": "received", "lawyer": None}]
    court_view = client.get(f"/court/cases/{court_case['id']}", headers=CJM).json()
    assert court_view["legalAid"][0]["id"] == status["id"]
    # Both desks of one jail share its applications; the other jail sees none.
    assert [a["id"] for a in client.get("/prison/applications", headers=RCJ).json()] == [
        status["id"]
    ]
    assert client.get("/prison/applications", headers=NDJ).json() == []
    assert client.get(f"/prison/applications/{status['id']}", headers=NDJ).status_code == 404
    assert client.get(f"/court/applications/{status['id']}", headers=CJM).status_code == 404


def test_a_jail_must_name_one_of_its_own_prisoners(client):
    theirs = admit(client, NDJ, prisoner_no="NDJ-2026-0091", name="Harun Mia", cases=[])
    r = client.post("/prison/applications", json=application(), headers=RCJ)
    assert r.status_code == 422
    r = client.post("/prison/applications", json=application(prisoner_id=theirs["id"]),
                    headers=RCJ)  # fmt: skip
    assert r.status_code == 404
    r = client.post("/prison/applications", json=application(prisoner_id=theirs["id"],
                    court_case_id=1), headers=NDJ)  # fmt: skip
    assert r.status_code == 422


def test_jail_ekyc_verifies_the_prisoners_record_too(client, db, monkeypatch):
    fake_registry(monkeypatch)
    prisoner = admit(client)
    assert prisoner["nidVerified"] is False
    check_id = check(client, RCJ)["checkId"]
    body = application(prisoner_id=prisoner["id"], ekyc_check_id=check_id, signature=signature())
    r = client.post("/prison/applications", json=body, headers=RCJ)
    assert r.status_code == 201, r.text
    detail = client.get(f"/prison/prisoners/{prisoner['id']}", headers=RCJ).json()
    assert detail["nidVerified"] is True and detail["nidLast4"] == "6397"
    stored = db.scalars(select(EkycCheck)).one()
    assert stored.used_for_case_id and stored.used_for_prisoner_id == prisoner["id"]
    assert [e.entity_type for e in audit(db, "record.updated")] == ["prisoner"]


def test_a_check_for_someone_else_cannot_verify_a_verified_prisoner(client, monkeypatch):
    fake_registry(monkeypatch)
    prisoner = admit(client, ekyc_check_id=check(client, RCJ)["checkId"])
    sohel = check(client, RCJ, nid=SOHEL_NID, dob="2000-04-03")["checkId"]
    body = application(prisoner_id=prisoner["id"], ekyc_check_id=sohel)
    r = client.post("/prison/applications", json=body, headers=RCJ)
    assert r.status_code == 409
    assert r.json()["detail"] == "This e-KYC check is for someone other than the prisoner"
    assert SOHEL_NID not in r.text


def test_signature_bytes_are_stored_as_sent(client, db, monkeypatch):
    submit_from_court(client, monkeypatch)
    doc = db.scalars(select(Document)).one()
    with open(doc.storage_path, "rb") as f:
        assert f.read() == PNG
    assert base64.b64encode(PNG).decode() not in str(doc.filename)
