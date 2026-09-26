import base64
from datetime import datetime
from zoneinfo import ZoneInfo

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

DHAKA = ZoneInfo("Asia/Dhaka")

MAINTENANCE = {
    "applicant": {"name": "Rohima Begum", "phone": "01812345678", "district": "Rangpur"},
    "respondent": {"name": "Abdul Karim", "relation": "husband"},
    "narrative": "My husband left and stopped paying maintenance for our two children.",
}
TERMS = ["Abdul Karim will pay Tk 3,000 maintenance by the 5th of each month."]


def new_case(client, body=MAINTENANCE) -> dict:
    r = client.post("/intake/web", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def keypair() -> tuple[Ed25519PrivateKey, str]:
    private = Ed25519PrivateKey.generate()
    raw = private.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return private, base64.b64encode(raw).decode()


def sign(private: Ed25519PrivateKey, doc: dict) -> str:
    return base64.b64encode(private.sign(doc["signingMessage"].encode())).decode()


# --- documents (T6) --------------------------------------------------------------


def test_upload_reads_text_and_updates_checklist(client):
    case = new_case(client)
    r = client.post(
        f"/intake/cases/{case['id']}/documents",
        files={"file": ("kabin.txt", b"Kabinnama. Nikah registered at Kaunia.", "text/plain")},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["document"]["kind"] == "marriage_certificate"
    assert body["document"]["status"] == "processed"
    assert body["missing"] == ["nid_copy"]

    r = client.post(
        f"/intake/cases/{case['id']}/documents",
        files={"file": ("nid.txt", b"National ID card of Rohima Begum", "text/plain")},
    )
    assert r.json()["missing"] == []
    detail = client.get(f"/dlao/cases/{case['id']}").json()
    assert {d["kind"] for d in detail["documents"]} == {"marriage_certificate", "nid_copy"}
    assert all(i["status"] == "provided" for i in detail["checklist"] if i["required"])


def test_scan_without_llm_is_kept_for_manual_review(client):
    case = new_case(client)
    r = client.post(
        f"/intake/cases/{case['id']}/documents",
        files={"file": ("scan.png", b"\x89PNG fake", "image/png")},
        data={"kind": "nid_copy"},
    )
    body = r.json()
    assert body["document"]["status"] == "needs_review"
    # The officer said what it is, so the checklist counts it.
    assert "nid_copy" not in body["missing"]


def test_upload_rejects_unsupported_and_empty_files(client):
    case = new_case(client)
    url = f"/intake/cases/{case['id']}/documents"
    assert (
        client.post(url, files={"file": ("x.exe", b"MZ", "application/x-msdownload")}).status_code
        == 415
    )
    assert client.post(url, files={"file": ("e.txt", b"", "text/plain")}).status_code == 422


# --- scheduling ----------------------------------------------------------------------


def test_restricted_applicant_session_must_fit_safe_window(client):
    moyuri = {
        "applicant": {"name": "Moyuri Akter", "phone": "01712345318", "district": "Rangpur"},
        "narrative": "Husband monitors her phone and shouts at her about the land papers.",
        "safe_contact_windows": [{"day": 2, "start_hour": 14, "end_hour": 16}],
        "phone_monitored": True,
    }
    case = new_case(client, moyuri)
    wednesday = datetime(2026, 9, 23, 10, tzinfo=DHAKA).isoformat()
    tuesday = datetime(2026, 9, 29, 14, 30, tzinfo=DHAKA).isoformat()
    base = {"case_ref": case["id"], "mode": "odr_phone", "duration_minutes": 60}
    assert (
        client.post("/mediation/sessions", json={**base, "scheduled_for": wednesday}).status_code
        == 409
    )
    # 14:30 + 60 min runs past 16:00.
    late = {**base, "scheduled_for": tuesday, "duration_minutes": 120}
    assert client.post("/mediation/sessions", json=late).status_code == 409
    ok = client.post("/mediation/sessions", json={**base, "scheduled_for": tuesday})
    assert ok.status_code == 201
    # In person at the office is not limited by the phone window.
    in_person = {**base, "mode": "in_person", "scheduled_for": wednesday}
    assert client.post("/mediation/sessions", json=in_person).status_code == 201
    assert len(client.get("/mediation/sessions", params={"case_ref": case["id"]}).json()) == 2
    assert client.get(f"/dlao/cases/{case['id']}").json()["status"] == "in_mediation"


def test_naive_datetimes_are_rejected(client):
    case = new_case(client)
    r = client.post(
        "/mediation/sessions",
        json={"case_ref": case["id"], "mode": "in_person", "scheduled_for": "2026-09-29T14:00:00"},
    )
    assert r.status_code == 422


def test_a_session_comes_back_in_full_at_the_time_it_was_set(client):
    case = new_case(client)
    at = datetime(2026, 10, 6, 11, 0, tzinfo=DHAKA)
    made = client.post(
        "/mediation/sessions",
        json={"case_ref": case["id"], "mode": "in_person", "scheduled_for": at.isoformat()},
    ).json()
    assert made["scheduledFor"] == "2026-10-06T05:00:00+00:00"
    assert made["place"] == "District Legal Aid Office, Rangpur (District Judge Court building)"
    assert made["attendance"] == {"applicant": None, "respondent": None}
    assert [n["role"] for n in made["notices"]] == ["applicant", "respondent"]
    # Read back from the database (SQLite drops the offset): the same moment.
    [listed] = client.get("/mediation/sessions", params={"case_ref": case["id"]}).json()
    assert listed == made
    url = f"/mediation/sessions/{made['id']}/status"
    assert client.post(url, json={"status": "cancelled"}).json() == {**made, "status": "cancelled"}


# --- settlement + T11 -------------------------------------------------------------------


def test_settlement_draft_approve_sign_execute(client):
    case = new_case(client)
    draft = client.post(
        f"/mediation/cases/{case['id']}/settlement-draft", json={"terms": TERMS, "language": "en"}
    )
    assert draft.status_code == 201, draft.text
    doc = draft.json()
    assert "Section 21C" in doc["content"]
    assert doc["signingMessage"] is None  # not signable before approval
    assert len(doc["requiredSigners"]) == 2

    edited = client.put(
        f"/mediation/documents/{doc['id']}",
        json={"content": doc["content"] + "\nThe parties will meet again in six months."},
    ).json()
    assert edited["sha256"] != doc["sha256"]

    approved = client.post(f"/mediation/documents/{doc['id']}/approve").json()
    assert approved["status"] == "approved"
    assert approved["signingMessage"] == f"dlas-t11-v1|{doc['id']}|{approved['sha256']}"
    assert (
        client.put(f"/mediation/documents/{doc['id']}", json={"content": "x" * 30}).status_code
        == 409
    )

    applicant_id, respondent_id = approved["requiredSigners"]
    key_a, pub_a = keypair()
    key_b, pub_b = keypair()
    payload = {
        "document_id": doc["id"],
        "party_id": applicant_id,
        "public_key": pub_a,
        "signature": sign(key_a, approved),
        "signed_sha256": approved["sha256"],
        "device_id": "udc-tablet-7",
    }
    first = client.post("/mediation/signatures", json=payload)
    assert first.status_code == 201, first.text
    assert first.json()["status"] == "approved"
    assert client.post("/mediation/signatures", json=payload).status_code == 409  # already signed

    second = client.post(
        "/mediation/signatures",
        json={
            **payload,
            "party_id": respondent_id,
            "public_key": pub_b,
            "signature": sign(key_b, approved),
        },
    ).json()
    assert second["status"] == "executed"
    assert len(second["signatures"]) == 2

    closed = client.post(
        f"/dlao/cases/{case['id']}/close",
        json={"outcome": "settled", "note": "Settlement executed."},
    ).json()
    assert closed["status"] == "closed" and closed["outcome"] == "settled"
    actions = [a["action"] for a in client.get(f"/dlao/cases/{case['id']}").json()["activity"]]
    assert actions[-4:] == [
        "settlement.approved",
        "signature.recorded",
        "signature.recorded",
        "case.closed",
    ]
    assert client.get("/dlao/audit/verify").json()["ok"] is True


def test_bad_signatures_are_rejected(client):
    case = new_case(client)
    doc = client.post(
        f"/mediation/cases/{case['id']}/settlement-draft", json={"terms": TERMS, "language": "en"}
    ).json()
    approved = client.post(f"/mediation/documents/{doc['id']}/approve").json()
    key, pub = keypair()
    _, other_pub = keypair()
    base = {
        "document_id": doc["id"],
        "party_id": approved["requiredSigners"][0],
        "public_key": pub,
        "signature": sign(key, approved),
        "signed_sha256": approved["sha256"],
    }
    assert (
        client.post("/mediation/signatures", json={**base, "public_key": other_pub}).status_code
        == 400
    )
    assert (
        client.post("/mediation/signatures", json={**base, "signed_sha256": "0" * 64}).status_code
        == 409
    )
    assert client.post("/mediation/signatures", json={**base, "party_id": 999}).status_code == 403


def test_signing_before_approval_is_refused(client):
    case = new_case(client)
    doc = client.post(
        f"/mediation/cases/{case['id']}/settlement-draft", json={"terms": TERMS, "language": "en"}
    ).json()
    key, pub = keypair()
    r = client.post(
        "/mediation/signatures",
        json={
            "document_id": doc["id"],
            "party_id": doc["requiredSigners"][0],
            "public_key": pub,
            "signature": base64.b64encode(key.sign(b"anything")).decode(),
            "signed_sha256": doc["sha256"],
        },
    )
    assert r.status_code == 409


def test_violence_blocks_settlement_unless_acknowledged_with_reason(client):
    violent = {
        **MAINTENANCE,
        "narrative": "My husband beat me last week and stopped paying maintenance.",
    }
    case = new_case(client, violent)
    url = f"/mediation/cases/{case['id']}/settlement-draft"
    blocked = client.post(url, json={"terms": TERMS})
    assert blocked.status_code == 422
    assert "mediation is not suitable" in blocked.json()["detail"]["issues"][0]
    no_reason = client.post(url, json={"terms": TERMS, "acknowledge_risk": True})
    assert no_reason.status_code == 422
    ok = client.post(
        url,
        json={
            "terms": TERMS,
            "acknowledge_risk": True,
            "justification": "Applicant now lives with her parents; protection order in place.",
        },
    )
    assert ok.status_code == 201
    drafted = client.get(f"/dlao/cases/{case['id']}").json()["activity"][-1]
    assert drafted["details"]["riskAcknowledged"] is True
    assert drafted["justification"].startswith("Applicant now lives")


# --- sensitive evidence (A3) ------------------------------------------------------

BLACKMAIL = {
    "applicant": {"name": "Nabila", "phone": "01914000207", "district": "Rangpur"},
    "narrative": (
        "A man is sharing edited private photos of me on Facebook and says he will post "
        "more unless I pay him money."
    ),
}


def test_sensitive_evidence_is_named_only_on_an_audited_request(client):
    case = new_case(client, BLACKMAIL)
    ref = case["id"]
    assert "sensitive" in case["flags"]
    client.post(
        f"/intake/cases/{ref}/documents",
        files={"file": ("nabila-edited-photo.png", b"\x89PNG fake", "image/png")},
    )
    [doc] = client.get(f"/dlao/cases/{ref}").json()["documents"]
    assert doc["filename"] is None and doc["summary"] is None and doc["withheld"] is True
    assert doc["contentType"] == "image/png" and doc["sizeBytes"] == 9

    officer = {"X-Officer-Id": "DLAO-RGP-0142"}
    [shown] = client.post(f"/dlao/cases/{ref}/evidence/view", headers=officer).json()["documents"]
    assert shown["filename"] == "nabila-edited-photo.png"
    entry = client.get(f"/dlao/cases/{ref}").json()["activity"][-1]
    assert (entry["action"], entry["actor"]) == ("evidence.viewed", "DLAO-RGP-0142")


def test_receiving_officer_acknowledges_receipt_once(client):
    ref = new_case(client, BLACKMAIL)["id"]
    assert client.get(f"/dlao/cases/{ref}").json()["evidenceReceipt"] is None
    officer = {"X-Officer-Id": "DLAO-RGP-0142"}
    assert client.post(f"/dlao/cases/{ref}/evidence/receipt", headers=officer).status_code == 200
    receipt = client.get(f"/dlao/cases/{ref}").json()["evidenceReceipt"]
    assert receipt["by"] == "DLAO-RGP-0142" and receipt["at"]
    assert client.post(f"/dlao/cases/{ref}/evidence/receipt").status_code == 409


def test_other_cases_name_their_documents(client):
    ref = new_case(client)["id"]
    client.post(
        f"/intake/cases/{ref}/documents",
        files={"file": ("kabin.txt", b"Kabinnama. Nikah registered at Kaunia.", "text/plain")},
    )
    [doc] = client.get(f"/dlao/cases/{ref}").json()["documents"]
    assert doc["filename"] == "kabin.txt" and doc["withheld"] is False
