import asyncio
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.agents import helpline
from app.agents.helpline import HelplineConversation, LLMAnswer, find_token, intent_of
from app.database import utcnow
from app.models import Case, MediationSession, format_token
from app.services.stream_manager import StreamManager
from tests.test_telephony import START, FakeTTS, FakeTwilio, ScriptedTranscriber, until

STATUS = {
    "reference": "DLAS-2026-045",
    "stage": "lawyerAssigned",
    "outcome": None,
    "track": None,
    "office": "Rangpur",
    "nextMediation": None,
    "nextHearing": None,
}


def lookup(token: str) -> dict | None:
    return STATUS if token == "48210937" else None


def test_tracking_numbers_are_found_however_they_are_said():
    assert find_token("it is 4821 0937") == "48210937"
    assert find_token("৪৮২১-০৯৩৭") == "48210937"
    assert find_token("my phone is 01811223344") is None
    assert find_token("case 2026") is None


def test_intents_in_both_languages():
    assert intent_of("I got an SMS saying a case was filed against me") == "notice"
    assert intent_of("আমার বিরুদ্ধে মামলা হয়েছে, এখন কী করব?") == "notice"
    assert intent_of("thanks, and where is the office?") == "office"
    assert intent_of("আমার আবেদনের অবস্থা জানতে চাই") == "track"
    assert intent_of("what's happening with my mother's case?") == "track"
    assert intent_of("How do I file a case for my sister?") == "apply"
    assert intent_of("আমার বিরুদ্ধে মামলা হয়েছে") == "notice"
    assert intent_of("কী কাগজপত্র আনতে হবে?") == "documents"
    assert intent_of("He locked me in the room") == "emergency"
    assert intent_of("ধন্যবাদ") == "goodbye"


def test_asks_for_the_number_then_reads_the_stage_only():
    conv = HelplineConversation(use_default_llm=False)
    assert conv.start("t1", language="en")["reply"].startswith("This is the legal aid helpline.")
    s = conv.turn("t1", "What is happening with my case?", lookup)
    assert s["reply"] == helpline.ASK_TOKEN["en"]
    s = conv.turn("t1", "4821 0937", lookup)
    assert s["reply"] == (
        "Your case DLAS-2026-045 is active and a panel lawyer is working on it. "
        "Is there anything else?"
    )
    s = conv.turn("t1", "1111 2222", lookup)
    assert s["reply"] == helpline.TOKEN_UNKNOWN["en"]
    s = conv.turn("t1", "No, thank you", lookup)
    assert s["complete"] is True and s["reply"] == helpline.GOODBYE["en"]


def test_respondent_hears_what_the_notice_means_in_bangla():
    conv = HelplineConversation(use_default_llm=False)
    conv.start("t2")
    s = conv.turn("t2", "আমি একটা এসএমএস পেয়েছি, আমার বিরুদ্ধে অভিযোগ হয়েছে")
    assert "গ্রেপ্তারি পরোয়ানা নয়" in s["reply"]
    assert s["reply"].endswith(helpline.ANYTHING_ELSE["bn"])


def test_other_questions_go_to_claude_with_the_facts_and_fall_back_to_rules():
    class FakeLLM:
        def __init__(self, result):
            self.result, self.calls = result, []

        def structured(self, **kw):
            self.calls.append(kw)
            return self.result

    llm = FakeLLM(LLMAnswer(answer="Yes, you can ask the officer for a different lawyer."))
    conv = HelplineConversation(llm=llm)
    conv.start("t3", language="en")
    s = conv.turn("t3", "Can I get a different lawyer?")
    assert s["reply"].startswith("Yes, you can ask the officer")
    assert "District Judge Court building" in llm.calls[0]["content"]
    assert "never promise an outcome" in llm.calls[0]["system"]

    conv = HelplineConversation(llm=FakeLLM(None))
    conv.start("t4", language="en")
    assert conv.turn("t4", "Can I get a different lawyer?")["reply"].startswith("I can tell you")


