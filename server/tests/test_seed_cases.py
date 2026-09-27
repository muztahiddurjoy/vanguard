"""The DLAO dashboard's demo cases: what the dashboards see, when it happened, and that
it is added once."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.config import get_settings
from app.database import as_utc
from app.models import AuditEntry, Case
from scripts import seed_cases, seed_records
from tests.records_helpers import fake_registry

OFFICER = {"X-Officer-Id": "DLAO-RGP-0142"}


@pytest.fixture
def registry(monkeypatch):  # type: ignore[no-untyped-def]
    """The NID registry the court's e-KYC asks (seed_cases needs NID_SERVER_URL set)."""
    monkeypatch.setattr(get_settings(), "nid_server_url", "http://registry.test")
    return fake_registry(monkeypatch)


@pytest.fixture
def seeded(client, db, registry):  # type: ignore[no-untyped-def]
    assert seed_records.main([], db=db) == 0
    assert seed_cases.main([], api=seed_cases.Api(client), db=db) == 0
    return client


def cases(client) -> dict[str, dict]:  # type: ignore[no-untyped-def]
    """Open cases by applicant name, with their full detail."""
    out = {}
    for row in client.get("/dlao/cases").json():
        detail = client.get(f"/dlao/cases/{row['id']}", headers=OFFICER).json()
        out[detail["applicant"]["name"]] = detail
    return out


def test_the_demo_cases_are_added_once(client, db, registry, capsys):
    assert seed_records.main([], db=db) == 0
    assert seed_cases.main([], api=seed_cases.Api(client), db=db) == 0
    out = capsys.readouterr().out
    assert "Demo cases: added 18, 0 already there." in out
    # Each with its tracking number, for the helpline and the citizen's app.
    assert "Jalal Uddin" in out and "tracking" in out
    first = db.scalar(select(func.count()).select_from(Case))
    ledger = db.scalar(select(func.count()).select_from(AuditEntry))
    assert first == 19  # and seed_records' application

    assert seed_cases.main([], api=seed_cases.Api(client), db=db) == 0
    assert "added 0, 18 already there" in capsys.readouterr().out
    assert db.scalar(select(func.count()).select_from(Case)) == first
    assert db.scalar(select(func.count()).select_from(AuditEntry)) == ledger
    assert client.get("/dlao/audit/verify").json() == {"ok": True, "brokenAtSeq": None}


def test_the_officer_sees_the_sample_datas_queues_and_alerts(seeded):
    by_name = cases(seeded)
    assert {"Parvin", "Moyuri Akter", "Rohima Begum", "Jahanara Parvin"} <= {
        name for name, c in by_name.items() if "pendingTriage" in c["queues"]
    }
    parvin = by_name["Parvin"]
    assert (parvin["channel"], parvin["priority"]) == ("hotline", "critical")
    assert parvin["doNotCall"] == {"reason": "hostage"}
    moyuri = by_name["Moyuri Akter"]
    assert moyuri["channel"] == "proxy" and "restrictedContact" in moyuri["flags"]

    alerts = {(a["caseId"], a["type"]) for a in seeded.get("/dlao/alerts").json()}
    for name, kind in (
        ("Abdul Malek", "lawyerInactivity"),
        ("Anwara Begum", "lawyerInactivity"),
        ("Nabila", "jurisdictionEscalation"),
        ("Parvin", "criticalUntriaged"),
    ):
        assert (by_name[name]["id"], kind) in alerts, (name, kind)

    [review] = seeded.get("/duplicates").json()
    assert {r["name"] for r in review["records"]} == {"Rahima Begum", "Rohima Begum"}

    # The officer's calls where the rules differ: overridden, with the reason on record.
    assert by_name["Abdul Malek"]["priority"] == "medium"
    assert by_name["Abdul Malek"]["triage"]["status"] == "overridden"


def test_each_panel_lawyer_has_their_cases_and_court_dates(seeded):
    def names(lawyer: str) -> set[str]:
        rows = seeded.get("/lawyer/cases", headers={"X-Lawyer-Id": lawyer}).json()
        return {r["client"]["name"] for r in rows}

    assert names("LAW-07") == {"Motaleb Mia", "Abdul Malek", "Anwara Begum"}
    assert names("LAW-12") == {"Rahima Begum"}
    assert names("LAW-15") == {"Kamal Hossain"}
    assert names("LAW-24") == {"Jalal Uddin"}
    hearings = seeded.get("/dlao/hearings").json()
    assert {h["kind"] for h in hearings} == {"court", "mediation"}
    assert all(
        as_utc(datetime.fromisoformat(h["at"])) > datetime.now(UTC) - timedelta(days=1)
        for h in hearings
    )


def test_the_court_application_is_checked_and_linked(seeded):
    jalal = cases(seeded)["Jalal Uddin"]
    assert jalal["channel"] == "court" and jalal["lawyer"]["id"] == "LAW-24"
    assert jalal["identity"]["callerVerifiedBy"] == "ekyc"
    records = seeded.get(f"/dlao/cases/{jalal['id']}/records", headers=OFFICER).json()
    assert records["prisoner"]["prisonerNo"] == "RCJ-2026-0412"
    assert [c["caseNumber"] for c in records["courtCases"]] == ["G.R. 455/2026"]


def test_a_missed_mediation_waits_for_the_officer(seeded):
    shahana = cases(seeded)["Shahana Begum"]
    mediation = seeded.get(f"/mediation/cases/{shahana['id']}").json()
    assert mediation["missedInARow"] == {"applicant": 2, "respondent": 0}
    [notice] = mediation["udcNotices"]
    assert (notice["status"], notice["reasons"], notice["udc"]["id"]) == (
        "held",
        ["applicantSafety"],
        "UDC-TRG",
    )


def test_cases_are_dated_as_they_happened(client, db, registry):
    assert seed_records.main([], db=db) == 0
    before = db.scalar(select(func.count()).select_from(AuditEntry))
    assert seed_cases.main([], api=seed_cases.Api(client), db=db) == 0
    by_name = cases(client)
    received = as_utc(datetime.fromisoformat(by_name["Abdul Malek"]["receivedAt"]))
    assert abs(datetime.now(UTC) - timedelta(days=96) - received) < timedelta(minutes=5)
    # APP numbers follow the order they came in, as do the ledger's entries.
    order = sorted(by_name.values(), key=lambda c: c["receivedAt"])
    ids = [c["applicationId"] for c in order if c["applicationId"] != "APP-2026-001"]
    assert ids == sorted(ids)
    times = db.scalars(select(AuditEntry.occurred_at).order_by(AuditEntry.seq)).all()
    added = [as_utc(t) for t in times[before:]]
    assert len(added) > 100 and added == sorted(added)
    assert added[0] < datetime.now(UTC) - timedelta(days=200)


def test_without_a_registry_the_court_application_is_left_out(client, db, capsys):
    assert seed_records.main([], db=db) == 0
    assert seed_cases.main([], api=seed_cases.Api(client), db=db) == 0
    out = capsys.readouterr().out
    assert "added 17" in out and "left out: Jalal Uddin: no NID registry" in out


def test_it_refuses_in_production(client, db, monkeypatch, capsys):
    monkeypatch.setattr(get_settings(), "environment", "production")
    assert seed_cases.main([], api=seed_cases.Api(client), db=db) == 1
    assert "not adding demo cases" in capsys.readouterr().err
    assert db.scalar(select(func.count()).select_from(Case)) == 0
