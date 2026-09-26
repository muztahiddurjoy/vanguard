import asyncio
import base64
import itertools
import json
import math

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.agents import helpline, hotline_menu, t5_intake
from app.agents.helpline import HelplineConversation
from app.agents.hotline_menu import HotlineMenu
from app.agents.t5_intake import IntakeConversation
from app.config import get_settings
from app.models import Case
from app.routers import telephony
from app.services.audio import ulaw_decode, ulaw_encode
from app.services.elevenlabs import ElevenLabsTTS, TTSError
from app.services.speech_to_text import OpenAITranscriber, TranscriptEvent
from app.services.stream_manager import (
    NO_SPEECH_INPUT,
    SAY_AGAIN,
    STT_FAILED,
    StreamManager,
    build_transcriber,
)

# --- fakes ------------------------------------------------------------------------


class FakeTwilio:
    """Plays Twilio: queues inbound events and echoes our marks once 'played'."""

    def __init__(self, *, echo_marks: bool = True):
        self.incoming: asyncio.Queue[str | None] = asyncio.Queue()
        self.sent: list[dict] = []
        self.closed = False
        # False: the audio is still "playing" until finish_playing() echoes the marks.
        self.echo_marks = echo_marks
        self.held: list[dict] = []

    async def receive_text(self) -> str:
        item = await self.incoming.get()
        if item is None:
            raise RuntimeError("socket closed")
        return item

    async def send_text(self, data: str) -> None:
        msg = json.loads(data)
        self.sent.append(msg)
        if msg["event"] == "mark":
            self.held.append(msg["mark"])
        # Twilio echoes queued marks at once when it clears the audio.
        if self.echo_marks or msg["event"] == "clear":
            self.finish_playing()

    def finish_playing(self) -> None:
        for mark in self.held:
            self.incoming.put_nowait(json.dumps({"event": "mark", "mark": mark}))
        self.held = []

    async def close(self, code: int = 1000) -> None:
        self.closed = True
        await self.incoming.put(None)

    def push(self, event: dict) -> None:
        self.incoming.put_nowait(json.dumps(event))

    def events(self, name: str) -> list[dict]:
        return [m for m in self.sent if m["event"] == name]


class FakeTTS:
    def __init__(self, delay: float = 0):
        self.spoken: list[str] = []
        self.languages: list[str | None] = []
        self.delay = delay
        self.closed = False

    async def stream(self, text: str, language: str | None = None):
        self.spoken.append(text)
        self.languages.append(language)
        for _ in range(3):
            if self.delay:
                await asyncio.sleep(self.delay)
            yield b"\xff" * 160

    async def aclose(self) -> None:
        self.closed = True


class ScriptedTranscriber:
    def __init__(self):
        self.queue: asyncio.Queue[TranscriptEvent | None] = asyncio.Queue()
        self.fed = 0
        self.closed = False
        self.end_of_turn: list[int] = []

    async def feed(self, ulaw: bytes) -> None:
        self.fed += len(ulaw)

    async def events(self):
        while (event := await self.queue.get()) is not None:
            yield event

    def set_end_of_turn(self, ms: int) -> None:
        self.end_of_turn.append(ms)

    async def close(self) -> None:
        self.closed = True
        await self.queue.put(None)

    def say(self, text: str) -> None:
        self.queue.put_nowait(TranscriptEvent("final", text))


START = {
    "event": "start",
    "start": {
        "streamSid": "MZ123",
        "callSid": "CA123",
        "customParameters": {"language": "en", "caller": "+8801712345318"},
    },
}


async def until(predicate, timeout=5.0):
    async def poll():
        while not predicate():
            await asyncio.sleep(0.01)

    await asyncio.wait_for(poll(), timeout)


# A neighbour applying for a woman her husband beats, from the story to the last answer.
NEIGHBOUR_CALL = (
    "My neighbour's husband beats her and she has visible injuries",
    "I am calling for my neighbour",
    "My name is Ripon",
    "Moyuri Akter",
    "01712345318 in Rangpur",
    "Her husband Jalal Uddin",
    "I don't know",
    "Rangpur",
    "Tuesday 2 to 4 pm, he checks her phone",
)


# --- stream manager -----------------------------------------------------------------


