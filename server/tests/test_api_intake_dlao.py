from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.agents import t5_intake
from app.database import utcnow
from app.models import Case, PartyRole
from app.services import adnsms
from tests.nid_fakes import FakeRegistry

YEAR = utcnow().year

MOYURI = {
    "applicant": {
        "name": "Moyuri Akter",
        "name_bn": "ময়ূরী আক্তার",
        "phone": "01712-345-318",
        "nid": "1990123456782741",
        "village": "Shyampur",
        "upazila": "Pirgachha",
        "district": "Rangpur",
        "age": 29,
    },
    "narrative": (
        "Neighbour reports repeated physical assault by the husband, most recently two days "
        "ago with visible injuries. The husband monitors her phone. Two children live in the home."
    ),
    "proxy": {"name": "Rahela Khatun", "relation": "neighbour"},
    "respondent": {"name": "Jalal Uddin", "relation": "husband"},
    "safe_contact_windows": [{"day": 2, "start_hour": 14, "end_hour": 16}],
}

OFFICER = {"X-Officer-Id": "DLAO-RNG-01"}


def create_moyuri(client) -> dict:
    r = client.post("/intake/web", json=MOYURI, headers=OFFICER)
    assert r.status_code == 201, r.text
    return r.json()


def test_web_intake_creates_triaged_application(client):
    case = create_moyuri(client)
    assert case["id"] == f"APP-{YEAR}-001"
    assert case["channel"] == "proxy"
    assert case["category"] == "domesticViolence"
    assert case["priority"] == "high"
    assert case["triage"]["status"] == "pending"
    assert {"proxyReported", "restrictedContact"} <= set(case["flags"])
    assert {"actionToday", "pendingTriage"} <= set(case["queues"])
    assert case["applicant"]["safetyLevel"] == "restricted"
    assert case["applicant"]["phone"] == "01712-XXX-318"
    assert case["applicant"]["nidMasked"] == "•••• •••• 2741"
    assert case["proxy"] == {
        "name": "Rahela Khatun", "nameBn": None, "relation": "neighbour", "nidVerified": False,
    }  # fmt: skip
    assert case["track"]["key"] == "sensitive" and case["track"]["status"] == "suggested"
    assert case["identity"] == {
        "filingFor": "other", "applicantVerified": False, "callerVerified": False,
        "callerSimRegistered": False,
    }  # fmt: skip
    assert len(case["trackingToken"]) == 9 and case["trackingToken"][4] == "-"
    assert case["doNotCall"] is None
    assert case["notices"]["respondent"]["status"] == "notFound"


def test_invalid_phone_is_rejected(client):
    bad = {**MOYURI, "applicant": {**MOYURI["applicant"], "phone": "12345"}}
    assert client.post("/intake/web", json=bad).status_code == 422


def test_client_ref_makes_resubmission_idempotent(client):
    body = {**MOYURI, "client_ref": "pwa-7f3c"}
    first = client.post("/intake/web", json=body).json()
    second = client.post("/intake/web", json=body).json()
    assert first["id"] == second["id"]
    assert len(client.get("/dlao/cases").json()) == 1


def test_case_detail_shows_full_phone_and_logs_access(client):
    create_moyuri(client)
    detail = client.get(f"/dlao/cases/APP-{YEAR}-001", headers=OFFICER).json()
    assert detail["applicant"]["phone"] == "01712345318"
    actions = [a["action"] for a in detail["activity"]]
    assert actions[:2] == ["case.created", "triage.generated"]
    assert "case.viewed" not in actions  # access log is kept, but not shown as case history
    assert client.get("/dlao/audit/verify").json() == {"ok": True, "brokenAtSeq": None}


def test_list_filters_by_queue_priority_and_name(client):
    create_moyuri(client)
    land = {
        "applicant": {"name": "Abdul Malek", "district": "Rangpur"},
        "narrative": "My cousin has occupied my land. I have the deed and khatian.",
    }
    client.post("/intake/web", json=land)
    ids = lambda **params: [c["id"] for c in client.get("/dlao/cases", params=params).json()]  # noqa: E731
    assert ids() == [f"APP-{YEAR}-001", f"APP-{YEAR}-002"]  # high before low/medium
    assert ids(q="malek") == [f"APP-{YEAR}-002"]
    assert ids(q="ময়ূরী") == [f"APP-{YEAR}-001"]
    assert ids(priority="high") == [f"APP-{YEAR}-001"]
    counts = client.get("/dlao/queues").json()
    assert counts["all"] == 2 and counts["pendingTriage"] == 2


