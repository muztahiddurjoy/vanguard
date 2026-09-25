import asyncio
import base64
import json
import math

from app.config import Settings
from app.services.audio import FRAME_SAMPLES, ulaw_encode
from app.services.speech_to_text import PCM_RATE, OpenAITranscriber, TranscriptEvent

SILENCE = b"\xff" * FRAME_SAMPLES
PCM_FRAME_BYTES = FRAME_SAMPLES * 3 * 2  # 20 ms at 24 kHz, 16-bit


def speech(frames: int) -> bytes:
    return ulaw_encode(
        round(6000 * math.sin(2 * math.pi * 300 * i / 8000)) for i in range(frames * FRAME_SAMPLES)
    )


class FakeRealtime:
    """Plays the Realtime API: acknowledges commits and, if scripted, transcribes them."""

    def __init__(self, transcripts: list[str] | None = None, reply_in_order: bool = True):
        self.sent: list[dict] = []
        self.incoming: asyncio.Queue[str | None] = asyncio.Queue()
        self.transcripts = list(transcripts or [])
        self.reply_in_order = reply_in_order
        self.commits = 0
        self.closed = False
        self.url: str | None = None
        self.headers: dict | None = None

    async def connect(self, url: str, additional_headers: dict) -> "FakeRealtime":
        self.url, self.headers = url, additional_headers
        return self

    async def send(self, data: str) -> None:
        message = json.loads(data)
        self.sent.append(message)
        if message["type"] == "session.update":
            self.push({"type": "session.updated", "session": message["session"]})
        elif message["type"] == "input_audio_buffer.commit":
            self.commits += 1
            item = f"item_{self.commits}"
            self.push({"type": "input_audio_buffer.committed", "item_id": item})
            if self.reply_in_order and self.transcripts:
                self.complete(item, self.transcripts.pop(0))

    def push(self, event: dict | None) -> None:
        self.incoming.put_nowait(None if event is None else json.dumps(event))

    def complete(self, item: str, text: str) -> None:
        self.push(
            {
                "type": "conversation.item.input_audio_transcription.completed",
                "item_id": item,
                "content_index": 0,
                "transcript": text,
            }
        )

    def __aiter__(self) -> "FakeRealtime":
        return self

    async def __anext__(self) -> str:
        item = await self.incoming.get()
        if item is None:
            raise StopAsyncIteration
        return item

    async def close(self) -> None:
        self.closed = True
        self.push(None)

    def of_type(self, kind: str) -> list[dict]:
        return [m for m in self.sent if m["type"] == kind]


def settings(**overrides) -> Settings:
    return Settings(openai_api_key="sk-test", **overrides)


def transcriber(fake: FakeRealtime, language: str = "bn", **overrides) -> OpenAITranscriber:
    return OpenAITranscriber(language, settings=settings(**overrides), connect=fake.connect)


async def collect(
    stt: OpenAITranscriber, count: int, timeout: float = 2.0
) -> list[TranscriptEvent]:
    events: list[TranscriptEvent] = []

    async def take() -> None:
        async for event in stt.events():
            events.append(event)
            if len(events) == count:
                return

    await asyncio.wait_for(take(), timeout)
    return events


async def feed_frames(stt: OpenAITranscriber, audio: bytes, chunk: int = FRAME_SAMPLES) -> None:
    for i in range(0, len(audio), chunk):
        await stt.feed(audio[i : i + chunk])


def test_session_is_configured_for_gpt_live_transcribe():
    async def scenario():
        fake = FakeRealtime()
        stt = transcriber(fake, openai_stt_delay="medium")
        await stt.feed(SILENCE)
        await asyncio.sleep(0.05)
        await stt.close()
        return fake

    fake = asyncio.run(scenario())
    assert fake.url == "wss://api.openai.com/v1/realtime?intent=transcription"
    assert fake.headers == {"Authorization": "Bearer sk-test"}
    update = fake.sent[0]
    assert update["type"] == "session.update"
    audio_input = update["session"]["audio"]["input"]
    assert update["session"]["type"] == "transcription"
    assert audio_input["format"] == {"type": "audio/pcm", "rate": PCM_RATE}
    assert audio_input["turn_detection"] is None
    transcription = audio_input["transcription"]
    assert transcription["model"] == "gpt-live-transcribe"
    assert transcription["languages"] == ["bn", "en"]
    assert transcription["delay"] == "medium"
    assert "language" not in transcription
    # Silence alone sends no audio.
    assert not fake.of_type("input_audio_buffer.append")
    assert fake.closed