def test_call_collects_intake_and_creates_application(db_engine):
    factory = sessionmaker(bind=db_engine, expire_on_commit=False)

    async def scenario():
        ws, tts, stt = FakeTwilio(), FakeTTS(), ScriptedTranscriber()
        manager = StreamManager(
            ws,
            tts=tts,
            transcriber_factory=lambda lang: stt,
            intake=IntakeConversation(use_default_llm=False),
            session_factory=factory,
        )
        runner = asyncio.create_task(manager.run())
        ws.push(START)
        await until(lambda: len(tts.spoken) == 1)
        ws.push(
            {
                "event": "media",
                "media": {"track": "inbound", "payload": base64.b64encode(b"\x7f" * 160).decode()},
            }
        )
        for utterance in NEIGHBOUR_CALL:
            stt.say(utterance)
        await asyncio.wait_for(runner, 5)
        return ws, tts, stt, manager

    ws, tts, stt, manager = asyncio.run(scenario())
    # The hotline asks first; the story, told as the answer, goes straight to intake.
    assert tts.spoken[0] == hotline_menu.MENU["en"]
    # The story gets the longer pause; the questions after it, the usual one.
    assert stt.end_of_turn[:2] == [1200, 700] and set(stt.end_of_turn[2:]) == {700}
    assert tts.spoken[-1].startswith("Thank you. Your application is recorded.")
    assert stt.fed == 160 and stt.closed
    assert set(tts.languages) == {"en"} and tts.closed
    assert ws.closed
    media = ws.events("media")
    assert media and all(m["streamSid"] == "MZ123" for m in media)
    assert len(ws.events("mark")) == len(tts.spoken)
    with factory() as db:
        case = db.scalars(select(Case)).one()
    assert manager.case_ref == case.application_id
    assert case.category == "domesticViolence"
    assert case.channel == "proxy"
    assert case.applicant is not None and case.applicant.safety_level == "restricted"


def test_barge_in_clears_a_reply_that_was_fully_sent_but_is_still_playing(db_engine):
    async def scenario(echo_marks: bool):
        ws, tts, stt = FakeTwilio(echo_marks=echo_marks), FakeTTS(), ScriptedTranscriber()
        manager = StreamManager(
            ws,
            tts=tts,
            transcriber_factory=lambda lang: stt,
            intake=IntakeConversation(use_default_llm=False),
            session_factory=sessionmaker(bind=db_engine),
        )
        runner = asyncio.create_task(manager.run())
        ws.push(START)
        # ElevenLabs is done with the opening question: all its audio and the mark are sent.
        await until(lambda: len(ws.events("mark")) == 1)
        await asyncio.sleep(0.05)  # an echoed mark reaches the manager
        stt.queue.put_nowait(TranscriptEvent("speech_started"))
        await asyncio.sleep(0.05)
        ws.push({"event": "stop"})
        await asyncio.wait_for(runner, 5)
        return ws

    # Twilio is still playing it: the caller's voice silences it.
    assert asyncio.run(scenario(echo_marks=False)).events("clear") == [
        {"event": "clear", "streamSid": "MZ123"}
    ]
    # It has finished playing: there is nothing to clear.
    assert asyncio.run(scenario(echo_marks=True)).events("clear") == []


def test_emergency_line_is_spoken_before_the_application_is_filed(db_engine, monkeypatch):
    factory = sessionmaker(bind=db_engine, expire_on_commit=False)
    order: list[str] = []

    async def scenario():
        # Twilio is still playing whatever it was sent until finish_playing().
        ws, tts, stt = FakeTwilio(echo_marks=False), FakeTTS(), ScriptedTranscriber()
        manager = StreamManager(
            ws,
            tts=tts,
            transcriber_factory=lambda lang: stt,
            intake=IntakeConversation(use_default_llm=False, use_default_registry=False),
            session_factory=factory,
        )
        speak, finish = manager._speak, manager._finish

        async def speaking(text: str) -> str:
            order.append(text)
            return await speak(text)

        def filing(state, **kw) -> None:
            order.append("filed")
            finish(state, **kw)

        monkeypatch.setattr(manager, "_speak", speaking)
        monkeypatch.setattr(manager, "_finish", filing)
        runner = asyncio.create_task(manager.run())
        ws.push(START)
        stt.say("He is beating me right now, help me now")
        # The tracking number is sent while the 999 line is still playing: queued
        # right behind it, with no silence for the caller to hang up in.
        await until(lambda: len(ws.events("mark")) == 3)
        assert not ws.closed
        ws.finish_playing()
        await asyncio.wait_for(runner, 5)
        return ws

    ws = asyncio.run(scenario())
    assert order[1:3] == [t5_intake.EMERGENCY["en"], "filed"]
    assert order[3].startswith("Your tracking number is")
    assert ws.closed  # once the number has played
    with factory() as db:
        case = db.scalars(select(Case)).one()
    assert "escalated" in case.flags and case.priority == "critical"


