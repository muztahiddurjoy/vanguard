import asyncio
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.agents import helpline
from app.agents.helpline import HelplineConversation, LLMAnswer, find_token, intent_of
from app.database import utcnow
from app.models import Case, MediationNotice, MediationSession, Party, format_token
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


def test_hotline_caller_is_asked_for_the_tracking_number_first():
    conv = HelplineConversation(use_default_llm=False)
    s = conv.start("h1", language="en", tracking=True)
    assert s["reply"] == helpline.ASK_TOKEN["en"] and s["awaiting"] == "token"
    s = conv.turn("h1", "4821 0937", lookup)
    assert s["reply"] == f"{helpline.describe(STATUS, 'en')} {helpline.ANYTHING_ELSE['en']}"
    assert s["intent"] == "track" and s["awaiting"] is None

    assert conv.start("h2", tracking=True)["reply"] == helpline.ASK_TOKEN["bn"]
    s = conv.turn("h2", "৪৮২১ ০৯৩৭", lookup)
    assert s["reply"] == f"{helpline.describe(STATUS, 'bn')} {helpline.ANYTHING_ELSE['bn']}"


def test_stops_asking_for_the_number_after_three_misses():
    conv = HelplineConversation(use_default_llm=False)
    conv.start("h3", language="en", tracking=True)
    assert conv.turn("h3", "um", lookup)["reply"] == helpline.ASK_TOKEN["en"]
    assert conv.turn("h3", "1111 2222", lookup)["reply"] == helpline.TOKEN_UNKNOWN["en"]
    s = conv.turn("h3", "3333 4444", lookup)
    assert s["reply"].startswith(helpline.TOKEN_GIVE_UP["en"])
    assert s["reply"].endswith(helpline.ANYTHING_ELSE["en"])
    assert s["awaiting"] is None and s["token_tries"] == 0 and s["complete"] is False
    s = conv.turn("h3", "4821 0937", lookup)
    assert s["reply"].startswith("Your case DLAS-2026-045 is active")


def test_a_caller_without_the_number_is_told_where_to_find_it():
    conv = HelplineConversation(use_default_llm=False)
    conv.start("h4", language="en", tracking=True)
    s = conv.turn("h4", "I don't have it", lookup)
    assert s["reply"] == f"{helpline.NO_TOKEN['en']} {helpline.ANYTHING_ELSE['en']}"
    assert s["awaiting"] is None

    conv.start("h5", tracking=True)
    s = conv.turn("h5", "নম্বরটা হারিয়ে ফেলেছি", lookup)
    assert s["reply"] == f"{helpline.NO_TOKEN['bn']} {helpline.ANYTHING_ELSE['bn']}"

    # A number said with a doubt is still read; so is a goodbye.
    conv.start("h6", language="en", tracking=True)
    s = conv.turn("h6", "I'm not sure, 4821 0937", lookup)
    assert s["reply"].startswith("Your case DLAS-2026-045 is active")
    conv.start("h7", tracking=True)
    s = conv.turn("h7", "নেই, ধন্যবাদ", lookup)
    assert s["intent"] == "goodbye" and s["complete"] is True


def test_a_caller_asked_for_the_number_can_still_apply_or_get_help():
    # The hotline hands the call back to intake on "apply" or "emergency".
    conv = HelplineConversation(use_default_llm=False)
    conv.start("h8", language="en", tracking=True)
    assert conv.turn("h8", "I want to file a new case", lookup)["intent"] == "apply"
    # The menu's own words for it, which the hotline caller has just heard.
    conv.start("h10", tracking=True)
    assert conv.turn("h10", "নতুন মামলা", lookup)["intent"] == "apply"

    conv.start("h9", language="en", tracking=True)
    s = conv.turn("h9", "I don't know it, he is beating me right now", lookup)
    assert s["intent"] == "emergency" and s["complete"] is True
    assert s["reply"] == helpline.EMERGENCY["en"]


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


