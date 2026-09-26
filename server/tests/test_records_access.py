"""Who sees which court and jail records of a legal aid case: the DLAO and the panel lawyer."""

from sqlalchemy import select

from app.models import Case
from tests.records_helpers import (
    CJM,
    JALAL_NID,
    NST,
    OFFICER,
    RCJ_DESK,
    admit,
    application,
    audit,
    check,
    day,
    fake_registry,
    register_case,
    signature,
)

LAWYER = {"X-Lawyer-Id": "LAW-24"}


def jalal_from_jail(client, monkeypatch) -> dict:  # type: ignore[no-untyped-def]
    """Jalal's register: this case, an earlier one, a sealed one and one not his; his jail's
    verified, signed application."""
    fake_registry(monkeypatch)
    current = register_case(client)
    client.post(f"/court/cases/{current['id']}/proceedings", headers=CJM,
                json={"held_on": day(-30), "kind": "chargeFraming", "next_date": day(3),
                      "summary": "Charge framed; no defence lawyer present.",
                      "next_purpose": "For evidence"})  # fmt: skip
    client.post(f"/court/cases/{current['id']}/lawyers", headers=CJM,
                json={"name": "Adv. Kamrul Hasan", "side": "defence", "from": "2026-06-15"})  # fmt: skip
    earlier = register_case(client, case_number="G.R. 1021/2024", filed_on="2024-09-02",
                            status="disposed", sections="Penal Code 1860, s. 380")  # fmt: skip
    sealed = register_case(client, case_number="G.R. 77/2023", filed_on="2023-01-05",
                           restricted=True)  # fmt: skip
    # Same name, no NID: found by name and father's name.
    by_name = register_case(
        client, NST, case_number="Nari-Shishu 5/2025", case_type="womenChildren",
        title="State vs. Jalal Uddin", filed_on="2025-02-01",
        parties=[{"role": "accused", "name": "jalal uddin", "father_name": "ABDUS SATTAR"}],
    )  # fmt: skip
    other = register_case(
        client, case_number="C.R. 88/2026", title="Abdul Jalil vs. Kamal Hossain",
        parties=[{"role": "accused", "name": "Kamal Hossain", "father_name": "Nurul Islam"}],
    )  # fmt: skip
    prisoner = admit(client)
    body = application(prisoner_id=prisoner["id"], ekyc_check_id=check(client, RCJ_DESK)["checkId"],
                       signature=signature())  # fmt: skip
    r = client.post("/prison/applications", json=body, headers=RCJ_DESK)
    assert r.status_code == 201, r.text
    return {"ref": r.json()["id"], "current": current, "earlier": earlier, "sealed": sealed,
            "by_name": by_name, "other": other, "prisoner": prisoner}  # fmt: skip


