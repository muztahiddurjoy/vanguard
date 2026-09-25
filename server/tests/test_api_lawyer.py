"""Panel lawyers: assignment by the DLAO, and the lawyer's own API."""

from app.database import utcnow
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