def test_a_turn_is_sent_with_preroll_committed_and_transcribed():
    async def scenario():
        fake = FakeRealtime(transcripts=["  আমার নাম রিপন  "])
        stt = transcriber(fake)
        # Uneven chunks: frames must be reassembled across feed() calls.
        await feed_frames(stt, SILENCE * 30 + speech(30) + SILENCE * 40, chunk=100)
        events = await collect(stt, 2)
        await stt.close()
        return fake, events

    fake, events = asyncio.run(scenario())
    assert events == [TranscriptEvent("speech_started"), TranscriptEvent("final", "আমার নাম রিপন")]
    assert fake.commits == 1
    sent = b"".join(base64.b64decode(m["audio"]) for m in fake.of_type("input_audio_buffer.append"))
    # 500 ms of pre-roll (25 frames, including the 9 that confirmed speech), the
    # rest of the speech, and the 700 ms pause that ended the turn.
    assert len(sent) == (25 + 21 + 35) * PCM_FRAME_BYTES
    # The commit comes after the turn's audio.
    kinds = [m["type"] for m in fake.sent]
    assert kinds[-1] == "input_audio_buffer.commit"


def test_transcripts_are_emitted_in_the_order_spoken():
    async def scenario():
        fake = FakeRealtime(reply_in_order=False)
        stt = transcriber(fake)
        await feed_frames(stt, SILENCE * 10 + (speech(15) + SILENCE * 40) * 3)
        await asyncio.sleep(0.05)
        # The third and first turns finish before the second.
        fake.complete("item_3", "third")
        fake.complete("item_1", "first")
        fake.push(
            {
                "type": "conversation.item.input_audio_transcription.failed",
                "item_id": "item_2",
                "error": {"message": "audio unclear"},
            }
        )
        events = await collect(stt, 5)
        await stt.close()
        return events

    events = asyncio.run(scenario())
    assert [e.kind for e in events[:3]] == ["speech_started"] * 3
    # The failed turn is skipped; the others keep their order.
    assert events[3:] == [TranscriptEvent("final", "first"), TranscriptEvent("final", "third")]


def test_connection_failure_is_one_error_event():
    async def refuse(url, additional_headers):
        raise OSError("connection refused")

    async def scenario():
        stt = OpenAITranscriber("en", settings=settings(), connect=refuse)
        await feed_frames(stt, SILENCE * 10 + speech(20) + SILENCE * 40)
        events = await collect(stt, 2)
        await stt.close()
        return events

    events = asyncio.run(scenario())
    # The connection is first awaited when the caller's turn is sent.
    assert events[0] == TranscriptEvent("speech_started")
    assert events[1].kind == "error" and "connection refused" in events[1].text


def test_rejected_session_is_an_error_but_later_errors_are_not():
    class Rejecting(FakeRealtime):
        async def send(self, data: str) -> None:
            self.sent.append(json.loads(data))
            if self.sent[-1]["type"] == "session.update":
                self.push(
                    {
                        "type": "error",
                        "error": {"code": "invalid_value", "message": "Unsupported language"},
                    }
                )

    async def rejected():
        fake = Rejecting()
        stt = transcriber(fake)
        await stt.feed(SILENCE)
        events = await collect(stt, 1)
        await stt.close()
        return events

    events = asyncio.run(rejected())
    assert events[0].kind == "error" and "Unsupported language" in events[0].text

    async def later_error():
        fake = FakeRealtime(transcripts=["hello"])
        stt = transcriber(fake, language="en")
        await stt.feed(SILENCE)
        await asyncio.sleep(0.05)
        fake.push({"type": "error", "error": {"code": "x", "message": "a passing problem"}})
        await feed_frames(stt, speech(15) + SILENCE * 40)
        events = await collect(stt, 2)
        await stt.close()
        return events

    assert [e.kind for e in asyncio.run(later_error())] == ["speech_started", "final"]


def test_session_dropping_mid_call_is_an_error():
    async def scenario():
        fake = FakeRealtime()
        stt = transcriber(fake)
        await stt.feed(SILENCE)
        await asyncio.sleep(0.05)
        fake.push(None)  # the server closes the socket
        events = await collect(stt, 1)
        await stt.close()
        return events

    events = asyncio.run(scenario())
    assert events == [TranscriptEvent("error", "the transcription session closed")]


def test_close_ends_the_event_stream():
    async def scenario():
        fake = FakeRealtime()
        stt = transcriber(fake)
        await stt.feed(SILENCE)
        await asyncio.sleep(0.05)
        await stt.close()
        await stt.feed(speech(20))  # ignored after close
        return [e async for e in stt.events()], fake

    events, fake = asyncio.run(scenario())
    assert events == []
    assert fake.closed
    assert not fake.of_type("input_audio_buffer.append")
