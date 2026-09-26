"""The jail's own API: its prisoners, their court dates and cases."""

from sqlalchemy import select

from app.models import EkycCheck, Prisoner
from tests.records_helpers import (
    CJM,
    JALAL_NID,
    NDJ,
    RCJ,
    RCJ_DESK,
    admit,
    audit,
    check,
    day,
    fake_registry,
    register_case,
)


def test_jail_staff_must_be_on_the_roster(client):
    assert client.get("/prison/me").status_code == 401
    r = client.get("/prison/prisoners", headers=CJM)
    assert r.status_code == 401
    assert r.json()["detail"] == "Sign in with a jail staff ID (X-Prison-Staff-Id)"
    me = client.get("/prison/me", headers=RCJ_DESK).json()
    assert me["name"] == "Nasima Khatun" and me["designation"] == "Legal Aid Desk Officer"
    assert me["prison"]["id"] == "RNG-CJ" and me["prison"]["nameBn"] == "রংপুর কেন্দ্রীয় কারাগার"


def test_admit_a_prisoner(client, db):
    detail = admit(client, nid="2854106397")
    assert JALAL_NID not in str(detail)
    assert detail["prisonerNo"] == "RCJ-2026-0412" and detail["status"] == "undertrial"
    assert detail["nidLast4"] == "6397" and detail["nidVerified"] is False
    assert detail["prison"]["id"] == "RNG-CJ" and detail["ward"] == "Padma-3"
    # Not registered by the court yet.
    [case] = detail["cases"]
    assert case["found"] is False and case["court"]["id"] == "RNG-CJM"
    assert case["caseNumber"] == "GR 455/2026" and case["status"] is None
    assert detail["nextCourtDate"] is None and detail["legalAid"] == []
    [entry] = audit(db, "record.created")
    assert entry.actor == "prison:JS-03" and entry.entity_type == "prisoner"

    r = client.post("/prison/prisoners", headers=RCJ,
                    json={"prisoner_no": "RCJ-2026-0412", "name": "X", "admitted_on": day()})  # fmt: skip
    assert r.status_code == 409
    assert r.json()["detail"] == "This jail already has prisoner RCJ-2026-0412"
    # Another jail numbers its own prisoners.
    admit(client, NDJ)


def test_admit_validation(client):
    base = {"prisoner_no": "RCJ-1", "name": "Harun Mia", "admitted_on": "2026-07-11"}
    unknown = {**base, "cases": [{"court_id": "RNG-XYZ", "case_number": "G.R. 612/2026"}]}
    r = client.post("/prison/prisoners", json=unknown, headers=RCJ)
    assert r.status_code == 422 and r.json()["detail"] == "Unknown court RNG-XYZ"
    tomorrow = {**base, "admitted_on": day(1)}
    assert client.post("/prison/prisoners", json=tomorrow, headers=RCJ).status_code == 422
    bad_nid = {**base, "nid": "123456789012"}
    r = client.post("/prison/prisoners", json=bad_nid, headers=RCJ)
    assert r.status_code == 422 and "123456789012" not in r.text


def test_admit_with_ekyc_takes_identity_from_the_registry(client, db, monkeypatch):
    fake_registry(monkeypatch)
    check_id = check(client, RCJ)["checkId"]
    r = client.post(
        "/prison/prisoners",
        json={"prisoner_no": "RCJ-2026-0412", "name": "Jalal", "admitted_on": "2026-06-15",
              "ekyc_check_id": check_id},
        headers=RCJ,
    )  # fmt: skip
    assert r.status_code == 201, r.text
    assert JALAL_NID not in r.text
    detail = r.json()
    assert detail["name"] == "Jalal Uddin" and detail["nameBn"] == "জালাল উদ্দিন"
    assert detail["fatherName"] == "Abdus Sattar" and detail["gender"] == "male"
    assert detail["nidVerified"] is True and detail["nidLast4"] == "6397"
    assert detail["upazila"] == "Pirgachha" and detail["village"] == "Balarhat"
    stored = db.scalars(select(EkycCheck)).one()
    assert stored.used_for_prisoner_id == detail["id"]
    [entry] = audit(db, "record.created")
    assert entry.details["nidVerified"] is True and entry.details["ekycCheckId"] == stored.id