# --- mediation notices -----------------------------------------------------------------

PLACE = "District Legal Aid Office, Rangpur (District Judge Court building)"
PLACE_BN = "জেলা লিগ্যাল এইড অফিস, রংপুর (জেলা জজ আদালত ভবন)"


def a_notice(**changes) -> dict:
    return {
        "kind": "notice",
        "code": "55556666",
        "reference": "DLAS-2026-045",
        "role": "respondent",
        "scheduledFor": (utcnow() + timedelta(days=3)).isoformat(),
        "place": PLACE,
        "placeBn": PLACE_BN,
        "mode": "in_person",
        "status": "scheduled",
        **changes,
    }


NOTICE = a_notice()


def lookup_both(number: str) -> dict | None:
    return {"48210937": {"kind": "case", **STATUS}, "55556666": NOTICE}.get(number)


def test_mediation_notice_intents():
    assert intent_of("I got a mediation notice") == "mediationNotice"
    assert intent_of("মধ্যস্থতার নোটিশ পেয়েছি, বুঝতে পারছি না") == "mediationNotice"
    assert intent_of("what is my notice number for?") == "mediationNotice"
    # The respondent's "visit the office" SMS is still the other notice.
    assert intent_of("I got a notice that a case was filed against me") == "notice"


def test_reads_a_mediation_notice_and_answers_questions_about_it():
    conv = HelplineConversation(use_default_llm=False)
    conv.start("n1", language="en")
    s = conv.turn("n1", "I got an SMS about a meeting, the number is 5555 6666", lookup_both)
    date = helpline.say_date(NOTICE["scheduledFor"], "en")
    assert s["intent"] == "mediationNotice" and s["notice"] == NOTICE
    assert s["reply"] == (
        "This notice is about a mediation meeting on case DLAS-2026-045. You are invited as the "
        f"other party. The meeting is on {date}. Place: {PLACE}. Mediation is free and "
        "voluntary: nobody has to agree to a settlement. Please bring your NID and the notice "
        "number. If you cannot come, please call the office before the date. If you miss "
        "meetings again and again, your Union Digital Centre may contact you about the next "
        "date. Is there anything else?"
    )

    def ask(question: str) -> str:
        return conv.turn("n1", question, lookup_both)["reply"]

    assert ask("When is it?") == f"The meeting is on {date}. Is there anything else?"
    assert ask("And what time again?") == f"The meeting is on {date}. Is there anything else?"
    assert ask("Where do I have to go?") == f"Place: {PLACE}. Is there anything else?"
    assert ask("What should I bring?").startswith(
        "Please bring your NID, the notice number, 5 5 5 5, 6 6 6 6, and any papers"
    )
    cant = ask("What if I can't come?")
    assert cant.startswith("If you cannot come, please tell the office before the date: call 16430")
    assert "Union Digital Centre" in cant
    assert ask("Can you repeat the notice?").startswith("This notice is about a mediation")
    # A tracking number in the same call is still a case.
    assert ask("my case is 4821 0937").startswith("Your case DLAS-2026-045 is active")
    # What mediation is, and the goodbye, work as always.
    assert ask("Is mediation free?").startswith("In mediation, a legal aid officer")
    s = conv.turn("n1", "that's all, thank you", lookup_both)
    assert s["complete"] is True and s["reply"] == helpline.GOODBYE["en"]


