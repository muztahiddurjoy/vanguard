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
arrive out of order). A session lost for a passing reason (the service busy,
the socket dropped) is opened again, a few times per call; if a turn the
caller had spoken went with it, a ``repeat`` event asks them to say it again.
A setting that is wrong (the key, model or language), or a session that
cannot be opened again, gives a single ``error`` event so the call can end
politely. Transcripts are never logged.
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
from websockets.exceptions import InvalidStatus

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
    kind: Literal["speech_started", "final", "repeat", "error"]
    text: str = ""


class Transcriber(Protocol):
    async def feed(self, ulaw: bytes) -> None: ...

    def events(self) -> AsyncIterator[TranscriptEvent]: ...

    def set_end_of_turn(self, ms: int) -> None:
        """How much of the caller's silence ends their turn from now on."""
        ...

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
# Words in an error's type or code that mean a setting is wrong: opening the
# session again would not help.
SETTING_ERRORS = ("invalid", "not_found", "unsupported", "auth", "permission", "quota")


def setting_error(error: dict[str, Any]) -> bool:
    code = f"{error.get('type') or ''} {error.get('code') or ''}".casefold()
    return any(word in code for word in SETTING_ERRORS)


def refused(exc: Exception) -> bool:
    """Whether a failed connection was refused for its credentials or URL."""
    return isinstance(exc, InvalidStatus) and exc.response.status_code in (401, 403, 404)


class OpenAITranscriber:
    # Pauses before opening a lost session again; their number is the tries per outage.
    RECONNECT_DELAYS_S = (0.3, 1.0, 2.0)

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
        self._awaiting = 0  # committed turns not yet transcribed
        self._lost_turn = False  # the turn in progress began on a session that was lost
        self._reconnects = 0  # in this outage
        self._generation = 0  # which session the current reader belongs to

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
                if self._lost_turn:
                    # Its start went with a lost session: ask for the whole turn again.
                    self._lost_turn = False
                    turn_audio = []
                    await self._send({"type": "input_audio_buffer.clear"})
                    self._events.put_nowait(TranscriptEvent("repeat"))
                    continue
                await self._append(turn_audio)
                turn_audio = []
                self._awaiting += 1
                await self._send({"type": "input_audio_buffer.commit"})
        await self._append(turn_audio)

    async def events(self) -> AsyncIterator[TranscriptEvent]:
        while (event := await self._events.get()) is not None:
            yield event

    def set_end_of_turn(self, ms: int) -> None:
        self._vad.set_end_ms(ms)

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
            self._ws = None
            self._lost(f"could not open the transcription session: {exc}", setting=refused(exc))
            return
        self._reader = asyncio.create_task(self._read(self._ws, self._generation))

    async def _reopen(self, delay: float) -> None:
        old, self._ws = self._ws, None
        self._configured = False
        if old is not None:
            with contextlib.suppress(Exception):
                await old.close()
        await asyncio.sleep(delay)
        await self._open()

    def _lost(self, reason: str, *, setting: bool = False) -> None:
        """The session failed: open another if the reason may pass, else give up."""
        if self._failed or self._closing:
            return
        if setting or self._reconnects >= len(self.RECONNECT_DELAYS_S):
            self._fail(reason)
            return
        delay = self.RECONNECT_DELAYS_S[self._reconnects]
        self._reconnects += 1
        log.warning("Transcription session lost (%s); opening it again in %.1fs", reason, delay)
        self._generation += 1  # the old session's reader is ignored from now on
        # What the caller said and we had not heard back went with the session.
        unanswered = self._awaiting > 0
        self._awaiting = 0
        self._order.clear()
        self._texts.clear()
        if self._vad.in_turn:
            self._lost_turn = True  # asked again once they finish
        elif unanswered:
            self._events.put_nowait(TranscriptEvent("repeat"))
        self._opening = asyncio.create_task(self._reopen(delay))

    async def _append(self, pcm_frames: list[bytes]) -> None:
        if pcm_frames and not self._lost_turn:
            audio = base64.b64encode(b"".join(pcm_frames)).decode()
            await self._send({"type": "input_audio_buffer.append", "audio": audio})

    async def _send(self, event: dict[str, Any]) -> None:
        # Wait for the session, including one being opened again meanwhile.
        while (opening := self._opening) is not None and not opening.done():
            await asyncio.wait({opening})
        if self._ws is None or self._failed or self._closing:
            return
        try:
            await self._ws.send(json.dumps(event))
        except Exception as exc:
            self._lost(f"sending audio failed: {exc}")

    async def _read(self, ws: Any, generation: int) -> None:
        try:
            async for raw in ws:
                if generation != self._generation:
                    return
                self._handle(json.loads(raw))
        except Exception as exc:
            if generation == self._generation and not self._closing:
                log.warning("Transcription session read failed: %s", exc)
        if generation == self._generation and not self._closing:
            self._lost("the transcription session closed")

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
                # Not set up: a wrong setting fails the call, a busy service is tried again.
                self._lost(
                    f"the transcription session was rejected: {error.get('message')}",
                    setting=setting_error(error),
                )

    def _done(self, item_id: str, text: str) -> None:
        if item_id not in self._order:
            self._emit(text)
            return
        self._texts[item_id] = text
        while self._order and self._order[0] in self._texts:
            self._emit(self._texts.pop(self._order.popleft()))

    def _emit(self, text: str) -> None:
        self._awaiting = max(0, self._awaiting - 1)
        self._reconnects = 0  # the session works: a later outage gets its own tries
        if text.strip():
            self._events.put_nowait(TranscriptEvent("final", text.strip()))

    def _fail(self, reason: str) -> None:
        if self._failed or self._closing:
            return
        self._failed = True
        log.error("Speech-to-text failed: %s", reason)
        self._events.put_nowait(TranscriptEvent("error", reason))