def test_call_cut_mid_intake_is_recorded_and_marked_do_not_call(db_engine):
    factory = sessionmaker(bind=db_engine, expire_on_commit=False)

    async def scenario():
        ws, tts, stt = FakeTwilio(), FakeTTS(), ScriptedTranscriber()
        manager = StreamManager(
            ws,
            tts=tts,
            transcriber_factory=lambda lang: stt,
            intake=IntakeConversation(use_default_llm=False, use_default_registry=False),
            session_factory=factory,
        )
        runner = asyncio.create_task(manager.run())
        ws.push(START)
        stt.say("He hits me with a stick and says he will kill me")
        for utterance in ("for myself", "Moyuri Akter", "Rangpur"):
            stt.say(utterance)
        await until(lambda: len(tts.spoken) == 5)  # the menu + one reply per utterance
        ws.push({"event": "stop"})  # the line goes dead
        await asyncio.wait_for(runner, 5)
        return manager

    manager = asyncio.run(scenario())
    with factory() as db:
        case = db.scalars(select(Case)).one()
    assert manager.case_ref == case.application_id
    assert {"callDropped", "doNotCall"} <= set(case.flags)
    assert case.do_not_call_reason == "dangerCallCut"
    assert case.applicant is not None and case.applicant.phone == "01712345318"  # caller ID
    assert case.applicant.safety_level == "no_contact"


def test_caller_barge_in_clears_playback(db_engine):
    async def scenario():
        ws, tts, stt = FakeTwilio(), FakeTTS(delay=0.2), ScriptedTranscriber()
        manager = StreamManager(
            ws,
            tts=tts,
            transcriber_factory=lambda lang: stt,
            intake=IntakeConversation(use_default_llm=False),
            session_factory=sessionmaker(bind=db_engine),
        )
        runner = asyncio.create_task(manager.run())
        ws.push(START)
        await until(lambda: len(ws.events("media")) >= 1)
        stt.queue.put_nowait(TranscriptEvent("speech_started"))
        await until(lambda: len(ws.events("clear")) == 1)
        ws.push({"event": "stop"})
        await asyncio.wait_for(runner, 5)
        return ws

    ws = asyncio.run(scenario())
    assert ws.events("clear") == [{"event": "clear", "streamSid": "MZ123"}]
    assert len(ws.events("media")) < 3  # the opening question was cut short


def test_without_speech_to_text_caller_hears_fallback_and_call_ends():
    async def scenario():
        ws, tts = FakeTwilio(), FakeTTS()
        manager = StreamManager(ws, tts=tts, transcriber_factory=lambda lang: None)
        runner = asyncio.create_task(manager.run())
        ws.push({**START, "start": {**START["start"], "customParameters": {}}})
        await asyncio.wait_for(runner, 5)
        return ws, tts

    ws, tts = asyncio.run(scenario())
    assert tts.spoken == [NO_SPEECH_INPUT["bn"]]
    assert ws.closed


def test_speech_to_text_failing_mid_call_apologises_and_files_what_was_said(db_engine):
    factory = sessionmaker(bind=db_engine, expire_on_commit=False)

    async def scenario():
        ws, tts, stt = FakeTwilio(), FakeTTS(), ScriptedTranscriber()
        manager = StreamManager(
            ws,
            tts=tts,
            transcriber_factory=lambda lang: stt,
            intake=IntakeConversation(use_default_llm=False, use_default_registry=False),
            session_factory=factory,
        )
        runner = asyncio.create_task(manager.run())
        ws.push(START)
        stt.say("My landlord took my land and will not give it back")
        for utterance in ("for myself", "Moyuri Akter", "Rangpur"):
            stt.say(utterance)
        await until(lambda: len(tts.spoken) == 5)
        stt.queue.put_nowait(TranscriptEvent("error", "the transcription session closed"))
        await asyncio.wait_for(runner, 5)
        return ws, tts, manager

    ws, tts, manager = asyncio.run(scenario())
    assert tts.spoken[-1] == STT_FAILED["en"]
    assert ws.closed
    with factory() as db:
        case = db.scalars(select(Case)).one()
    assert manager.case_ref == case.application_id
    assert "callDropped" in case.flags
    assert "doNotCall" not in case.flags


