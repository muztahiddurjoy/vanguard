import base64

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

INTAKE = {
    "applicant": {"name": "Rohima Begum", "phone": "01812345678", "district": "Rangpur"},
    "respondent": {"name": "Abdul Karim", "relation": "husband"},
    "narrative": "My husband stopped paying maintenance for our two children.",
    "udc_center": "Kaunia UDC",
    "operator_id": "UDC-12",
}


def op(key: str, name: str, payload: dict) -> dict:
    return {"idempotency_key": key, "op": name, "payload": payload}


def batch(client, *ops, device="tablet-7"):
    r = client.post("/sync/batch", json={"device_id": device, "operations": list(ops)})
    assert r.status_code == 200, r.text
    return r.json()["results"]


def text_doc(text: str, **kw) -> dict:
    return {
        "content_type": "text/plain",
        "data_b64": base64.b64encode(text.encode()).decode(),
        **kw,
    }


def test_batch_applies_in_order_and_links_by_client_ref(client):
    results = batch(
        client,
        op("op-intake-0001", "create_intake", INTAKE),
        op(
            "op-doc-000001",
            "attach_document",
            text_doc("Kabinnama, nikah registered 2015.", case_client_ref="op-intake-0001"),
        ),
    )
    assert [r["status"] for r in results] == ["applied", "applied"]
    case = results[0]["result"]["case"]
    assert case["channel"] == "udc"
    assert results[1]["result"]["document"]["kind"] == "marriage_certificate"
    assert len(client.get("/dlao/cases").json()) == 1


def test_replaying_a_batch_is_harmless(client):
    ops = [
        op("op-intake-0001", "create_intake", INTAKE),
        op(
            "op-doc-000001",
            "attach_document",
            text_doc("National ID card", case_client_ref="op-intake-0001"),
        ),
    ]
    first = batch(client, *ops)
    second = batch(client, *ops)
    assert [r["status"] for r in second] == ["replayed", "replayed"]
    assert second[0]["result"] == first[0]["result"]
    assert len(client.get("/dlao/cases").json()) == 1
    detail = client.get(f"/dlao/cases/{first[0]['result']['case']['id']}").json()
    assert len(detail["documents"]) == 1
    assert [a["action"] for a in detail["activity"]].count("case.created") == 1


def test_reused_key_with_different_payload_is_a_conflict(client):
    batch(client, op("op-intake-0001", "create_intake", INTAKE))
    changed = {**INTAKE, "narrative": "Something else entirely happened to me."}
    [result] = batch(client, op("op-intake-0001", "create_intake", changed))
    assert result["status"] == "conflict"
    assert result["error"]["code"] == 409


def test_invalid_operation_is_rejected_and_replays_the_same_way(client):
    bad = op("op-bad-000001", "create_intake", {**INTAKE, "applicant": {"name": ""}})
    [first] = batch(client, bad)
    assert first["status"] == "rejected"
    assert first["error"]["code"] == 422
    [again] = batch(client, bad)
    assert again["status"] == "replayed" and again["original"] == "rejected"
    assert again["error"] == first["error"]
    assert client.get("/dlao/cases").json() == []


def test_one_bad_operation_does_not_undo_the_others(client):
    results = batch(
        client,
        op("op-intake-0001", "create_intake", INTAKE),
        op("op-doc-000001", "attach_document", text_doc("x", case_client_ref="op-missing-01")),
        op(
            "op-doc-000002",
            "attach_document",
            {**text_doc("y"), "case_client_ref": "op-intake-0001", "data_b64": "%%%"},
        ),
    )
    assert [r["status"] for r in results] == ["applied", "deferred", "rejected"]
    assert results[2]["error"]["code"] == 422
    assert len(client.get("/dlao/cases").json()) == 1


def test_operation_waiting_on_an_unsynced_case_succeeds_on_retry(client):
    attach = op(
        "op-doc-000001",
        "attach_document",
        text_doc("National ID", case_client_ref="op-intake-0001"),
    )
    [early] = batch(client, attach)
    assert early["status"] == "deferred"
    assert client.get("/sync/receipts/op-doc-000001").status_code == 404
    results = batch(client, op("op-intake-0001", "create_intake", INTAKE), attach)
    assert [r["status"] for r in results] == ["applied", "applied"]


def test_duplicate_keys_within_a_batch_are_refused(client):
    r = client.post(
        "/sync/batch",
        json={
            "device_id": "tablet-7",
            "operations": [op("op-same-00001", "create_intake", INTAKE)] * 2,
        },
    )
    assert r.status_code == 422


def test_receipt_lookup(client):
    batch(client, op("op-intake-0001", "create_intake", INTAKE))
    receipt = client.get("/sync/receipts/op-intake-0001").json()
    assert receipt["status"] == "applied"
    assert receipt["result"]["case"]["applicationId"].startswith("APP-")
    assert client.get("/sync/receipts/op-never-seen").status_code == 404


def test_offline_signature_is_verified_on_sync(client):
    [created] = batch(client, op("op-intake-0001", "create_intake", INTAKE))
    ref = created["result"]["case"]["id"]
    doc = client.post(
        f"/mediation/cases/{ref}/settlement-draft",
        json={"terms": ["Tk 3,000 each month by the 5th."], "language": "en"},
    ).json()
    doc = client.post(f"/mediation/documents/{doc['id']}/approve").json()

    key = Ed25519PrivateKey.generate()
    pub = base64.b64encode(key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)).decode()
    signature = base64.b64encode(key.sign(doc["signingMessage"].encode())).decode()
    payload = {
        "document_id": doc["id"],
        "party_id": doc["requiredSigners"][0],
        "public_key": pub,
        "signature": signature,
        "signed_sha256": doc["sha256"],
        "device_id": "tablet-7",
    }
    [signed] = batch(client, op("op-sign-000001", "record_signature", payload))
    assert signed["status"] == "applied"
    assert len(signed["result"]["document"]["signatures"]) == 1
    # Replaying does not trip the "already signed" check.
    [again] = batch(client, op("op-sign-000001", "record_signature", payload))
    assert again["status"] == "replayed" and again["original"] == "applied"