def test_http_tracking_reveals_stage_not_details(client, db):
    body = {
        "applicant": {"name": "Abdul Malek", "phone": "01819000560", "district": "Rangpur"},
        "narrative": "My cousins have occupied 22 decimals of my inherited farmland.",
        "respondent": {"name": "Abdul Jalil", "relation": "cousin"},
    }
    ref = client.post("/intake/web", json=body).json()["id"]
    case = db.scalars(select(Case)).one()
    token = format_token(case.tracking_token or "")

    status = client.get(f"/helpline/track/{token}").json()
    assert status == {**STATUS, "reference": ref, "stage": "received"}
    assert "Malek" not in str(status) and "farmland" not in str(status)
    assert client.get("/helpline/track/0000-0000").status_code == 404

    client.post(f"/dlao/cases/{ref}/promote")
    db.add(
        MediationSession(case_id=case.id, scheduled_for=utcnow() + timedelta(days=3),
                         mode="in_person", created_by="dlao-1")
    )  # fmt: skip
    db.commit()
    status = client.get(f"/helpline/track/{case.tracking_token}").json()
    assert status["stage"] == "accepted" and status["nextMediation"] is not None

    sid = client.post("/helpline/conversations", json={"language": "en"}).json()["sessionId"]
    r = client.post(f"/helpline/conversations/{sid}/turns", json={"utterance": f"status {token}"})
    assert r.json()["reply"].startswith(f"Your case {status['reference']} has been accepted")
    assert "The next mediation session is on" in r.json()["reply"]
    client.post(f"/helpline/conversations/{sid}/turns", json={"utterance": "bye"})
    again = client.post(f"/helpline/conversations/{sid}/turns", json={"utterance": "hello"})
    assert again.status_code == 409


def test_voice_webhook_marks_the_helpline_line(client, monkeypatch):
    from app.config import get_settings

    s = get_settings()
    monkeypatch.setattr(s, "elevenlabs_api_key", "xi")
    monkeypatch.setattr(s, "elevenlabs_voice_id", "voice1")
    r = client.post("/telephony/voice?line=helpline", data={"CallSid": "CA9"})
    assert '<Parameter name="line" value="helpline"/>' in r.text


def test_phone_call_on_the_helpline_line_reads_the_case_stage(db_engine):
    factory = sessionmaker(bind=db_engine, expire_on_commit=False)
    with factory() as db:
        db.add(
            Case(application_id="APP-2026-777", tracking_token="48210937", channel="hotline",
                 current_office="Rangpur", summary="x")
        )  # fmt: skip
        db.commit()

    async def scenario():
        ws, tts, stt = FakeTwilio(), FakeTTS(), ScriptedTranscriber()
        manager = StreamManager(
            ws,
            tts=tts,
            transcriber_factory=lambda lang: stt,
            helpline_agent=HelplineConversation(use_default_llm=False),
            session_factory=factory,
        )
        runner = asyncio.create_task(manager.run())
        params = {"language": "en", "line": "helpline", "caller": "+8801811223344"}
        ws.push({**START, "start": {**START["start"], "customParameters": params}})
        await until(lambda: len(tts.spoken) == 1)
        stt.say("my tracking number is 4821 0937")
        stt.say("that's all, thank you")
        await asyncio.wait_for(runner, 5)
        return tts, manager

    tts, manager = asyncio.run(scenario())
    assert tts.spoken[1].startswith("Your application APP-2026-777 has been received")
    assert tts.spoken[-1] == helpline.GOODBYE["en"]
    assert manager.case_ref is None  # the helpline never files anything
    with factory() as db:
        assert len(db.scalars(select(Case)).all()) == 1


def test_reads_the_next_court_date_the_lawyer_reported(client, db):
    body = {
        "applicant": {"name": "Abdul Malek", "district": "Rangpur"},
        "narrative": "My cousins have taken my inherited farmland. I have the deed and khatian.",
    }
    ref = client.post("/intake/web", json=body).json()["id"]
    client.post(f"/dlao/cases/{ref}/promote")
    client.post(f"/dlao/cases/{ref}/lawyer", json={"lawyer_id": "LAW-07"})
    update = {
        "stage": "plaintFiled",
        "summary": "Plaint and vakalatnama filed; summons issued to the cousins.",
        "court": "Joint District Judge Court 2, Rangpur",
        "next_hearing_at": (utcnow() + timedelta(days=9)).isoformat(),
    }
    reply = client.post(
        f"/lawyer/cases/{ref}/updates", json=update, headers={"X-Lawyer-Id": "LAW-07"}
    )
    assert reply.status_code == 201, reply.text
    case = db.scalars(select(Case)).one()
    status = client.get(f"/helpline/track/{case.tracking_token}").json()
    assert status["stage"] == "lawyerAssigned" and status["nextHearing"] is not None
    assert "Joint District" not in str(status)
    assert helpline.describe(status, "en").endswith(
        "The next court hearing is on " + helpline.say_date(status["nextHearing"], "en") + "."
    )