def test_a_turn_lost_by_speech_to_text_is_asked_for_again(db_engine):
    async def scenario():
        ws, tts, stt = FakeTwilio(), FakeTTS(), ScriptedTranscriber()
        manager = StreamManager(
            ws,
            tts=tts,
            transcriber_factory=lambda lang: stt,
            intake=IntakeConversation(use_default_llm=False, use_default_registry=False),
            session_factory=sessionmaker(bind=db_engine),
        )
        runner = asyncio.create_task(manager.run())
        ws.push(START)
        await until(lambda: len(ws.events("mark")) == 1)  # the opening question
        stt.queue.put_nowait(TranscriptEvent("repeat"))
        stt.say("My landlord took my land and will not give it back")
        await until(lambda: len(tts.spoken) == 3)
        ws.push({"event": "stop"})
        await asyncio.wait_for(runner, 5)
        return tts

    tts = asyncio.run(scenario())
    assert tts.spoken[1] == SAY_AGAIN["en"]
    assert tts.spoken[2].startswith("Thank you for telling me.")  # the call carries on


# --- the hotline's opening question -------------------------------------------------


def hotline_call(factory, intake: IntakeConversation | None = None):
    """Fakes and a manager for a hotline call whose agents all run on rules alone."""
    ws, tts, stt = FakeTwilio(), FakeTTS(), ScriptedTranscriber()
    manager = StreamManager(
        ws,
        tts=tts,
        transcriber_factory=lambda lang: stt,
        intake=intake or IntakeConversation(use_default_llm=False, use_default_registry=False),
        helpline_agent=HelplineConversation(use_default_llm=False),
        menu=HotlineMenu(use_default_llm=False),
        session_factory=factory,
    )
    return ws, tts, stt, manager


def seed_case(factory) -> None:
    """An application filed earlier, with tracking number 4821 0937."""
    with factory() as db:
        db.add(
            Case(application_id="APP-2026-777", tracking_token="48210937", channel="hotline",
                 current_office="Rangpur", summary="x")
        )  # fmt: skip
        db.commit()


def test_hotline_caller_hears_the_progress_of_a_case_and_nothing_is_filed(db_engine):
    factory = sessionmaker(bind=db_engine, expire_on_commit=False)
    seed_case(factory)

    async def scenario():
        ws, tts, stt, manager = hotline_call(factory)
        runner = asyncio.create_task(manager.run())
        ws.push(START)
        await until(lambda: len(tts.spoken) == 1)
        for utterance in ("I want to know the status of my case", "4821 0937", "no, thank you"):
            stt.say(utterance)
        await asyncio.wait_for(runner, 5)
        return ws, tts, manager

    ws, tts, manager = asyncio.run(scenario())
    assert tts.spoken[0] == hotline_menu.MENU["en"]
    assert tts.spoken[1] == helpline.ASK_TOKEN["en"]
    assert tts.spoken[2].startswith("Your application APP-2026-777 has been received")
    assert tts.spoken[3:] == [helpline.GOODBYE["en"]]
    assert ws.closed
    assert manager.case_ref is None
    with factory() as db:
        assert len(db.scalars(select(Case)).all()) == 1


def test_a_tracking_number_said_with_the_answer_is_read_at_once(db_engine):
    factory = sessionmaker(bind=db_engine, expire_on_commit=False)
    seed_case(factory)

    async def scenario():
        ws, tts, stt, manager = hotline_call(factory)
        runner = asyncio.create_task(manager.run())
        ws.push(START)
        await until(lambda: len(tts.spoken) == 1)
        stt.say("my tracking number is 4821 0937")
        stt.say("that's all, thank you")
        await asyncio.wait_for(runner, 5)
        return tts

    tts = asyncio.run(scenario())
    assert tts.spoken[1].startswith("Your application APP-2026-777 has been received")
    assert tts.spoken[2:] == [helpline.GOODBYE["en"]]


