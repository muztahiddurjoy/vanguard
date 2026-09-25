"""Bridges one Twilio media stream to the T5 intake agent and ElevenLabs TTS.

Caller audio (μ-law 8 kHz) goes to a speech-to-text ``Transcriber``; each
final utterance is one T5 turn; the reply is spoken back through ElevenLabs,
whose ``ulaw_8000`` output Twilio plays as-is.

- Barge-in: when the caller starts speaking over a reply, playback is
  cleared on Twilio and the TTS stream is cancelled.
- Ending: after the closing line has actually finished playing (Twilio echoes
  our ``mark``), the socket is closed and Twilio moves on to the TwiML after
  ``<Connect>``, which hangs up.
- The application is created as soon as T5 says the conversation is complete
  (see ``routers.intake.finish_conversation``). If the call is cut before that,
  it is created from what was said so far; a caller who seemed to be held, or
  who was describing violence when the line went dead, is marked do-not-call.

No speech-to-text provider ships with this service: implement ``Transcriber``
and return it from ``build_transcriber``. Until then callers hear
``NO_SPEECH_INPUT`` and the call ends.
"""

import asyncio
import base64
import contextlib
import json
import logging
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from sqlalchemy.orm import Session

from app.agents.t5_intake import IntakeConversation, conversations, with_token
from app.database import SessionLocal
from app.services.elevenlabs import TextToSpeech, TTSError

log = logging.getLogger(__name__)

MARK_TIMEOUT_SECONDS = 30

NO_SPEECH_INPUT = {
    "bn": "দুঃখিত, এই মুহূর্তে ফোনে আবেদন নেওয়া যাচ্ছে না। আপনি বিপদে থাকলে ৯৯৯ নম্বরে ফোন করুন। "
    "আবেদন করতে আপনার ইউনিয়ন ডিজিটাল সেন্টারে যান।",
    "en": "Sorry, we cannot take applications by phone right now. If you are in danger, call 999. "
    "To apply, please visit your Union Digital Centre.",
}


@dataclass
class TranscriptEvent:
    kind: Literal["speech_started", "final"]
    text: str = ""


class Transcriber(Protocol):
    async def feed(self, ulaw: bytes) -> None: ...

    def events(self) -> AsyncIterator[TranscriptEvent]: ...

    async def close(self) -> None: ...


def build_transcriber(language: str) -> Transcriber | None:
    """Return the speech-to-text adapter for ``language`` ("bn" or "en"), if one is set up."""
    return None


class TwilioSocket(Protocol):
    async def receive_text(self) -> str: ...

    async def send_text(self, data: str) -> None: ...

    async def close(self, code: int = 1000) -> None: ...


