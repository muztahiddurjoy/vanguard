"""The shared demo dataset: what it adds, that it adds it once, and where it refuses."""

from pathlib import Path

from sqlalchemy import func, select

from app.config import get_settings
from app.models import (
    AuditEntry,
    Case,
    CauseListEntry,
    CourtCase,
    CourtCaseLawyer,
    CourtCaseParty,
    CourtProceeding,
    InstitutionApplication,
    Prisoner,
)
from app.models.party import hash_nid
from scripts import seed_records
from tests.records_helpers import CJM, OFFICER, RCJ, RCJ_DESK, day


def counts(db) -> dict[str, int]:  # type: ignore[no-untyped-def]
    tables = (CourtCase, CourtProceeding, CourtCaseLawyer, CauseListEntry, Prisoner, Case,
              InstitutionApplication, AuditEntry)  # fmt: skip
    return {t.__name__: db.scalar(select(func.count()).select_from(t)) for t in tables}


def test_seed_adds_the_demo_dataset_once(client, db, capsys):
    assert seed_records.main([], db=db) == 0
    first = counts(db)
    assert first | {"AuditEntry": 0} == {
        "CourtCase": 5, "CourtProceeding": 6, "CourtCaseLawyer": 2, "CauseListEntry": 4,
        "Prisoner": 4, "Case": 1, "InstitutionApplication": 1, "AuditEntry": 0,
    }  # fmt: skip
    assert "added 5 court cases" in capsys.readouterr().out

    assert seed_records.main([], db=db) == 0
    assert counts(db) == first
    assert "nothing new" in capsys.readouterr().out


def test_the_courts_and_jails_see_the_demo(client, db):
    seed_records.main([], db=db)
    cjm = {c["caseNumber"]: c for c in client.get("/court/cases", headers=CJM).json()}
    assert list(cjm) == ["C.R. 88/2026", "G.R. 455/2026", "G.R. 1021/2024"]
    assert (cjm["G.R. 455/2026"]["nextDate"], cjm["G.R. 455/2026"]["nextPurpose"]) == (
        day(3), "For evidence",
    )  # fmt: skip
    assert cjm["C.R. 88/2026"]["nextDate"] == day()
    assert cjm["G.R. 1021/2024"]["status"] == "disposed"
    today = client.get(f"/court/cause-lists/{day()}", headers=CJM).json()["entries"]
    assert [(e["serial"], e["caseNumber"], e["inCustody"]) for e in today] == [
        (3, "C.R. 88/2026", False),
    ]  # fmt: skip

    prisoners = {p["prisonerNo"]: p for p in client.get("/prison/prisoners", headers=RCJ).json()}
    assert set(prisoners) == {"RCJ-2026-0412", "RCJ-2026-0388", "RCJ-2026-0450"}
    assert prisoners["RCJ-2026-0412"]["nidVerified"] is False
    assert prisoners["RCJ-2026-0450"]["nidVerified"] is True
    assert prisoners["RCJ-2026-0388"]["nextCourtDate"] == day(1)
    mofiz = client.get(f"/prison/prisoners/{prisoners['RCJ-2026-0450']['id']}", headers=RCJ)
    assert mofiz.json()["cases"][0]["found"] is False
    dates = client.get("/prison/court-dates", headers=RCJ).json()
    assert [(d["date"], d["prisoner"]["prisonerNo"]) for d in dates] == [
        (day(1), "RCJ-2026-0388"), (day(3), "RCJ-2026-0412"),
    ]  # fmt: skip
    nilphamari = client.get("/prison/prisoners", headers={"X-Prison-Staff-Id": "JS-12"}).json()
    assert [p["prisonerNo"] for p in nilphamari] == ["NDJ-2026-0091"]


def test_the_application_went_through_intake_like_any_other(client, db):
    seed_records.main([], db=db)
    [status] = client.get("/prison/applications", headers=RCJ_DESK).json()
    assert status["submittedBy"]["id"] == "JS-08" and status["helpNeeded"] == "bail"
    assert status["identity"]["verified"] is False and status["signature"] is None
    assert status["prisoner"]["prisonerNo"] == "RCJ-2026-0388"
    assert status["courtCase"]["caseNumber"] == "Nari-Shishu 112/2026"

    [case] = client.get("/dlao/cases").json()
    assert case["channel"] == "prison" and case["submittedBy"]["staffName"] == "Nasima Khatun"
    assert case["triage"] is not None and "inCustody" in case["flags"]
    assert case["category"] == "criminalDefence"
    created = db.scalars(select(AuditEntry).where(AuditEntry.action == "case.created")).one()
    assert created.actor == "prison:JS-08"
    records = client.get(f"/dlao/cases/{case['id']}/records", headers=OFFICER).json()
    assert [c["caseNumber"] for c in records["courtCases"]] == ["Nari-Shishu 112/2026"]


def test_search_finds_jalals_court_cases_and_his_record_in_jail(client, db):
    seed_records.main([], db=db)
    found = client.get("/dlao/records/search", params={"q": "Jalal"}, headers=OFFICER).json()
    assert [c["caseNumber"] for c in found["courtCases"]] == ["G.R. 455/2026", "G.R. 1021/2024"]
    assert [p["prisonerNo"] for p in found["prisoners"]] == ["RCJ-2026-0412"]


def test_moyuri_akters_nid_is_never_used(db):
    # Her number is the one real SMS tests go to.
    seed_records.main([], db=db)
    moyuri = hash_nid("4613802741")
    for column in (CourtCaseParty.nid_hash, Prisoner.nid_hash):
        assert db.scalar(select(func.count()).where(column == moyuri)) == 0
    source = Path(seed_records.__file__).read_text()
    assert "4613802741" not in source and "Moyuri" not in source


def test_refuses_in_production_unless_forced(db, monkeypatch, capsys):
    monkeypatch.setattr(get_settings(), "environment", "production")
    assert seed_records.main([], db=db) == 1
    assert "production" in capsys.readouterr().err
    assert counts(db)["CourtCase"] == 0
    assert seed_records.main(["--force"], db=db) == 0
    assert counts(db)["CourtCase"] == 5