def test_a_new_case_is_asked_for_then_taken_by_intake(db_engine):
    factory = sessionmaker(bind=db_engine, expire_on_commit=False)

    async def scenario():
        ws, tts, stt, manager = hotline_call(factory, IntakeConversation(use_default_llm=False))
        runner = asyncio.create_task(manager.run())
        ws.push(START)
        await until(lambda: len(tts.spoken) == 1)
        for utterance in ("new case", *NEIGHBOUR_CALL):
            stt.say(utterance)
        await asyncio.wait_for(runner, 5)
        return tts, manager

    tts, manager = asyncio.run(scenario())
    assert tts.spoken[1] == hotline_menu.TELL_ME["en"]  # not T5's own greeting
    assert tts.spoken[2].startswith("Thank you for telling me.")
    assert tts.spoken[-1].startswith("Thank you. Your application is recorded.")
    with factory() as db:
        case = db.scalars(select(Case)).one()
    assert manager.case_ref == case.application_id
    assert case.category == "domesticViolence" and case.channel == "proxy"


def test_an_unclear_answer_is_asked_again_then_intake_takes_the_call(db_engine):
    factory = sessionmaker(bind=db_engine, expire_on_commit=False)

    async def scenario():
        ws, tts, stt, manager = hotline_call(factory)
        runner = asyncio.create_task(manager.run())
        ws.push(START)
        await until(lambda: len(tts.spoken) == 1)
        for utterance in ("hello?", "hello?", "My landlord took my land and will not give it back"):
            stt.say(utterance)
        await until(lambda: len(tts.spoken) == 4)
        ws.push({"event": "stop"})  # the line goes dead
        await asyncio.wait_for(runner, 5)
        return tts, manager

    tts, manager = asyncio.run(scenario())
    assert tts.spoken[1:3] == [hotline_menu.MENU_AGAIN["en"], hotline_menu.TELL_ME["en"]]
    assert tts.spoken[3].startswith("Thank you for telling me.")
    # It was an intake call by then: cut short, what was said is filed.
    with factory() as db:
        case = db.scalars(select(Case)).one()
    assert manager.case_ref == case.application_id and "callDropped" in case.flags


def test_a_caller_asking_about_a_case_can_still_file_a_new_one(db_engine):
    factory = sessionmaker(bind=db_engine, expire_on_commit=False)

    async def scenario():
        ws, tts, stt, manager = hotline_call(factory)
        runner = asyncio.create_task(manager.run())
        ws.push(START)
        await until(lambda: len(tts.spoken) == 1)
        for utterance in (
            "status",
            "I want to file a new case",
            "My landlord took my land and will not give it back",
        ):
            stt.say(utterance)
        await until(lambda: len(tts.spoken) == 4)
        ws.push({"event": "stop"})
        await asyncio.wait_for(runner, 5)
        return tts

    tts = asyncio.run(scenario())
    assert tts.spoken[1:3] == [helpline.ASK_TOKEN["en"], hotline_menu.TELL_ME["en"]]
    assert tts.spoken[3].startswith("Thank you for telling me.")


def test_danger_while_asking_about_a_case_gets_the_intake_emergency_line(db_engine):
    factory = sessionmaker(bind=db_engine, expire_on_commit=False)

    async def scenario():
        ws, tts, stt, manager = hotline_call(factory)
        runner = asyncio.create_task(manager.run())
        ws.push(START)
        await until(lambda: len(tts.spoken) == 1)
        stt.say("status")
        stt.say("He is beating me right now, help me now")
        await asyncio.wait_for(runner, 5)
        return ws, tts, manager

    ws, tts, manager = asyncio.run(scenario())
    assert tts.spoken[1] == helpline.ASK_TOKEN["en"]
    # T5's 999 line (with the promised callback), then the new application's number.
    assert tts.spoken[2] == t5_intake.EMERGENCY["en"]
    assert tts.spoken[3].startswith("Your tracking number is")
    assert ws.closed
    with factory() as db:
        case = db.scalars(select(Case)).one()
    assert manager.case_ref == case.application_id
    assert "escalated" in case.flags and case.priority == "critical"


@pytest.mark.parametrize("said", [(), ("hello?",), ("status",)])
def test_hanging_up_before_intake_files_nothing(db_engine, said):
    factory = sessionmaker(bind=db_engine, expire_on_commit=False)

    async def scenario():
        ws, tts, stt, manager = hotline_call(factory)
        runner = asyncio.create_task(manager.run())
        ws.push(START)
        await until(lambda: len(tts.spoken) == 1)
        for utterance in said:
            stt.say(utterance)
        await until(lambda: len(tts.spoken) == 1 + len(said))
        ws.push({"event": "stop"})  # the caller hangs up
        await asyncio.wait_for(runner, 5)
        return manager

    manager = asyncio.run(scenario())
    assert manager.case_ref is None
    with factory() as db:
        assert db.scalars(select(Case)).all() == []