def test_a_jail_sees_only_its_own_prisoners(client):
    mine = admit(client)
    theirs = admit(client, NDJ, prisoner_no="NDJ-2026-0091", name="Harun Mia", cases=[])
    assert [p["prisonerNo"] for p in client.get("/prison/prisoners", headers=RCJ).json()] == [
        "RCJ-2026-0412"
    ]
    assert client.get(f"/prison/prisoners/{theirs['id']}", headers=RCJ).status_code == 404
    patch = client.patch(f"/prison/prisoners/{theirs['id']}", json={"ward": "A"}, headers=RCJ)
    assert patch.status_code == 404
    assert client.get(f"/prison/prisoners/{mine['id']}", headers=NDJ).status_code == 404
    assert client.get(f"/prison/prisoners/{mine['id']}", headers=RCJ_DESK).status_code == 200


def test_list_search_and_released_prisoners(client):
    admit(client)
    admit(client, prisoner_no="RCJ-2026-0388", name="Sohel Rana", father_name="Abdul Hamid",
          admitted_on="2026-05-03", cases=[])  # fmt: skip
    old = admit(client, prisoner_no="RCJ-2025-0101", name="Rashed Khan", admitted_on="2025-01-10",
                cases=[])  # fmt: skip

    def numbers(**params: str) -> list[str]:
        prisoners = client.get("/prison/prisoners", params=params, headers=RCJ).json()
        return [p["prisonerNo"] for p in prisoners]

    assert numbers() == ["RCJ-2026-0412", "RCJ-2026-0388", "RCJ-2025-0101"]
    r = client.patch(f"/prison/prisoners/{old['id']}", json={"status": "released"}, headers=RCJ)
    assert r.json()["releasedOn"] == day()
    assert numbers() == ["RCJ-2026-0412", "RCJ-2026-0388"]
    assert numbers(include_released="true") == ["RCJ-2026-0412", "RCJ-2026-0388", "RCJ-2025-0101"]
    assert numbers(status="released") == ["RCJ-2025-0101"]
    assert numbers(q="hamid") == ["RCJ-2026-0388"]
    assert numbers(q="0412") == ["RCJ-2026-0412"]


def test_update_replaces_the_cases(client, db):
    prisoner = admit(client)
    path = f"/prison/prisoners/{prisoner['id']}"
    r = client.patch(path, headers=RCJ, json={
        "ward": "Jamuna-1",
        "cases": [{"court_id": "RNG-CJM", "case_number": "G.R. 455/2026"},
                  {"court_id": "rng-dsj", "case_number": "Sessions 76/2026"}],
    })  # fmt: skip
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["ward"] == "Jamuna-1"
    # The kept case keeps how the jail first typed it.
    assert [(c["court"]["id"], c["caseNumber"]) for c in detail["cases"]] == [
        ("RNG-CJM", "GR 455/2026"), ("RNG-DSJ", "Sessions 76/2026"),
    ]  # fmt: skip
    r = client.patch(path, json={"cases": []}, headers=RCJ)
    assert r.json()["cases"] == []
    early = client.patch(path, json={"released_on": "2026-01-01"}, headers=RCJ)
    assert early.status_code == 422
    assert [e.details["fields"] for e in audit(db, "record.updated")] == [
        ["cases", "ward"],
        ["cases"],
    ]


def test_a_prisoners_case_links_once_the_court_registers_it(client):
    prisoner = admit(client)
    client.put(f"/court/cause-lists/{day(3)}", headers=CJM,
               json={"entries": [{"serial": 7, "time": "10:30", "case_number": "G.R. 455/2026",
                                  "purpose": "For evidence"}]})  # fmt: skip
    detail = client.get(f"/prison/prisoners/{prisoner['id']}", headers=RCJ).json()
    [case] = detail["cases"]
    # Listed but not registered: the jail still sees the date it must produce him.
    assert case["found"] is False and case["nextDate"] == day(3)
    assert case["causeList"][0]["serial"] == 7 and detail["nextCourtDate"] == day(3)

    register_case(client)
    [case] = client.get(f"/prison/prisoners/{prisoner['id']}", headers=RCJ).json()["cases"]
    assert case["found"] is True and case["caseNumber"] == "G.R. 455/2026"
    assert case["caseType"] == "criminal" and case["status"] == "pending"
    assert (case["nextDate"], case["nextPurpose"]) == (day(3), "For evidence")


def test_next_court_date_falls_back_to_the_last_proceeding(client):
    court_case = register_case(client)
    client.post(f"/court/cases/{court_case['id']}/proceedings", headers=CJM,
                json={"held_on": day(-7), "kind": "bail", "summary": "Bail petition rejected.",
                      "next_date": day(9), "next_purpose": "For hearing"})  # fmt: skip
    prisoner = admit(client)
    [summary] = client.get("/prison/prisoners", headers=RCJ).json()
    assert summary["id"] == prisoner["id"] and summary["nextCourtDate"] == day(9)


