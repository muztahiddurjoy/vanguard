import asyncio
import base64
import json

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.agents.t5_intake import IntakeConversation
from app.config import get_settings
from app.models import Case
from app.routers import telephony
from app.services.elevenlabs import ElevenLabsTTS, TTSError
from app.services.speech_to_text import OpenAITranscriber, TranscriptEvent
from app.services.stream_manager import (
    NO_SPEECH_INPUT,
    STT_FAILED,
    StreamManager,
    build_transcriber,
)

# --- fakes ------------------------------------------------------------------------


class FakeTwilio:
    """Plays Twilio: queues inbound events and echoes our marks once 'played'."""

    def __init__(self):
        self.incoming: asyncio.Queue[str | None] = asyncio.Queue()
        self.sent: list[dict] = []
        self.closed = False

    async def receive_text(self) -> str:
        item = await self.incoming.get()
        if item is None:
            raise RuntimeError("socket closed")
        return item

    async def send_text(self, data: str) -> None:
        msg = json.loads(data)
        self.sent.append(msg)
        if msg["event"] == "mark":
            await self.incoming.put(json.dumps({"event": "mark", "mark": msg["mark"]}))

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

    async def feed(self, ulaw: bytes) -> None:
        self.fed += len(ulaw)

    async def events(self):
        while (event := await self.queue.get()) is not None:
            yield event

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
        for utterance in (
            "I am calling for my neighbour",
            "My name is Ripon",
            "Moyuri Akter",
            "01712345318 in Rangpur",
            "Her husband beats her and she has visible injuries",
            "Her husband Jalal Uddin",
            "I don't know",
            "Rangpur",
            "Tuesday 2 to 4 pm, he checks her phone",
        ):
            stt.say(utterance)
        await asyncio.wait_for(runner, 5)
        return ws, tts, stt, manager

    ws, tts, stt, manager = asyncio.run(scenario())
    assert tts.spoken[0].startswith("Are you applying for yourself")
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
        for utterance in ("for myself", "Moyuri Akter", "Rangpur"):
            stt.say(utterance)
        stt.say("He hits me with a stick and says he will kill me")
        await until(lambda: len(tts.spoken) == 5)  # greeting + one reply per utterance
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
    assert len(ws.events("media")) < 3  # the greeting was cut short


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
        for utterance in ("for myself", "Moyuri Akter", "Rangpur"):
            stt.say(utterance)
        stt.say("My landlord took my land and will not give it back")
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