def test_the_menu_waits_as_for_a_story_and_the_status_questions_do_not(db_engine):
    async def scenario():
        ws, tts, stt, manager = hotline_call(sessionmaker(bind=db_engine))
        runner = asyncio.create_task(manager.run())
        ws.push(START)
        await until(lambda: len(tts.spoken) == 1)
        at_menu = list(stt.end_of_turn)
        stt.say("status")
        await until(lambda: len(tts.spoken) == 2)
        ws.push({"event": "stop"})
        await asyncio.wait_for(runner, 5)
        return at_menu, stt.end_of_turn

    at_menu, after = asyncio.run(scenario())
    assert at_menu == [1200]  # many callers begin with what happened
    assert after == [1200, 700]


def test_transcriber_is_openai_when_a_key_is_set(monkeypatch):
    s = get_settings()
    assert build_transcriber("bn") is None
    monkeypatch.setattr(s, "openai_api_key", "sk-test")
    stt = build_transcriber("en")
    assert isinstance(stt, OpenAITranscriber) and stt.language == "en"


# --- ElevenLabs client ------------------------------------------------------------


def _settings(**kw):
    s = get_settings().model_copy()
    for k, v in {"elevenlabs_api_key": "xi", "elevenlabs_voice_id": "voice1", **kw}.items():
        setattr(s, k, v)
    return s


def test_elevenlabs_streams_ulaw_audio_over_http():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, content=b"\x01\x02\x03")

    async def collect():
        tts = ElevenLabsTTS(_settings(), transport=httpx.MockTransport(handler))
        first = b"".join([c async for c in tts.stream(" নমস্কার ", "bn")])
        second = b"".join([c async for c in tts.stream("hello")])
        await tts.aclose()
        return first, second

    first, second = asyncio.run(collect())
    assert first == second == b"\x01\x02\x03"
    request = seen[0]
    assert request.method == "POST"
    assert request.url.path == "/v1/text-to-speech/voice1/stream"
    assert request.url.params["output_format"] == "ulaw_8000"
    assert request.headers["xi-api-key"] == "xi"
    assert json.loads(request.content) == {
        "text": "নমস্কার",
        "model_id": "eleven_v3",
        "language_code": "bn",
    }
    assert "language_code" not in json.loads(seen[1].content)


def test_elevenlabs_audio_plays_at_voice_speed_with_the_same_pitch():
    tone = ulaw_encode(
        round(8000 * math.sin(2 * math.pi * 200 * n / 8000)) for n in range(2 * 8000)
    )

    async def streamed():
        for i in range(0, len(tone), 400):  # as ElevenLabs sends it: small chunks
            yield tone[i : i + 400]

    def handler(request: httpx.Request) -> httpx.Response:
        assert "voice_settings" not in json.loads(request.content)  # eleven_v3 ignores it
        return httpx.Response(200, content=streamed())

    async def collect(speed: float) -> list[bytes]:
        tts = ElevenLabsTTS(_settings(voice_speed=speed), transport=httpx.MockTransport(handler))
        try:
            return [c async for c in tts.stream("hi", "en")]
        finally:
            await tts.aclose()

    sent = asyncio.run(collect(1.25))
    # The first 0.6 s go out together, so the line does not stall between bursts.
    assert len(sent[0]) >= 0.6 * 8000
    # It plays at normal speed until a second is queued at Twilio, then faster.
    faster = b"".join(sent)
    cushion = int(ElevenLabsTTS.CUSHION_S * 8000)
    expected = cushion + (len(tone) - cushion) / 1.25
    assert len(faster) == pytest.approx(expected, abs=400 + 240)
    samples = ulaw_decode(faster)
    crossings = sum(1 for a, b in itertools.pairwise(samples) if (a < 0) != (b < 0))
    assert crossings / 2 / (len(samples) / 8000) == pytest.approx(200, rel=0.01)
    normal = asyncio.run(collect(1.0))
    assert b"".join(normal) == tone and len(normal[0]) >= 0.6 * 8000