def test_court_dates_are_the_production_list(client):
    admit(client)
    admit(client, prisoner_no="RCJ-2026-0450", name="Mofiz Uddin",
          cases=[{"court_id": "RNG-DSJ", "case_number": "Sessions 76/2026"}])  # fmt: skip
    released = admit(client, prisoner_no="RCJ-2026-0001", name="Freed Man",
                     cases=[{"court_id": "RNG-CJM", "case_number": "C.R. 88/2026"}])  # fmt: skip
    client.patch(f"/prison/prisoners/{released['id']}", json={"status": "released"}, headers=RCJ)
    admit(client, NDJ, prisoner_no="NDJ-2026-0091", name="Harun Mia",
          cases=[{"court_id": "RNG-CJM", "case_number": "G.R. 612/2026"}])  # fmt: skip
    client.put(f"/court/cause-lists/{day(3)}", headers=CJM, json={"entries": [
        {"serial": 7, "time": "10:30", "case_number": "G.R. 455/2026", "purpose": "For evidence"},
        {"serial": 3, "time": "10:00", "case_number": "C.R. 88/2026", "purpose": "For hearing"},
        {"serial": 9, "case_number": "G.R. 612/2026", "purpose": "For police report"},
    ]})  # fmt: skip
    client.put(f"/court/cause-lists/{day(1)}", headers={"X-Court-Staff-Id": "CS-17"}, json={
        "entries": [{"serial": 1, "case_number": "Sessions 76/2026", "purpose": "For charge"}]
    })  # fmt: skip
    client.put(f"/court/cause-lists/{day(20)}", headers=CJM, json={"entries": [
        {"serial": 1, "case_number": "G.R. 455/2026", "purpose": "For argument"}]})  # fmt: skip

    dates = client.get("/prison/court-dates", headers=RCJ).json()
    assert [(d["date"], d["court"]["id"], d["prisoner"]["prisonerNo"]) for d in dates] == [
        (day(1), "RNG-DSJ", "RCJ-2026-0450"),
        (day(3), "RNG-CJM", "RCJ-2026-0412"),
    ]
    assert dates[1] == {
        "date": day(3), "time": "10:30", "serial": 7, "purpose": "For evidence",
        "court": dates[1]["court"], "caseNumber": "G.R. 455/2026",
        "prisoner": {"id": dates[1]["prisoner"]["id"], "prisonerNo": "RCJ-2026-0412",
                     "name": "Jalal Uddin", "nameBn": None},
    }  # fmt: skip
    wider = client.get("/prison/court-dates", params={"to": day(30)}, headers=RCJ).json()
    assert [d["date"] for d in wider] == [day(1), day(3), day(20)]
    assert [d["prisoner"]["prisonerNo"] for d in client.get(
        "/prison/court-dates", headers=NDJ).json()] == ["NDJ-2026-0091"]  # fmt: skip
    too_long = {"from": day(), "to": day(63)}
    assert client.get("/prison/court-dates", params=too_long, headers=RCJ).status_code == 422


def test_prisoner_nid_is_only_ever_hashed(client, db):
    admit(client, nid=JALAL_NID)
    stored = db.scalars(select(Prisoner)).one()
    assert stored.nid_last4 == "6397" and stored.nid_hash and JALAL_NID not in stored.nid_hash
    for path in ("/prison/prisoners", f"/prison/prisoners/{stored.id}"):
        assert JALAL_NID not in client.get(path, headers=RCJ).text


def test_cause_list_and_case_show_who_is_in_custody(client):
    case = register_case(client)
    client.put(f"/court/cause-lists/{day(1)}", headers=CJM,
               json={"entries": [{"serial": 1, "case_number": "G.R. 455/2026",
                                  "purpose": "For evidence"}]})  # fmt: skip
    assert client.get(f"/court/cause-lists/{day(1)}", headers=CJM).json()["entries"][0][
        "inCustody"
    ] is False  # fmt: skip
    prisoner = admit(client)
    [entry] = client.get(f"/court/cause-lists/{day(1)}", headers=CJM).json()["entries"]
    assert entry["inCustody"] is True
    detail = client.get(f"/court/cases/{case['id']}", headers=CJM).json()
    assert detail["custody"] == [
        {"prison": {"id": "RNG-CJ", "name": "Rangpur Central Jail",
                    "nameBn": "রংপুর কেন্দ্রীয় কারাগার"},
         "prisonerNo": "RCJ-2026-0412", "status": "undertrial"},
    ]  # fmt: skip
    client.patch(f"/prison/prisoners/{prisoner['id']}", json={"status": "released"}, headers=RCJ)
    [entry] = client.get(f"/court/cause-lists/{day(1)}", headers=CJM).json()["entries"]
    assert entry["inCustody"] is False
