"""The court's own API: its register, proceedings, lawyers and cause lists."""

from sqlalchemy import select

from app.models import CourtCase
from tests.records_helpers import CJM, JALAL_NID, NST, RCJ, audit, day, register_case


def test_court_staff_must_be_on_the_roster(client):
    assert client.get("/court/me").status_code == 401
    r = client.get("/court/me", headers={"X-Court-Staff-Id": "CS-99"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Sign in with a court staff ID (X-Court-Staff-Id)"
    # Jail staff are not court staff: a jail cannot read a court's register.
    assert client.get("/court/cases", headers=RCJ).status_code == 401
    me = client.get("/court/me", headers={"X-Court-Staff-Id": "cs-11"}).json()
    assert me["name"] == "Md. Abdul Hakim" and me["designationBn"] == "বেঞ্চ সহকারী"
    assert me["court"] == {
        "id": "RNG-CJM",
        "name": "Chief Judicial Magistrate Court, Rangpur",
        "nameBn": "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
        "kind": "magistrate",
    }


def test_register_a_case_keeps_only_a_hash_of_a_partys_nid(client, db):
    r = client.post(
        "/court/cases",
        json={
            "case_number": "G.R. 455/2026", "case_type": "criminal",
            "title": "State vs. Jalal Uddin", "filed_on": "2026-06-14",
            "parties": [{"role": "accused", "name": "Jalal Uddin", "father_name": "Abdus Sattar",
                         "age": 36, "nid": "2854-106-397"}],
        },
        headers=CJM,
    )  # fmt: skip
    assert r.status_code == 201, r.text
    assert JALAL_NID not in r.text and "6397" not in r.text
    detail = r.json()
    assert detail["court"]["id"] == "RNG-CJM" and detail["status"] == "pending"
    assert detail["parties"] == [
        {"name": "Jalal Uddin", "nameBn": None, "role": "accused", "fatherName": "Abdus Sattar",
         "age": 36},
    ]  # fmt: skip
    assert detail["proceedings"] == [] and detail["causeList"] == [] and detail["custody"] == []
    stored = db.scalars(select(CourtCase)).one()
    assert stored.number_key == "gr455/2026" and stored.created_by == "court:CS-11"
    assert stored.parties[0].nid_last4 == "6397" and len(stored.parties[0].nid_hash) == 64
    [entry] = audit(db, "record.created")
    assert entry.actor == "court:CS-11" and entry.entity_type == "courtCase"


def test_a_case_number_is_registered_once_however_it_is_typed(client):
    register_case(client)
    r = client.post(
        "/court/cases",
        json={"case_number": "GR 455 / 2026", "case_type": "criminal", "title": "Again",
              "parties": [{"role": "accused", "name": "Someone"}]},
        headers=CJM,
    )  # fmt: skip
    assert r.status_code == 409
    assert r.json()["detail"] == "This court already has case GR 455 / 2026"
    # Another court may have its own case with the same number.
    register_case(client, NST, case_type="womenChildren")


def test_a_court_sees_only_its_own_register(client):
    mine = register_case(client)
    assert client.get("/court/cases", headers=NST).json() == []
    for method, path, body in (
        ("get", f"/court/cases/{mine['id']}", None),
        ("patch", f"/court/cases/{mine['id']}", {"status": "disposed"}),
        ("post", f"/court/cases/{mine['id']}/proceedings",
         {"held_on": day(), "kind": "hearing", "summary": "Heard both sides at length."}),
        ("post", f"/court/cases/{mine['id']}/lawyers", {"name": "Adv. X", "side": "defence"}),
        ("get", "/court/cases/9999", None),
    ):  # fmt: skip
        r = client.request(method, path, json=body, headers=NST)
        assert r.status_code == 404, path
    assert client.get(f"/court/cases/{mine['id']}", headers=CJM).status_code == 200


def test_list_searches_number_title_and_party_newest_first(client):
    register_case(client)
    register_case(
        client, case_number="C.R. 88/2026", title="Abdul Jalil vs. Kamal Hossain",
        filed_on="2026-07-01",
        parties=[{"role": "accused", "name": "Kamal Hossain"},
                 {"role": "complainant", "name": "Abdul Jalil"}],
    )  # fmt: skip
    register_case(client, case_number="G.R. 1021/2024", filed_on="2024-09-02", status="disposed")

    def numbers(**params: str) -> list[str]:
        cases = client.get("/court/cases", params=params, headers=CJM).json()
        return [c["caseNumber"] for c in cases]

    assert numbers() == ["C.R. 88/2026", "G.R. 455/2026", "G.R. 1021/2024"]
    assert numbers(q="kamal") == ["C.R. 88/2026"]
    assert numbers(q="gr 455") == ["G.R. 455/2026"]
    assert numbers(q="JALAL") == ["G.R. 455/2026", "G.R. 1021/2024"]
    assert numbers(q="Jalil") == ["C.R. 88/2026"]
    assert numbers(status="disposed") == ["G.R. 1021/2024"]
    assert numbers(q="100%") == []


def test_proceedings_fix_the_next_date_and_a_judgment_ends_the_case(client, db):
    case = register_case(client)
    path = f"/court/cases/{case['id']}/proceedings"
    base = {"kind": "hearing", "summary": "Charge sheet received from police."}
    assert client.post(path, json={**base, "held_on": day(1)}, headers=CJM).status_code == 422
    same_day = {**base, "held_on": day(-1), "next_date": day(-1)}
    assert client.post(path, json=same_day, headers=CJM).status_code == 422
    short = {**base, "held_on": day(-1), "summary": "Too short"}
    assert client.post(path, json=short, headers=CJM).status_code == 422

    r = client.post(path, json={**base, "held_on": day(-40), "next_date": day(-20),
                                "next_purpose": "For police report"}, headers=CJM)  # fmt: skip
    assert r.status_code == 201, r.text
    assert r.json()["nextDate"] is None  # that date has passed
    r = client.post(path, json={**base, "held_on": day(-20), "kind": "chargeFraming",
                                "next_date": day(3), "next_purpose": "For evidence"},
                    headers=CJM)  # fmt: skip
    detail = r.json()
    assert [p["kind"] for p in detail["proceedings"]] == ["hearing", "chargeFraming"]
    assert detail["proceedings"][1]["recordedBy"] == "court:CS-11"
    assert (detail["nextDate"], detail["nextPurpose"]) == (day(3), "For evidence")

    judgment = {"held_on": day(), "kind": "judgment", "summary": "The accused is acquitted."}
    assert client.post(path, json={**judgment, "next_date": day(5)}, headers=CJM).status_code == 422
    r = client.post(path, json=judgment, headers=CJM)
    assert r.json()["status"] == "disposed" and r.json()["nextDate"] is None
    assert len(audit(db, "record.updated")) == 3


def test_the_cause_list_comes_before_the_last_proceedings_date(client):
    case = register_case(client)
    client.post(f"/court/cases/{case['id']}/proceedings",
                json={"held_on": day(-5), "kind": "hearing", "summary": "Adjourned for evidence.",
                      "next_date": day(10), "next_purpose": "For evidence"}, headers=CJM)  # fmt: skip
    client.put(f"/court/cause-lists/{day(3)}", headers=CJM,
               json={"entries": [{"serial": 7, "time": "10:30", "case_number": "G.R. 455/2026",
                                  "purpose": "For hearing of the bail petition"}]})  # fmt: skip
    [summary] = client.get("/court/cases", headers=CJM).json()
    assert (summary["nextDate"], summary["nextPurpose"]) == (
        day(3), "For hearing of the bail petition",
    )  # fmt: skip
    detail = client.get(f"/court/cases/{case['id']}", headers=CJM).json()
    assert detail["causeList"] == [
        {"date": day(3), "serial": 7, "time": "10:30",
         "purpose": "For hearing of the bail petition", "judge": None},
    ]  # fmt: skip


def test_update_the_case(client, db):
    case = register_case(client)
    r = client.patch(f"/court/cases/{case['id']}", headers=CJM,
                     json={"restricted": True, "sections": "Penal Code 1860, ss. 379, 411"})  # fmt: skip
    assert r.status_code == 200
    assert r.json()["restricted"] is True and r.json()["sections"].endswith("411")
    [entry] = audit(db, "record.updated")
    assert entry.details == {"fields": ["restricted", "sections"]}
    assert client.patch(f"/court/cases/{case['id']}", json={"title": "x"},
                        headers=CJM).status_code == 422  # fmt: skip


def test_lawyers_who_appeared_and_until_when(client):
    case = register_case(client)
    path = f"/court/cases/{case['id']}/lawyers"
    bad = {"name": "Adv. Nobody", "side": "defence", "panel_lawyer_id": "LAW-99"}
    assert client.post(path, json=bad, headers=CJM).status_code == 422
    r = client.post(path, json={"name": "Adv. Kamrul Hasan", "side": "defence",
                                "from": "2026-06-15"}, headers=CJM)  # fmt: skip
    assert r.status_code == 201
    [kamrul] = r.json()["lawyers"]
    assert kamrul["current"] is True and kamrul["from"] == "2026-06-15"
    end = f"{path}/{kamrul['id']}/end"
    assert client.post(end, json={"until": "2026-06-01"}, headers=CJM).status_code == 422
    r = client.post(end, json={"until": "2026-08-10"}, headers=CJM)
    assert r.json()["lawyers"][0]["until"] == "2026-08-10"
    assert r.json()["lawyers"][0]["current"] is False
    assert client.post(end, json={"until": "2026-08-11"}, headers=CJM).status_code == 409
    assert client.post(f"{path}/999/end", json={"until": "2026-08-11"},
                       headers=CJM).status_code == 404  # fmt: skip
    r = client.post(path, json={"name": "Adv. Taslima Akter", "side": "defence",
                                "panel_lawyer_id": "law-21"}, headers=CJM)  # fmt: skip
    assert r.json()["lawyers"][1]["panelLawyerId"] == "LAW-21"


def test_publish_replace_and_withdraw_a_cause_list(client, db):
    target = day(3)
    path = f"/court/cause-lists/{target}"
    entries = [
        {"serial": 7, "time": "10:30", "case_number": "G.R. 455/2026", "purpose": "For evidence"},
        {"serial": 2, "case_number": "G.R. 612/2026", "purpose": "For police report"},
    ]
    r = client.put(path, json={"judge": "Md. Aminul Islam", "entries": entries}, headers=CJM)
    assert r.status_code == 200, r.text
    listed = r.json()
    assert listed["judge"] == "Md. Aminul Islam" and listed["publishedBy"] == "court:CS-11"
    assert [e["serial"] for e in listed["entries"]] == [2, 7]
    # Not registered yet: listed anyway, linked once the court registers it.
    assert all(e["courtCaseId"] is None for e in listed["entries"])

    case = register_case(client)
    entry = client.get(path, headers=CJM).json()["entries"][1]
    assert (entry["courtCaseId"], entry["title"]) == (case["id"], "State vs. Jalal Uddin")
    overview = client.get("/court/cause-lists", headers=CJM).json()
    assert overview == [{"date": target, "entries": 2}]

    r = client.put(path, json={"entries": entries[:1]}, headers=CJM)
    assert [e["serial"] for e in r.json()["entries"]] == [7] and r.json()["judge"] is None
    r = client.put(path, json={"entries": []}, headers=CJM)
    assert r.json()["entries"] == [] and r.json()["publishedAt"] is None
    assert client.get("/court/cause-lists", headers=CJM).json() == []
    assert [e.details["entries"] for e in audit(db, "causeList.published")] == [2, 1, 0]
    # Another court's list for the day is its own.
    assert client.get(path, headers=NST).json()["entries"] == []


def test_cause_list_validation(client):
    path = f"/court/cause-lists/{day()}"
    twice = [{"serial": 1, "case_number": "A 1/2026", "purpose": "Hearing"},
             {"serial": 1, "case_number": "A 2/2026", "purpose": "Hearing"}]  # fmt: skip
    assert client.put(path, json={"entries": twice}, headers=CJM).status_code == 422
    late = [{"serial": 1, "time": "25:00", "case_number": "A 1/2026", "purpose": "Hearing"}]
    assert client.put(path, json={"entries": late}, headers=CJM).status_code == 422
    blank = [{"serial": 1, "case_number": "./-", "purpose": "Hearing"}]
    assert client.put(path, json={"entries": blank}, headers=CJM).status_code == 422
    too_long = {"from": day(), "to": day(93)}
    assert client.get("/court/cause-lists", params=too_long, headers=CJM).status_code == 422
    backwards = {"from": day(2), "to": day()}
    assert client.get("/court/cause-lists", params=backwards, headers=CJM).status_code == 422