def test_elevenlabs_check_finds_what_would_keep_the_line_silent():
    def registry(model: dict, voice_status: int = 200, models_status: int = 200):
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.headers["xi-api-key"] == "xi"
            if request.url.path == "/v1/models":
                return httpx.Response(models_status, json=[model])
            assert request.url.path == "/v1/voices/voice1"
            return httpx.Response(voice_status, json={"voice_id": "voice1"})

        return handler

    async def check(handler, **kw):
        tts = ElevenLabsTTS(_settings(**kw), transport=httpx.MockTransport(handler))
        try:
            return await tts.check()
        finally:
            await tts.aclose()

    v3 = {"model_id": "eleven_v3", "languages": [{"language_id": "en"}, {"language_id": "bn"}]}
    flash = {"model_id": "eleven_flash_v2_5", "languages": [{"language_id": "hi"}]}
    assert asyncio.run(check(registry(v3))) == ("ok", "")
    result, why = asyncio.run(check(registry(flash), elevenlabs_model_id="eleven_flash_v2_5"))
    assert result == "error" and "does not speak Bangla" in why
    assert (
        asyncio.run(check(registry(flash)))[1]
        == "ElevenLabs has no model 'eleven_v3' for this account"
    )
    assert asyncio.run(check(registry(v3, voice_status=404))) == (
        "error", "ElevenLabs has no voice 'voice1'",
    )  # fmt: skip
    assert asyncio.run(check(registry(v3, models_status=401)))[0] == "error"

    def offline(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline")

    # Only a setting that must be fixed stops the line; an outage is just reported.
    assert asyncio.run(check(offline))[0] == "unchecked"


def test_a_broken_voice_answers_with_a_spoken_message_not_silence(client, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "elevenlabs_api_key", "xi")
    monkeypatch.setattr(s, "elevenlabs_voice_id", "voice1")
    monkeypatch.setattr(client.app.state, "voice", "error: ElevenLabs rejected the API key (401)")
    r = client.post("/telephony/voice", data={"CallSid": "CA1", "From": "+8801712345318"})
    assert "<Say" in r.text and "9 9 9" in r.text and "<Stream" not in r.text
    monkeypatch.setattr(client.app.state, "voice", "unchecked: ElevenLabs could not be reached")
    r = client.post("/telephony/voice", data={"CallSid": "CA1", "From": "+8801712345318"})
    assert "<Stream" in r.text  # an outage at startup does not silence every call


def test_a_reply_that_cannot_be_spoken_is_logged_and_the_call_goes_on(db_engine, caplog):
    class BrokenOnce(FakeTTS):
        async def stream(self, text: str, language: str | None = None):
            self.spoken.append(text)
            if len(self.spoken) == 1:
                raise ValueError("no audio")
            yield b"\xff" * 160

    async def scenario():
        ws, tts, stt = FakeTwilio(), BrokenOnce(), ScriptedTranscriber()
        manager = StreamManager(
            ws,
            tts=tts,
            transcriber_factory=lambda lang: stt,
            intake=IntakeConversation(use_default_llm=False, use_default_registry=False),
            session_factory=sessionmaker(bind=db_engine),
        )
        runner = asyncio.create_task(manager.run())
        ws.push(START)
        await until(lambda: len(ws.events("mark")) == 1)
        stt.say("hello")
        await until(lambda: len(ws.events("mark")) == 2)
        ws.push({"event": "stop"})
        await asyncio.wait_for(runner, 5)
        return ws, tts

    ws, tts = asyncio.run(scenario())
    assert "could not speak on call CA123" in caplog.text and "no audio" in caplog.text
    assert tts.spoken[1] == hotline_menu.MENU_AGAIN["en"] and len(ws.events("media")) == 1


def test_elevenlabs_errors_raise_tts_error():
    def rejected(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"detail": {"code": "model_access_denied"}})

    def offline(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline")

    async def collect(handler):
        tts = ElevenLabsTTS(_settings(), transport=httpx.MockTransport(handler))
        try:
            return [c async for c in tts.stream("hi", "en")]
        finally:
            await tts.aclose()

    with pytest.raises(TTSError, match=r"401.*model_access_denied"):
        asyncio.run(collect(rejected))
    with pytest.raises(TTSError, match="offline"):
        asyncio.run(collect(offline))


# --- Twilio HTTP ----------------------------------------------------------------------


def test_voice_webhook_without_tts_says_fallback(client):
    r = client.post("/telephony/voice", data={"CallSid": "CA1", "From": "+8801712345318"})
    assert r.status_code == 200
    assert "<Say" in r.text and "9 9 9" in r.text and "<Hangup/>" in r.text


def test_voice_webhook_connects_media_stream(client, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "elevenlabs_api_key", "xi")
    monkeypatch.setattr(s, "elevenlabs_voice_id", "voice1")
    monkeypatch.setattr(s, "public_base_url", "https://dlas.example.org")
    r = client.post("/telephony/voice?lang=en", data={"CallSid": "CA1", "From": "+8801712345318"})
    assert '<Stream url="wss://dlas.example.org/telephony/media">' in r.text
    assert '<Parameter name="language" value="en"/>' in r.text
    assert '<Parameter name="caller" value="+8801712345318"/>' in r.text
    assert r.text.endswith("</Connect><Hangup/></Response>")


def test_twilio_signature_is_enforced_when_enabled(client, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "twilio_validate_signatures", True)
    monkeypatch.setattr(s, "twilio_auth_token", "secret")
    monkeypatch.setattr(s, "public_base_url", "https://dlas.example.org")
    form = {"CallSid": "CA1", "From": "+8801712345318"}
    good = telephony.twilio_signature("secret", "https://dlas.example.org/telephony/voice", form)
    ok = client.post("/telephony/voice", data=form, headers={"X-Twilio-Signature": good})
    assert ok.status_code == 200
    bad = client.post("/telephony/voice", data=form, headers={"X-Twilio-Signature": "nope"})
    assert bad.status_code == 403
    assert client.post("/telephony/status", data=form).status_code == 403


def test_signature_matches_twilio_request_validator():
    # Golden values computed with the official twilio library's RequestValidator
    # (twilio.request_validator), auth token "12345".
    params = {
        "CallSid": "CA1234567890ABCDE",
        "Caller": "+12349013030",
        "Digits": "1234",
        "From": "+12349013030",
        "To": "+18005551212",
    }
    url = "https://example.com/myapp.php?foo=1&bar=2"
    assert telephony.twilio_signature("12345", url, params) == "vNe7KK2kJwCsxc9K3OLkkKB3qqI="
    ws_url = "wss://dlas.example.org/telephony/media"
    assert telephony.twilio_signature("12345", ws_url, {}) == "qU3rRAX/WYSnuiDVsCo/Zjww08o="


def test_media_websocket_route_runs_the_stream_manager(client, monkeypatch):
    spoken: list[str] = []

    class RecordingTTS(FakeTTS):
        async def stream(self, text, language=None):
            spoken.append(text)
            yield b"\xff" * 160

    monkeypatch.setattr(
        telephony,
        "make_stream_manager",
        lambda ws: StreamManager(ws, tts=RecordingTTS(), transcriber_factory=lambda lang: None),
    )
    with client.websocket_connect("/telephony/media") as ws:
        ws.send_text(json.dumps({"event": "connected"}))
        ws.send_text(json.dumps({**START, "start": {**START["start"], "customParameters": {}}}))
        first = json.loads(ws.receive_text())
        assert first["event"] == "media" and first["streamSid"] == "MZ123"
        mark = json.loads(ws.receive_text())
        assert mark["event"] == "mark"
        ws.send_text(json.dumps({"event": "mark", "mark": mark["mark"]}))
    assert spoken == [NO_SPEECH_INPUT["bn"]]


def test_media_websocket_rejects_unsigned_upgrade_when_validation_on(client, monkeypatch):
    from starlette.websockets import WebSocketDisconnect

    s = get_settings()
    monkeypatch.setattr(s, "twilio_validate_signatures", True)
    monkeypatch.setattr(s, "twilio_auth_token", "secret")
    with pytest.raises(WebSocketDisconnect), client.websocket_connect("/telephony/media") as ws:
        ws.receive_text()


def test_elevenlabs_asks_again_when_audio_is_slow_to_start():
    requests = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal requests
        requests += 1
        if requests == 1:
            await asyncio.sleep(1.0)  # a stalled request
        return httpx.Response(200, content=f"reply{requests}".encode())

    async def collect(timeout: float):
        tts = ElevenLabsTTS(
            _settings(elevenlabs_first_audio_timeout_s=timeout),
            transport=httpx.MockTransport(handler),
        )
        try:
            return b"".join([c async for c in tts.stream("hi", "en")])
        finally:
            await tts.aclose()

    assert asyncio.run(collect(0.1)) == b"reply2"
    assert requests == 2
    # Turned off, the slow request is simply waited for.
    requests = 0
    assert asyncio.run(collect(0)) == b"reply1"
    assert requests == 1