class StreamManager:
    def __init__(
        self,
        ws: TwilioSocket,
        *,
        tts: TextToSpeech | None,
        transcriber_factory: Callable[[str], Transcriber | None] = build_transcriber,
        intake: IntakeConversation | None = None,
        session_factory: Callable[[], Session] = SessionLocal,
    ):
        self.ws = ws
        self.tts = tts
        self.transcriber_factory = transcriber_factory
        self.intake = intake or conversations()
        self.session_factory = session_factory

        self.stream_sid: str | None = None
        self.call_sid: str | None = None
        self.caller: str | None = None
        self.language = "bn"
        self.transcriber: Transcriber | None = None
        self.case_ref: str | None = None
        self.tracking_token: str | None = None

        self._speak_task: asyncio.Task[None] | None = None
        self._listen_task: asyncio.Task[None] | None = None
        self._marks: dict[str, asyncio.Event] = {}
        self._reply_count = 0
        # True between the intake greeting and _finish: a hang-up then is a cut call.
        self._conversation_open = False

    # --- Twilio side ----------------------------------------------------------

    async def run(self) -> None:
        try:
            while True:
                try:
                    raw = await self.ws.receive_text()
                except Exception:  # disconnect, or we closed the socket
                    break
                message = json.loads(raw)
                event = message.get("event")
                if event == "start":
                    await self._on_start(message["start"])
                elif event == "media":
                    media = message["media"]
                    if self.transcriber and media.get("track", "inbound") == "inbound":
                        await self.transcriber.feed(base64.b64decode(media["payload"]))
                elif event == "mark":
                    done = self._marks.get(message["mark"]["name"])
                    if done:
                        done.set()
                elif event == "stop":
                    break
        finally:
            await self._shutdown()

    async def _send(self, payload: dict[str, Any]) -> None:
        await self.ws.send_text(json.dumps(payload))

    async def _on_start(self, start: dict[str, Any]) -> None:
        self.stream_sid = start["streamSid"]
        self.call_sid = start["callSid"]
        params = start.get("customParameters") or {}
        self.language = "en" if params.get("language") == "en" else "bn"
        self.caller = params.get("caller")
        self.transcriber = self.transcriber_factory(self.language)

        if self.tts is None:
            await self.ws.close()
            return
        if self.transcriber is None:
            # In the background: the receive loop must keep running to see our mark.
            self._listen_task = asyncio.create_task(
                self._say_and_hang_up(NO_SPEECH_INPUT[self.language])
            )
            return

        state = await asyncio.to_thread(
            self.intake.start,
            self.call_sid,
            channel="hotline_16699",
            language=self.language,
            caller_phone=self.caller,
        )
        self._conversation_open = True
        self._listen_task = asyncio.create_task(self._listen())
        await self._speak(state["reply"])

    # --- speaking ---------------------------------------------------------------

    async def _speak(self, text: str) -> str:
        """Start speaking ``text``; returns the mark name Twilio echoes when it has played."""
        await self._stop_speaking(clear=False)
        self._reply_count += 1
        mark = f"reply-{self._reply_count}"
        self._marks[mark] = asyncio.Event()
        self._speak_task = asyncio.create_task(self._play(text, mark))
        return mark

    async def _play(self, text: str, mark: str) -> None:
        assert self.tts is not None
        try:
            async with contextlib.aclosing(self.tts.stream(text)) as audio:
                async for chunk in audio:
                    await self._send(
                        {
                            "event": "media",
                            "streamSid": self.stream_sid,
                            "media": {"payload": base64.b64encode(chunk).decode()},
                        }
                    )
        except TTSError as exc:
            log.error("TTS failed on call %s: %s", self.call_sid, exc)
        await self._send({"event": "mark", "streamSid": self.stream_sid, "mark": {"name": mark}})

    async def _stop_speaking(self, *, clear: bool) -> None:
        task, self._speak_task = self._speak_task, None
        if task and not task.done():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            if clear:
                await self._send({"event": "clear", "streamSid": self.stream_sid})

    async def _wait_played(self, mark: str) -> None:
        if self._speak_task:
            with contextlib.suppress(asyncio.CancelledError):
                await self._speak_task
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(self._marks[mark].wait(), MARK_TIMEOUT_SECONDS)

    async def _say_and_hang_up(self, text: str) -> None:
        mark = await self._speak(text)
        await self._wait_played(mark)
        await self.ws.close()

    # --- listening ----------------------------------------------------------------

    async def _listen(self) -> None:
        assert self.transcriber is not None and self.call_sid is not None
        async for event in self.transcriber.events():
            if event.kind == "speech_started":
                await self._stop_speaking(clear=True)  # barge-in
                continue
            text = event.text.strip()
            if not text:
                continue
            state = await asyncio.to_thread(self.intake.turn, self.call_sid, text)
            if state.get("complete"):
                await asyncio.to_thread(self._finish, state)
                await self._say_and_hang_up(
                    with_token(state["reply"], self.tracking_token, self.language)
                )
                return
            await self._speak(state["reply"])

    def _finish(self, state: Any, *, dropped: bool = False) -> None:
        from app.routers.intake import finish_conversation

        assert self.call_sid is not None
        self._conversation_open = False
        with self.session_factory() as db:
            case = finish_conversation(
                db,
                self.call_sid,
                state,
                actor="agent:t5:hotline",
                fallback_phone=self.caller,
                dropped=dropped,
            )
            db.commit()
            self.case_ref = case.display_id if case else None
            self.tracking_token = case.tracking_token if case else None
        log.info(
            "call %s %s; application %s",
            self.call_sid,
            "was cut" if dropped else "finished",
            self.case_ref,
        )

    async def _shutdown(self) -> None:
        await self._stop_speaking(clear=False)
        if self._listen_task and not self._listen_task.done():
            self._listen_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._listen_task
        if self.transcriber:
            await self.transcriber.close()
        if self._conversation_open and self.call_sid:
            state = await asyncio.to_thread(self.intake.state, self.call_sid)
            await asyncio.to_thread(self._finish, state, dropped=True)