def test_priority_override_needs_justification_and_is_audited(client):
    create_moyuri(client)
    ref = f"APP-{YEAR}-001"
    short = client.post(
        f"/dlao/cases/{ref}/priority-override", json={"priority": "critical", "justification": "x"}
    )
    assert short.status_code == 422
    r = client.post(
        f"/dlao/cases/{ref}/priority-override",
        json={
            "priority": "critical",
            "justification": "Neighbour called again: threats with a knife.",
        },
        headers=OFFICER,
    )
    assert r.status_code == 200
    case = r.json()
    assert case["priority"] == "critical" and case["priorityChanged"] is True
    override = client.get(f"/dlao/cases/{ref}").json()["activity"][-1]
    assert override["action"] == "priority.override"
    assert override["actor"] == "DLAO-RNG-01"
    assert override["details"] == {"from": "high", "to": "critical", "aiRecommended": "high"}
    assert override["justification"].startswith("Neighbour called again")


def test_accept_triage_and_promote_to_dlas_case(client):
    create_moyuri(client)
    ref = f"APP-{YEAR}-001"
    accepted = client.post(f"/dlao/cases/{ref}/triage/accept").json()
    assert "pendingTriage" not in accepted["queues"]
    promoted = client.post(f"/dlao/cases/{ref}/promote").json()
    assert promoted["id"] == f"DLAS-{YEAR}-001"
    assert promoted["applicationId"] == ref
    assert promoted["status"] == "active"
    # Both references keep working.
    assert client.get(f"/dlao/cases/DLAS-{YEAR}-001").status_code == 200
    assert client.post(f"/dlao/cases/{ref}/promote").status_code == 409


def test_unknown_case_is_404(client):
    assert client.get("/dlao/cases/APP-1999-999").status_code == 404


def test_contact_window_and_message_respect_safe_contact(client):
    create_moyuri(client)
    ref = f"APP-{YEAR}-001"
    window = client.get(f"/dlao/cases/{ref}/contact-window").json()
    assert window["neutralOnly"] is True
    if not window["allowed"]:
        assert window["reason"] == "outside_safe_window" and window["nextWindow"]
    msg = client.post(
        f"/dlao/cases/{ref}/messages", json={"body": "Your DV case hearing is Sunday"}
    )
    assert msg.json()["sent"] is False  # no neutral text, and restricted party


def test_lawyer_inactivity_raises_t1_alert(client, db):
    create_moyuri(client)
    ref = f"APP-{YEAR}-001"
    client.post(f"/dlao/cases/{ref}/lawyer", json={"lawyer_id": "LAW-21"})
    case = db.scalars(select(Case)).one()
    case.lawyer_last_update_at = utcnow() - timedelta(days=30)
    db.commit()
    alerts = client.get("/dlao/alerts").json()
    assert {"caseId": ref, "type": "lawyerInactivity"}.items() <= next(
        a for a in alerts if a["type"] == "lawyerInactivity"
    ).items()
    assert "alerts" in client.get(f"/dlao/cases/{ref}").json()["queues"]
    client.post(f"/dlao/cases/{ref}/lawyer-update")
    assert not [a for a in client.get("/dlao/alerts").json() if a["type"] == "lawyerInactivity"]


def test_udc_intake_records_operator(client):
    body = {**MOYURI, "proxy": None, "udc_center": "Pirgachha UDC", "operator_id": "UDC-44"}
    case = client.post("/intake/udc", json=body).json()
    assert case["channel"] == "udc"
    assert case["applicant"]["provenance"] == "udc_operator"


def test_t5_conversation_creates_application(client):
    start = client.post(
        "/intake/conversations", json={"channel": "hotline_16699", "language": "en"}
    )
    sid = start.json()["sessionId"]
    turns = [
        "My neighbour's husband beats her and she has visible injuries",
        "I am calling for my neighbour",
        "My name is Ripon",
        "Moyuri Akter",
        "01712345318 in Rangpur",
        "Her husband Jalal Uddin",
        "I don't know",
        "Rangpur",
        "Tuesday 2 to 4 pm, he checks her phone",
    ]
    for utterance in turns:
        last = client.post(
            f"/intake/conversations/{sid}/turns", json={"utterance": utterance}
        ).json()
    assert last["complete"] is True
    assert "phone" not in last["slots"]
    assert last["identity"]["caller"] == "unavailable"  # no NID registry configured
    case = last["case"]
    assert case["proxy"]["name"] == "Ripon"
    assert case["proxy"]["relation"] == "reported by phone"
    assert case["respondent"] == {
        "name": "Jalal Uddin", "nameBn": None, "relation": "husband", "nidVerified": False,
        "registeredSims": 0,
    }  # fmt: skip
    assert case["category"] == "domesticViolence"
    assert case["applicant"]["safetyLevel"] == "restricted"
    assert case["applicant"]["safeContactWindows"] == [{"day": 2, "start_hour": 14, "end_hour": 16}]
    again = client.post(f"/intake/conversations/{sid}/turns", json={"utterance": "hello"})
    assert again.status_code == 409


