from app.database import utcnow

YEAR = utcnow().year


def apply(client, name="Rohima Begum", phone="01812345678", nid=None, **extra):
    applicant = {
        "name": name,
        "phone": phone,
        "village": "Kaunia Bazar",
        "upazila": "Kaunia",
        "district": "Rangpur",
        "age": 34,
        **({"nid": nid} if nid else {}),
    }
    body = {
        "applicant": applicant,
        "narrative": extra.pop("narrative", "Husband stopped paying maintenance for our children."),
        **extra,
    }
    r = client.post("/intake/web", json=body)
    assert r.status_code == 201, r.text
    return r.json()


# --- T4 duplicates -----------------------------------------------------------


def test_same_person_details_but_different_nids_is_flagged_and_merge_is_blocked(client):
    first = apply(client, nid="1985123456781111")
    second = apply(client, nid="1985123456782222")
    assert "duplicates" in second["queues"]
    assert "possibleDuplicate" in second["flags"]

    [review] = client.get("/duplicates").json()
    assert 0.8 <= review["score"] < 1
    assert {"name", "phone", "village"} <= set(review["matchingFields"])
    assert "nid" not in review["matchingFields"]
    assert review["mergeBlocked"] == "different_national_ids"
    assert {tuple(r["cases"]) for r in review["records"]} == {(first["id"],), (second["id"],)}

    blocked = client.post(f"/duplicates/{review['id']}/resolve", json={"decision": "merge"})
    assert blocked.status_code == 409

    done = client.post(
        f"/duplicates/{review['id']}/resolve",
        json={"decision": "distinct", "note": "Different NIDs; sisters-in-law."},
        headers={"X-Officer-Id": "DLAO-1"},
    ).json()
    assert done["status"] == "distinct"
    assert client.get("/duplicates").json() == []
    case = client.get(f"/dlao/cases/{second['id']}").json()
    assert "possibleDuplicate" not in case["flags"]
    assert "duplicates" not in case["queues"]
    assert case["activity"][-1]["action"] == "duplicate.resolved"


def test_merge_moves_cases_onto_the_older_record(client):
    first = apply(client)
    second = apply(client, name="Rohima  Begum")
    [review] = client.get("/duplicates").json()
    assert review["mergeBlocked"] is None
    merged = client.post(f"/duplicates/{review['id']}/resolve", json={"decision": "merge"}).json()
    assert merged["status"] == "merged"
    older = merged["records"][0]
    assert sorted(older["cases"]) == sorted([first["id"], second["id"]])
    assert merged["records"][1]["cases"] == []


def test_different_people_in_same_upazila_are_not_flagged(client):
    apply(client)
    other = apply(client, name="Abdul Malek", phone="01912345678")
    assert "possibleDuplicate" not in other["flags"]
    assert client.get("/duplicates").json() == []


def test_score_endpoint_does_not_record_anything(client):
    a = apply(client)["applicant"]["id"]
    b = apply(client, name="Rahima Begum", phone="01712000000")["applicant"]["id"]
    result = client.get("/duplicates/score", params={"a": a, "b": b}).json()
    assert 0 < result["score"] < 1
    assert set(result["fields"]) >= {"name", "phone", "village", "age"}


# --- T2 referrals -------------------------------------------------------------


def refer(client, case_id, to, reason="Applicant now lives in this district."):
    return client.post("/referrals", json={"case_ref": case_id, "to_office": to, "reason": reason})


def test_referral_accept_moves_case(client):
    case = apply(client)
    r = refer(client, case["id"], "Dhaka")
    assert r.status_code == 201 and r.json()["escalated"] is False
    assert client.get(f"/dlao/cases/{case['id']}").json()["status"] == "referred"
    # One open referral at a time.
    assert refer(client, case["id"], "Gazipur").status_code == 409
    accepted = client.post(f"/referrals/{r.json()['id']}/respond", json={"accept": True}).json()
    assert accepted["status"] == "accepted"
    assert client.get(f"/dlao/cases/{case['id']}").json()["currentOffice"] == "Dhaka"


def test_ping_pong_back_to_previous_office_is_escalated(client):
    case = apply(client)
    first = refer(client, case["id"], "Dhaka").json()
    client.post(f"/referrals/{first['id']}/respond", json={"accept": True})
    bounce = refer(client, case["id"], "Rangpur", "Applicant's husband lives in Rangpur.").json()
    assert bounce["escalated"] is True
    assert bounce["status"] == "escalated"
    assert "Rangpur" in bounce["escalationReason"]
    view = client.get(f"/dlao/cases/{case['id']}").json()
    assert "jurisdictionEscalation" in view["flags"]
    assert "alerts" in view["queues"]
    assert view["currentOffice"] == "Dhaka"
    assert [e["caseId"] for e in client.get("/referrals/escalated").json()] == [case["id"]]
    assert any(a["type"] == "referralEscalated" for a in client.get("/dlao/alerts").json())


def test_hop_limit_escalates(client):
    case = apply(client)
    for office in ("Dhaka", "Gazipur"):
        r = refer(client, case["id"], office).json()
        client.post(f"/referrals/{r['id']}/respond", json={"accept": True})
    third = refer(client, case["id"], "Khulna").json()
    assert third["escalated"] is True
    assert "limit" in third["escalationReason"]


def test_returning_a_referral_needs_a_reason(client):
    case = apply(client)
    r = refer(client, case["id"], "Dhaka").json()
    assert client.post(f"/referrals/{r['id']}/respond", json={"accept": False}).status_code == 422
    returned = client.post(
        f"/referrals/{r['id']}/respond", json={"accept": False, "note": "Not our district."}
    ).json()
    assert returned["status"] == "returned"
    assert client.get(f"/dlao/cases/{case['id']}").json()["currentOffice"] == "Rangpur"


# --- T3 incidents -------------------------------------------------------------

WAGES = "Factory owner at Kaunia Textiles has not paid wages for three months to all workers."


def test_incident_suggestions_and_linking(client):
    a = apply(client, name="Karim Mia", phone="01711111111", narrative=WAGES)
    b = apply(
        client, name="Jorina Khatun", phone="01722222222", narrative=WAGES + " I am a helper."
    )
    apply(client, name="Salma", phone="01733333333", narrative="My husband beats me every day.")

    suggestions = client.get("/incidents/suggestions", params={"case_ref": a["id"]}).json()
    assert [s["caseId"] for s in suggestions] == [b["id"]]
    assert set(suggestions[0]["reasons"]) >= {"same area", "similar account"}

    incident = client.post(
        "/incidents",
        json={
            "title": "Kaunia Textiles unpaid wages",
            "location": "Kaunia",
            "respondent": "Kaunia Textiles",
            "occurred_on": "2026-06-30",
            "case_refs": [a["id"], b["id"]],
        },
    ).json()
    assert incident["id"] == f"INC-{YEAR}-001"
    assert incident["caseCount"] == 2
    assert client.get(f"/dlao/cases/{a['id']}").json()["incidentId"] is not None

    after = client.delete(f"/incidents/{incident['id']}/cases/{b['id']}").json()
    assert after["caseCount"] == 1
    assert client.get("/incidents").json()[0]["caseCount"] == 1


def test_case_cannot_join_two_incidents(client):
    a = apply(client, narrative=WAGES)
    first = client.post("/incidents", json={"title": "First", "case_refs": [a["id"]]}).json()
    r = client.post("/incidents", json={"title": "Second", "case_refs": [a["id"]]})
    assert r.status_code == 409
    assert client.get(f"/incidents/{first['id']}").json()["caseCount"] == 1