def test_the_dlao_sees_the_linked_records_and_previous_ones(client, db, monkeypatch):
    jalal = jalal_from_jail(client, monkeypatch)
    r = client.get(f"/dlao/cases/{jalal['ref']}/records", headers=OFFICER)
    assert r.status_code == 200, r.text
    assert JALAL_NID not in r.text
    records = r.json()
    submitted = records["submittedBy"]
    assert submitted["kind"] == "prison" and submitted["office"]["id"] == "RNG-CJ"
    assert submitted["staff"]["id"] == "JS-08" and submitted["helpNeeded"] == "defence"
    assert submitted["inCustody"] is True
    ekyc = records["identity"]["ekyc"]
    assert ekyc["status"] == "verified" and ekyc["by"] == "prison:JS-08"
    assert ekyc["nidLast4"] == "6397"
    sig = records["identity"]["signature"]
    assert sig["by"] == "prison:JS-08" and len(sig["sha256"]) == 64 and sig["documentId"]

    # Only what is linked: the case he is held on, not the court's others.
    [linked] = records["courtCases"]
    assert linked["id"] == jalal["current"]["id"] and linked["nextDate"] == day(3)
    assert [p["kind"] for p in linked["proceedings"]] == ["chargeFraming"]
    assert linked["lawyers"][0]["name"] == "Adv. Kamrul Hasan"
    assert linked["custody"][0]["prisonerNo"] == "RCJ-2026-0412"
    assert linked["legalAid"][0]["id"] == jalal["ref"]
    prisoner = records["prisoner"]
    assert prisoner["id"] == jalal["prisoner"]["id"] and prisoner["nidLast4"] == "6397"
    assert prisoner["legalAid"] == [] and prisoner["cases"][0]["found"] is True

    # His earlier cases: by NID or by name and father's name; never sealed, never linked.
    previous = [c["id"] for c in records["previousRecords"]]
    assert previous == [jalal["by_name"]["id"], jalal["earlier"]["id"]]
    assert records["previousRecords"][1]["status"] == "disposed"

    [viewed] = audit(db, "records.viewed")
    assert viewed.actor == "DLAO-RNG-01"
    assert viewed.details == {
        "courtCases": [jalal["current"]["id"]], "prisoner": jalal["prisoner"]["id"],
        "previousRecords": previous,
    }  # fmt: skip


def test_a_case_with_nothing_linked(client):
    ref = client.post("/intake/web", headers=OFFICER, json={
        "applicant": {"name": "Abdul Malek", "district": "Rangpur"},
        "narrative": "My employer has not paid my wages for three months.",
    }).json()["id"]  # fmt: skip
    records = client.get(f"/dlao/cases/{ref}/records", headers=OFFICER).json()
    assert records == {
        "submittedBy": None, "identity": {"ekyc": None, "signature": None},
        "courtCases": [], "prisoner": None, "previousRecords": [],
    }  # fmt: skip
    assert client.get("/dlao/cases/APP-1999-001/records").status_code == 404


def test_search_never_shows_restricted_cases_and_is_audited(client, db, monkeypatch):
    jalal = jalal_from_jail(client, monkeypatch)
    for q in ("", "ja", "  a "):
        assert client.get("/dlao/records/search", params={"q": q}).status_code == 422
    r = client.get("/dlao/records/search", params={"q": "Jalal"}, headers=OFFICER)
    found = r.json()
    ids = {c["id"] for c in found["courtCases"]}
    assert ids == {jalal["current"]["id"], jalal["earlier"]["id"], jalal["by_name"]["id"]}
    assert [p["prisonerNo"] for p in found["prisoners"]] == ["RCJ-2026-0412"]
    by_number = client.get("/dlao/records/search", params={"q": "gr 77/2023"}).json()
    assert by_number["courtCases"] == []
    assert [c["caseNumber"] for c in client.get(
        "/dlao/records/search", params={"q": "G.R. 1021"}).json()["courtCases"]] == [
        "G.R. 1021/2024"
    ]  # fmt: skip
    entries = audit(db, "records.searched")
    assert entries[0].details == {"q": "Jalal", "courtCases": 3, "prisoners": 1}
    assert entries[0].actor == "DLAO-RNG-01"