def test_reads_a_mediation_notice_in_bangla():
    conv = HelplineConversation(use_default_llm=False)
    conv.start("n2")
    s = conv.turn("n2", "আমার নোটিশ নম্বর ৫৫৫৫ ৬৬৬৬", lookup_both)
    date = helpline.say_date(NOTICE["scheduledFor"], "bn")
    assert s["reply"].startswith(
        "এই নোটিশটি মামলা DLAS-2026-045-এর একটি মধ্যস্থতা সভা নিয়ে। আপনাকে অপর পক্ষ হিসেবে ডাকা হয়েছে। "
        f"সভার সময় {date}। স্থান: {PLACE_BN}। মধ্যস্থতা বিনামূল্যে ও স্বেচ্ছামূলক"
    )
    assert "ইউনিয়ন ডিজিটাল সেন্টার" in s["reply"]
    assert s["reply"].endswith(helpline.ANYTHING_ELSE["bn"])

    def ask(question: str) -> str:
        return conv.turn("n2", question, lookup_both)["reply"]

    assert ask("সভাটা কখন?").startswith(f"সভার সময় {date}।")
    assert ask("কোথায় যেতে হবে?").startswith(f"স্থান: {PLACE_BN}।")
    assert ask("কী আনতে হবে?").startswith("আপনার এনআইডি, নোটিশ নম্বর ৫ ৫ ৫ ৫, ৬ ৬ ৬ ৬,")
    cant = ask("যেতে না পারলে কী হবে?")
    assert cant.startswith("আসতে না পারলে তারিখের আগেই অফিসকে জানান") and "১৬৪৩০" in cant


def test_a_cancelled_or_past_notice_says_so():
    cancelled = a_notice(status="cancelled")
    text = helpline.describe_notice(cancelled, "en")
    assert text.startswith("The mediation meeting on case DLAS-2026-045 that was set for")
    assert "has been cancelled" in text
    # Questions about it get the same answer, not a date that no longer holds.
    assert helpline.about_notice(cancelled, "when", "en") == text
    past = a_notice(scheduledFor=(utcnow() - timedelta(days=2)).isoformat())
    assert helpline.describe_notice(past, "bn").startswith("মামলা DLAS-2026-045-এর মধ্যস্থতা সভা ছিল")


def test_a_caller_with_a_mediation_notice_is_asked_for_its_number():
    conv = HelplineConversation(use_default_llm=False)
    conv.start("n3", language="en")
    s = conv.turn("n3", "I got a mediation notice and I don't understand it", lookup_both)
    assert s["reply"] == helpline.ASK_NOTICE["en"] and s["awaiting"] == "notice"
    assert conv.turn("n3", "um", lookup_both)["reply"] == helpline.ASK_NOTICE["en"]
    assert conv.turn("n3", "1111 2222", lookup_both)["reply"] == helpline.NOTICE_UNKNOWN["en"]
    s = conv.turn("n3", "3333 4444", lookup_both)
    assert s["reply"].startswith(helpline.NOTICE_GIVE_UP["en"])
    assert s["awaiting"] is None and s["token_tries"] == 0 and s["complete"] is False
    # Asked for a notice number, a caller who says a tracking number still hears the case.
    conv.turn("n3", "mediation notice", lookup_both)
    s = conv.turn("n3", "4821 0937", lookup_both)
    assert s["reply"].startswith("Your case DLAS-2026-045 is active")

    conv.start("n4")
    s = conv.turn("n4", "মধ্যস্থতার নোটিশ পেয়েছি", lookup_both)
    assert s["reply"] == helpline.ASK_NOTICE["bn"]
    s = conv.turn("n4", "নোটিশ নম্বর তো নেই", lookup_both)
    assert s["reply"] == f"{helpline.NO_NOTICE['bn']} {helpline.ANYTHING_ELSE['bn']}"

    # Asked for the tracking number first (the hotline), a caller can switch to a notice.
    conv.start("n5", language="en", tracking=True)
    assert conv.turn("n5", "1111 2222", lookup_both)["reply"] == helpline.TOKEN_UNKNOWN["en"]
    s = conv.turn("n5", "no, it's a mediation notice", lookup_both)
    assert s["reply"] == helpline.ASK_NOTICE["en"] and s["token_tries"] == 0
    assert conv.turn("n5", "5555 6666", lookup_both)["intent"] == "mediationNotice"


