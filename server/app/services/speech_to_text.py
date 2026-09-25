"""Live speech-to-text for the phone lines: OpenAI ``gpt-live-transcribe``.

One Realtime transcription session (a WebSocket) per call. Twilio's μ-law
8 kHz audio is decoded and upsampled to the 24 kHz PCM the session accepts.
The model has no voice detection, so ours (``services.audio``) marks the
caller's turns: when a turn starts we emit ``speech_started`` (the phone line
stops talking, for barge-in) and send that turn's audio, with half a second
of pre-roll so the first syllable is not lost; when it ends we commit the
buffer and the session returns the turn's transcript. Only turns are sent,
not the silence between them, so the transcriber never hears our own replies
echoing on a quiet line.

Transcripts are emitted in the order the turns were spoken (completions can
arrive out of order). If the session cannot be opened or configured, or drops
mid-call, a single ``error`` event lets the call end politely; transcripts
are never logged.
"""

import asyncio
import base64
import contextlib
import json
import logging
from collections import deque
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from websockets.asyncio.client import connect as ws_connect

from app.config import Settings, get_settings
from app.services.audio import (
    FRAME_MS,
    FRAME_SAMPLES,
    Upsampler,
    VoiceActivityDetector,
    pcm16_bytes,
    ulaw_decode,
)

log = logging.getLogger(__name__)


@dataclass
class TranscriptEvent:
    kind: Literal["speech_started", "final", "error"]
    text: str = ""


class Transcriber(Protocol):
    async def feed(self, ulaw: bytes) -> None: ...

    def events(self) -> AsyncIterator[TranscriptEvent]: ...

    async def close(self) -> None: ...


# Bangla callers often use English words (and numbers) mid-sentence.
LANGUAGES = {"bn": ["bn", "en"], "en": ["en"]}
PROMPT = (
    "A phone call to a government legal aid office in Bangladesh. Callers give names, "
    "their father's name, districts, dates of birth, phone numbers and eight-digit "
    "tracking numbers, and describe family, land, labour and violence problems."
)
PCM_RATE = 24000
PREROLL_MS = 500