def test_the_dlao_links_a_record_found_by_search(client, db, monkeypatch):
    jalal = jalal_from_jail(client, monkeypatch)
    path = f"/dlao/cases/{jalal['ref']}/records"
    for body in ({}, {"court_case_id": 1, "prisoner_id": 1}):
        assert client.post(path, json=body, headers=OFFICER).status_code == 422
    assert client.post(path, json={"court_case_id": 999}).status_code == 404
    # A sealed record is not the office's to link.
    assert client.post(path, json={"court_case_id": jalal["sealed"]["id"]}).status_code == 404
    before = len(audit(db, "record.linked"))
    r = client.post(path, json={"court_case_id": jalal["earlier"]["id"]}, headers=OFFICER)
    assert r.status_code == 200
    assert [c["id"] for c in r.json()["courtCases"]] == [
        jalal["current"]["id"], jalal["earlier"]["id"],
    ]  # fmt: skip
    assert [c["id"] for c in r.json()["previousRecords"]] == [jalal["by_name"]["id"]]
    again = client.post(path, json={"court_case_id": jalal["earlier"]["id"]}, headers=OFFICER)
    assert again.json() == r.json()
    linked = audit(db, "record.linked")[before:]
    assert [e.details for e in linked] == [{"courtCaseId": jalal["earlier"]["id"]}]
    assert linked[0].actor == "DLAO-RNG-01"
    # One prisoner record per case.
    other = admit(client, prisoner_no="RCJ-2026-0388", name="Sohel Rana", cases=[])
    assert client.post(path, json={"prisoner_id": other["id"]}).status_code == 409
    assert client.post(path, json={"prisoner_id": jalal["prisoner"]["id"]}).status_code == 200


def test_a_mother_calling_about_her_son_in_jail(client, monkeypatch):
    jalal = jalal_from_jail(client, monkeypatch)
    ref = client.post("/intake/web", headers=OFFICER, json={
        "applicant": {"name": "Jalal Uddin", "guardian_name": "Abdus Sattar"},
        "narrative": "My son has been in jail since June with no lawyer.",
        "proxy": {"name": "Jamela Khatun", "relation": "mother"},
    }).json()["id"]  # fmt: skip
    # Nothing linked yet; his earlier cases are found by his name and his father's.
    records = client.get(f"/dlao/cases/{ref}/records", headers=OFFICER).json()
    assert records["courtCases"] == [] and records["prisoner"] is None
    assert {c["id"] for c in records["previousRecords"]} == {
        jalal["current"]["id"], jalal["earlier"]["id"], jalal["by_name"]["id"],
    }  # fmt: skip
    records = client.post(f"/dlao/cases/{ref}/records", headers=OFFICER,
                          json={"prisoner_id": jalal["prisoner"]["id"]}).json()  # fmt: skip
    assert records["prisoner"]["prisonerNo"] == "RCJ-2026-0412"
    assert records["prisoner"]["cases"][0]["nextDate"] == day(3)


def test_the_panel_lawyer_sees_their_own_case_records_without_nid_digits(client, db, monkeypatch):
    jalal = jalal_from_jail(client, monkeypatch)
    path = f"/lawyer/cases/{jalal['ref']}/records"
    assert client.get(path).status_code == 401
    assert client.get(path, headers=LAWYER).status_code == 403
    client.post(f"/dlao/cases/{jalal['ref']}/lawyer", json={"lawyer_id": "LAW-24"},
                headers=OFFICER)  # fmt: skip
    assert client.get(path, headers={"X-Lawyer-Id": "LAW-07"}).status_code == 403
    r = client.get(path, headers=LAWYER)
    assert r.status_code == 200, r.text
    assert JALAL_NID not in r.text and "6397" not in r.text
    records = r.json()
    assert records["identity"]["ekyc"]["nidLast4"] is None
    assert records["identity"]["ekyc"]["status"] == "verified"
    assert records["prisoner"]["nidLast4"] is None
    assert [c["id"] for c in records["courtCases"]] == [jalal["current"]["id"]]
    assert [c["id"] for c in records["previousRecords"]] == [
        jalal["by_name"]["id"], jalal["earlier"]["id"],
    ]  # fmt: skip
    [viewed] = [e for e in audit(db, "records.viewed") if e.actor == "LAW-24"]
    assert viewed.entity_id == str(db.scalars(select(Case)).one().id)
    # The court and the jail see the lawyer on the application.
    status = client.get(f"/prison/applications/{jalal['ref']}", headers=RCJ_DESK).json()
    assert status["lawyer"] == {"id": "LAW-24", "name": "Adv. Rafiqul Hasan",
                                "nameBn": "অ্যাড. রফিকুল হাসান"}  # fmt: skip
    assert status["stage"] == "received"