def test_the_model_hears_the_notice_as_a_fact():
    class FakeLLM:
        def __init__(self):
            self.calls = []

        def structured(self, **kw):
            self.calls.append(kw)
            return LLMAnswer(answer="Yes, a relative may come with you.")

    llm = FakeLLM()
    conv = HelplineConversation(llm=llm)
    conv.start("n6", language="en")
    conv.turn("n6", "5555 6666", lookup_both)
    s = conv.turn("n6", "Can my brother come with me?", lookup_both)
    assert s["reply"].startswith("Yes, a relative may come with you.")
    assert "mediation meeting on case DLAS-2026-045" in llm.calls[0]["content"]


def test_http_notice_lookup_and_conversation(client, db):
    body = {
        "applicant": {"name": "Abdul Malek", "phone": "01819000560", "district": "Rangpur"},
        "narrative": "My cousins have occupied 22 decimals of my inherited farmland.",
    }
    ref = client.post("/intake/web", json=body).json()["id"]
    at = utcnow() + timedelta(days=4)
    session = client.post(
        "/mediation/sessions",
        json={"case_ref": ref, "scheduled_for": at.isoformat(), "mode": "odr_phone"},
    ).json()
    code = session["notices"][0]["code"]

    found = client.get(f"/helpline/notice/{code}").json()
    assert found == {
        "reference": ref,
        "role": "applicant",
        "scheduledFor": session["scheduledFor"],
        "place": "By phone (the office will call)",
        "placeBn": "ফোনে (অফিস থেকে ফোন করা হবে)",
        "mode": "odr_phone",
        "status": "scheduled",
    }
    assert "Malek" not in str(found) and "farmland" not in str(found)
    assert client.get(f"/helpline/notice/{code.replace('-', '')}").status_code == 200
    assert client.get("/helpline/notice/0000-0000").status_code == 404
    assert client.get(f"/helpline/track/{code}").status_code == 404  # not a tracking number

    sid = client.post("/helpline/conversations", json={"language": "en"}).json()["sessionId"]
    turn = f"/helpline/conversations/{sid}/turns"
    r = client.post(turn, json={"utterance": f"my notice number is {code}"}).json()
    assert r["intent"] == "mediationNotice"
    assert r["reply"].startswith(f"This notice is about a mediation meeting on case {ref}.")
    assert "You are invited as the applicant." in r["reply"]
    r = client.post(turn, json={"utterance": "where is it?"}).json()
    assert r["reply"].startswith("Place: By phone (the office will call).")
    token = db.scalars(select(Case.tracking_token)).one()
    r = client.post(turn, json={"utterance": f"and my case, {token}"}).json()
    assert r["reply"].startswith(f"Your case {ref} is in mediation. The next mediation session")


def test_phone_call_on_the_helpline_reads_a_mediation_notice(db_engine):
    factory = sessionmaker(bind=db_engine, expire_on_commit=False)
    with factory() as db:
        case = Case(application_id="APP-2026-778", tracking_token="48210937", channel="hotline",
                    current_office="Rangpur", summary="x")  # fmt: skip
        db.add(case)
        db.flush()
        session = MediationSession(case_id=case.id, scheduled_for=utcnow() + timedelta(days=2),
                                   mode="in_person", created_by="dlao-1")  # fmt: skip
        party = Party(name="Abdul Jalil")
        db.add_all([session, party])
        db.flush()
        db.add(
            MediationNotice(session_id=session.id, case_id=case.id, party_id=party.id,
                            role="respondent", code="55556666", status="sent")
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
        stt.say("I got a notice, the number is 5555 6666")
        stt.say("where is the meeting?")
        stt.say("that's all, thank you")
        await asyncio.wait_for(runner, 5)
        return tts

    tts = asyncio.run(scenario())
    assert tts.spoken[1].startswith(
        "This notice is about a mediation meeting on case APP-2026-778. You are invited as the "
        "other party."
    )
    assert tts.spoken[2] == f"Place: {PLACE}. {helpline.ANYTHING_ELSE['en']}"
    assert tts.spoken[-1] == helpline.GOODBYE["en"]