def test_t5_emergency_creates_critical_escalated_application(client):
    sid = client.post("/intake/conversations", json={"channel": "hotline_16699"}).json()[
        "sessionId"
    ]
    r = client.post(
        f"/intake/conversations/{sid}/turns", json={"utterance": "ও এখনই আমাকে মেরে ফেলবে"}
    )
    body = r.json()
    assert body["emergency"] is True
    assert body["case"]["priority"] == "critical"
    assert "escalated" in body["case"]["flags"]
    assert body["case"]["applicant"]["name"] == "Unknown caller"


@pytest.fixture
def nid_registry(monkeypatch):
    registry = FakeRegistry()
    conv = t5_intake.IntakeConversation(use_default_llm=False, registry=registry)
    monkeypatch.setattr(t5_intake, "_conversations", conv)
    return registry


def say(client, sid: str, *utterances: str) -> dict:
    body: dict = {}
    for u in utterances:
        r = client.post(f"/intake/conversations/{sid}/turns", json={"utterance": u})
        assert r.status_code == 200, r.text
        body = r.json()
    return body


def test_t5_son_applies_for_his_mother_with_nid_matches(client, db, nid_registry):
    sid = client.post("/intake/conversations", json={"language": "en"}).json()["sessionId"]
    last = say(client, sid, "My mother's employer Kamal Hossain has not paid her wages",
               "for my mother", "Rafiqul Islam", "Md Abdul Karim", "Rangpur", "2 June 1994",
               "Rahima Khatun", "Kamal Hossain", "Abdul Hamid", "Gaibandha", "no, not now",
               "01811223344", "any time")  # fmt: skip
    assert last["complete"] is True
    assert last["identity"] == {
        "caller": "verified",
        "applicant": "verified",
        "respondent": "found",
    }
    assert not {"father_name", "date_of_birth", "phone"} & set(last["slots"])

    case = db.scalars(select(Case)).one()
    mother, son = case.applicant, case.party_with_role(PartyRole.PROXY)
    assert mother is not None and son is not None
    assert (mother.name, mother.nid_verified, mother.guardian_name) == (
        "Rahima Khatun", True, "Nurul Haque",
    )  # fmt: skip
    assert mother.date_of_birth == date(1968, 11, 20) and mother.nid_last4 == "0002"
    assert (son.name, son.nid_verified, son.phone) == ("Rafiqul Islam", True, None)
    assert case.parties[1].relation == "son"
    kamal = case.party_with_role(PartyRole.RESPONDENT)
    assert kamal is not None and kamal.nid_verified
    assert (kamal.phone, kamal.registered_phones) == ("01911000001", ["01911000001", "01611000002"])
    assert case.intake_data["notify_respondent"] is False
    assert case.intake_data["identity"]["filingFor"] == "mother"
    assert len(case.call_notes) == 13
    assert case.track == "mediation"


def test_call_cut_while_describing_violence_is_marked_do_not_call(client, db):
    sid = client.post("/intake/conversations", json={"language": "en"}).json()["sessionId"]
    say(client, sid, "My husband beats me every night and I am injured", "for myself",
        "Moyuri Akter")  # fmt: skip
    case = client.post(f"/intake/conversations/{sid}/end").json()["case"]
    assert {"callDropped", "doNotCall"} <= set(case["flags"])
    row = db.scalars(select(Case)).one()
    assert row.do_not_call_reason == "dangerCallCut"
    assert row.applicant is not None and row.applicant.safety_level == "no_contact"
    assert [n["topic"] for n in row.call_notes] == ["problem", "filing_for", "caller_name"]
    # Ending again (a late hang-up after a finished call, say) changes nothing.
    again = client.post(f"/intake/conversations/{sid}/end").json()["case"]
    assert again["id"] == case["id"]


def test_hostage_call_cut_early_is_still_recorded_as_do_not_call(client, db):
    sid = client.post("/intake/conversations", json={}).json()["sessionId"]
    body = say(client, sid, "আমাকে ঘরে আটকে রেখেছে")
    assert body["hostage"] is True and body["complete"] is False
    case = client.post(f"/intake/conversations/{sid}/end").json()["case"]
    assert "doNotCall" in case["flags"] and case["priority"] == "critical"
    row = db.scalars(select(Case)).one()
    assert row.do_not_call_reason == "hostage"
    assert row.summary == "আমাকে ঘরে আটকে রেখেছে"


def test_call_cut_before_anything_useful_creates_nothing(client):
    sid = client.post("/intake/conversations", json={}).json()["sessionId"]
    say(client, sid, "নিজের জন্য")
    assert client.post(f"/intake/conversations/{sid}/end").json() == {"case": None}
    assert client.get("/dlao/cases").json() == []