class OpenAITranscriber:
    def __init__(
        self,
        language: str,
        settings: Settings | None = None,
        connect: Callable[..., Any] | None = None,
    ):
        self.settings = s = settings or get_settings()
        self.language = language if language in LANGUAGES else "bn"
        self._connect = connect or ws_connect
        self._vad = VoiceActivityDetector(
            min_speech_rms=s.stt_min_speech_rms, end_ms=s.stt_end_of_turn_ms
        )
        self._upsampler = Upsampler()
        self._preroll: deque[bytes] = deque(maxlen=PREROLL_MS // FRAME_MS)
        self._partial = b""  # μ-law bytes short of a whole frame
        self._events: asyncio.Queue[TranscriptEvent | None] = asyncio.Queue()
        self._ws: Any = None
        self._opening: asyncio.Task[None] | None = None
        self._reader: asyncio.Task[None] | None = None
        self._configured = False
        self._order: deque[str] = deque()  # committed turns, in the order spoken
        self._texts: dict[str, str] = {}
        self._failed = False
        self._closing = False

    def session_update(self) -> dict[str, Any]:
        s = self.settings
        transcription: dict[str, Any] = {
            "model": s.openai_stt_model,
            "languages": LANGUAGES[self.language],
            "prompt": PROMPT,
        }
        if s.openai_stt_model == "gpt-live-transcribe":
            transcription["delay"] = s.openai_stt_delay
        return {
            "type": "session.update",
            "session": {
                "type": "transcription",
                "audio": {
                    "input": {
                        "format": {"type": "audio/pcm", "rate": PCM_RATE},
                        "transcription": transcription,
                        "turn_detection": None,
                    }
                },
            },
        }

    # --- Transcriber ------------------------------------------------------------------

    async def feed(self, ulaw: bytes) -> None:
        if self._failed or self._closing:
            return
        if self._opening is None:
            # Connect while the greeting plays, not when the caller first speaks.
            self._opening = asyncio.create_task(self._open())
        data = self._partial + ulaw
        whole = len(data) - len(data) % FRAME_SAMPLES
        self._partial = data[whole:]

        turn_audio: list[bytes] = []
        for i in range(0, whole, FRAME_SAMPLES):
            samples = ulaw_decode(data[i : i + FRAME_SAMPLES])
            pcm = pcm16_bytes(self._upsampler.process(samples))
            decision = self._vad.frame(samples)
            if decision == "silence":
                self._preroll.append(pcm)
                continue
            if decision == "start":
                self._events.put_nowait(TranscriptEvent("speech_started"))
                turn_audio.extend(self._preroll)
                self._preroll.clear()
            turn_audio.append(pcm)
            if decision == "end":
                await self._append(turn_audio)
                turn_audio = []
                await self._send({"type": "input_audio_buffer.commit"})
        await self._append(turn_audio)

    async def events(self) -> AsyncIterator[TranscriptEvent]:
        while (event := await self._events.get()) is not None:
            yield event

    async def close(self) -> None:
        self._closing = True
        for task in (self._opening, self._reader):
            if task and not task.done():
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
        if self._ws is not None:
            with contextlib.suppress(Exception):
                await self._ws.close()
        self._events.put_nowait(None)

    # --- the Realtime session ---------------------------------------------------------

    async def _open(self) -> None:
        s = self.settings
        try:
            self._ws = await self._connect(
                s.openai_realtime_url,
                additional_headers={"Authorization": f"Bearer {s.openai_api_key}"},
            )
            await self._ws.send(json.dumps(self.session_update()))
        except Exception as exc:
            self._fail(f"could not open the transcription session: {exc}")
            return
        self._reader = asyncio.create_task(self._read())

    async def _append(self, pcm_frames: list[bytes]) -> None:
        if pcm_frames:
            audio = base64.b64encode(b"".join(pcm_frames)).decode()
            await self._send({"type": "input_audio_buffer.append", "audio": audio})

    async def _send(self, event: dict[str, Any]) -> None:
        if self._opening is not None:
            await self._opening
        if self._ws is None or self._failed or self._closing:
            return
        try:
            await self._ws.send(json.dumps(event))
        except Exception as exc:
            self._fail(f"sending audio failed: {exc}")

    async def _read(self) -> None:
        try:
            async for raw in self._ws:
                self._handle(json.loads(raw))
        except Exception as exc:
            if not self._closing:
                log.warning("Transcription session read failed: %s", exc)
        if not self._closing:
            self._fail("the transcription session closed")

    def _handle(self, message: dict[str, Any]) -> None:
        kind = message.get("type")
        if kind in ("session.updated", "transcription_session.updated"):
            self._configured = True
        elif kind == "input_audio_buffer.committed":
            if item_id := message.get("item_id"):
                self._order.append(item_id)
        elif kind == "conversation.item.input_audio_transcription.completed":
            self._done(message.get("item_id", ""), message.get("transcript") or "")
        elif kind == "conversation.item.input_audio_transcription.failed":
            error = message.get("error") or {}
            log.warning("A caller's turn could not be transcribed: %s", error.get("message"))
            self._done(message.get("item_id", ""), "")
        elif kind == "error":
            error = message.get("error") or {}
            log.error(
                "OpenAI transcription error (%s): %s", error.get("code"), error.get("message")
            )
            if not self._configured:
                # The session was never set up (bad key, model or language): nothing will work.
                self._fail(f"the transcription session was rejected: {error.get('message')}")

    def _done(self, item_id: str, text: str) -> None:
        if item_id not in self._order:
            self._emit(text)
            return
        self._texts[item_id] = text
        while self._order and self._order[0] in self._texts:
            self._emit(self._texts.pop(self._order.popleft()))

    def _emit(self, text: str) -> None:
        if text.strip():
            self._events.put_nowait(TranscriptEvent("final", text.strip()))

    def _fail(self, reason: str) -> None:
        if self._failed or self._closing:
            return
        self._failed = True
        log.error("Speech-to-text failed: %s", reason)
        self._events.put_nowait(TranscriptEvent("error", reason))