def test_unknown_conversation_is_404(client):
    r = client.post("/intake/conversations/nope/turns", json={"utterance": "hi"})
    assert r.status_code == 404


def test_triage_marks_track_and_hostage_blocks_contact_without_lowering_it(client, db):
    hostage = {
        "applicant": {"name": "Shirin Akter", "phone": "01711000222", "district": "Rangpur"},
        "narrative": "My sister says her husband locked her in the room and checks her phone.",
        "proxy": {"name": "Rafiqul Islam", "relation": "brother"},
    }
    ref = client.post("/intake/web", json=hostage).json()["id"]
    case = db.scalars(select(Case)).one()
    assert case.track == "sensitive" and case.track_status == "suggested"
    assert case.do_not_call_reason == "hostage"
    assert {"doNotCall", "sensitive"} <= set(case.flags)
    # The phone-monitoring sign recommends "restricted"; it must not lower no_contact.
    assert case.applicant is not None and case.applicant.safety_level == "no_contact"
    assert client.get(f"/dlao/cases/{ref}/contact-window").json()["reason"] == "do_not_contact"

    case.track, case.track_status = "mediation", "changed"
    db.commit()
    client.post(f"/dlao/cases/{ref}/triage/rerun")
    db.expire_all()
    assert db.scalars(select(Case)).one().track == "mediation"


def test_officer_confirms_or_changes_the_track_with_a_reason(client):
    ref = create_moyuri(client)["id"]
    confirmed = client.post(f"/dlao/cases/{ref}/track", json={"track": "sensitive"}).json()
    assert confirmed["track"]["status"] == "confirmed"
    short = client.post(
        f"/dlao/cases/{ref}/track", json={"track": "mediation", "justification": "ok"}
    )
    assert short.status_code == 422
    reason = "Both sides asked for a family meeting; the violence was a single past incident."
    changed = client.post(
        f"/dlao/cases/{ref}/track", json={"track": "mediation", "justification": reason}
    ).json()
    assert changed["track"] == {**changed["track"], "key": "mediation", "status": "changed",
                                "aiKey": "sensitive"}  # fmt: skip
    assert "sensitive" not in changed["flags"]
    detail = client.get(f"/dlao/cases/{ref}", headers=OFFICER).json()
    reviews = [a for a in detail["activity"] if a["action"] == "track.reviewed"]
    assert reviews[-1]["justification"] == reason
    assert reviews[-1]["details"] == {
        "from": "sensitive",
        "to": "mediation",
        "aiSuggested": "sensitive",
    }


def test_officer_lifts_do_not_call_with_a_reason(client, db):
    body = {
        "applicant": {"name": "Shirin Akter", "phone": "01711000222", "district": "Rangpur"},
        "narrative": "Her husband locked her in the house last week; she is now with us.",
        "proxy": {"name": "Rafiqul Islam", "relation": "brother"},
    }
    ref = client.post("/intake/web", json=body).json()["id"]
    detail = client.get(f"/dlao/cases/{ref}", headers=OFFICER).json()
    assert detail["doNotCall"] == {"reason": "hostage"}
    assert detail["callNotes"] == []
    why = "Spoke to her in person at the office; she is safe at her brother's home now."
    r = client.post(f"/dlao/cases/{ref}/safety", json={"level": "restricted", "justification": why})
    lifted = r.json()
    assert lifted["doNotCall"] is None and "doNotCall" not in lifted["flags"]
    assert lifted["applicant"]["safetyLevel"] == "restricted"
    assert client.get(f"/dlao/cases/{ref}/contact-window").json()["reason"] != "do_not_contact"


def test_officer_releases_a_held_respondent_notice(client, db, monkeypatch):
    sent: list[str] = []

    def fake_send(self, mobile, message):
        sent.append(mobile)
        return adnsms.SmsResult(ok=True, dry_run=True)

    monkeypatch.setattr(adnsms.AdnSmsClient, "send", fake_send)
    ref = create_moyuri(client)["id"]
    why = "Applicant asked us in person to notify him; she is staying with her parents."
    none = client.post(f"/dlao/cases/{ref}/respondent-notice", json={"justification": why})
    assert none.status_code == 409  # a web form gives no registered number for Jalal

    case = db.scalars(select(Case)).one()
    husband = case.party_with_role(PartyRole.RESPONDENT)
    assert husband is not None
    husband.registered_phones = ["01911457820"]
    db.commit()
    released = client.post(f"/dlao/cases/{ref}/respondent-notice", json={"justification": why})
    assert released.status_code == 200, released.text
    assert released.json()["notices"]["respondent"]["releasedByOfficer"] is True
    assert sent == ["01911457820"]
    again = client.post(f"/dlao/cases/{ref}/respondent-notice", json={"justification": why})
    assert again.status_code == 409
