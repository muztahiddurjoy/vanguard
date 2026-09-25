"""Bridges one Twilio media stream to a phone agent and ElevenLabs TTS.

The agent is T5 intake on the application hotline, or the query helpline when
the call came in on that line (the ``line`` stream parameter).

Caller audio (μ-law 8 kHz) goes to a speech-to-text ``Transcriber``; each
final utterance is one T5 turn; the reply is spoken back through ElevenLabs,
whose ``ulaw_8000`` output Twilio plays as-is.

- Barge-in: when the caller starts speaking over a reply, the TTS stream is
  cancelled and Twilio's queued audio cleared. Audio is generated faster than
  it plays, so a reply counts as playing until Twilio echoes its ``mark``.
- Ending: after the closing line has actually finished playing (Twilio echoes
  our ``mark``), the socket is closed and Twilio moves on to the TwiML after
  ``<Connect>``, which hangs up.
- The application is created as soon as T5 says the conversation is complete
  (see ``routers.intake.finish_conversation``). If the call is cut before that,
  it is created from what was said so far; a caller who seemed to be held, or
  who was describing violence when the line went dead, is marked do-not-call.

Speech-to-text is OpenAI ``gpt-live-transcribe`` (``services.speech_to_text``)
when ``OPENAI_API_KEY`` is set. Without it callers hear ``NO_SPEECH_INPUT``
and the call ends; if it fails during a call, they hear ``STT_FAILED`` and the
call ends as a cut call.
"""

import asyncio
import base64
import contextlib
import json
import logging
from collections.abc import Callable
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.agents.helpline import HelplineConversation, helpline
from app.agents.t5_intake import IntakeConversation, conversations, with_token
from app.config import get_settings
from app.database import SessionLocal
from app.services.case_status import lookup_token
from app.services.elevenlabs import TextToSpeech, TTSError
from app.services.speech_to_text import OpenAITranscriber, Transcriber

log = logging.getLogger(__name__)

MARK_TIMEOUT_SECONDS = 30

NO_SPEECH_INPUT = {
    "bn": "দুঃখিত, এই মুহূর্তে ফোনে আবেদন নেওয়া যাচ্ছে না। আপনি বিপদে থাকলে ৯৯৯ নম্বরে ফোন করুন। "
    "আবেদন করতে আপনার ইউনিয়ন ডিজিটাল সেন্টারে যান।",
    "en": "Sorry, we cannot take applications by phone right now. If you are in danger, call 999. "
    "To apply, please visit your Union Digital Centre.",
}

STT_FAILED = {
    "bn": "দুঃখিত, এই মুহূর্তে আপনার কথা শোনা যাচ্ছে না। একটু পরে আবার ফোন করুন। "
    "আপনি বিপদে থাকলে ৯৯৯ নম্বরে ফোন করুন।",
    "en": "Sorry, we cannot hear you right now. Please call again a little later. "
    "If you are in danger, call 999.",
}


def build_transcriber(language: str) -> Transcriber | None:
    """Return the speech-to-text adapter for ``language`` ("bn" or "en"), if one is set up."""
    if get_settings().stt_enabled:
        return OpenAITranscriber(language)
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
        helpline_agent: HelplineConversation | None = None,
        session_factory: Callable[[], Session] = SessionLocal,
    ):
        self.ws = ws
        self.tts = tts
        self.transcriber_factory = transcriber_factory
        self.intake = intake or conversations()
        self._helpline = helpline_agent
        self.session_factory = session_factory

        self.stream_sid: str | None = None
        self.call_sid: str | None = None
        self.caller: str | None = None
        self.language = "bn"
        self.line = "intake"
        self.transcriber: Transcriber | None = None
        self.case_ref: str | None = None
        self.tracking_token: str | None = None

        self._speak_task: asyncio.Task[None] | None = None
        self._listen_task: asyncio.Task[None] | None = None
        self._marks: dict[str, asyncio.Event] = {}
        # The latest reply's mark until Twilio echoes it: its audio may still be playing.
        self._playing: str | None = None
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
                    name = message["mark"]["name"]
                    if name == self._playing:
                        self._playing = None
                    if done := self._marks.get(name):
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
        self.line = "helpline" if params.get("line") == "helpline" else "intake"
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

        state: Any
        if self.line == "helpline":
            state = await asyncio.to_thread(
                self.helpline.start, self.call_sid, language=self.language
            )
        else:
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

    @property
    def helpline(self) -> HelplineConversation:
        if self._helpline is None:
            self._helpline = helpline()
        return self._helpline

    def _lookup(self, token: str) -> dict[str, Any] | None:
        with self.session_factory() as db:
            return lookup_token(db, token)

    # --- speaking ---------------------------------------------------------------

    async def _speak(self, text: str) -> str:
        """Start speaking ``text``; returns the mark name Twilio echoes when it has played."""
        await self._stop_speaking(clear=False)
        self._reply_count += 1
        mark = f"reply-{self._reply_count}"
        self._marks[mark] = asyncio.Event()
        self._playing = mark
        self._speak_task = asyncio.create_task(self._play(text, mark))
        return mark

    async def _play(self, text: str, mark: str) -> None:
        assert self.tts is not None
        try:
            async with contextlib.aclosing(self.tts.stream(text, self.language)) as audio:
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
        """Stop generating the reply; with ``clear``, also silence what Twilio has queued."""
        task, self._speak_task = self._speak_task, None
        if task and not task.done():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        if clear and self._playing is not None:
            self._playing = None
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
            if event.kind == "error":
                # We can no longer hear the caller: say so rather than fall silent.
                await self._say_and_hang_up(STT_FAILED[self.language])
                return
            text = event.text.strip()
            if not text:
                continue
            # What callers say is sensitive: only ever at DEBUG, for local testing.
            log.debug("call %s: caller said %r", self.call_sid, text)
            state: Any
            if self.line == "helpline":
                state = await asyncio.to_thread(
                    self.helpline.turn, self.call_sid, text, self._lookup
                )
                reply = state["reply"]
            else:
                state = await asyncio.to_thread(self.intake.turn, self.call_sid, text)
                reply = state["reply"]
                if state.get("complete"):
                    await asyncio.to_thread(self._finish, state)
                    reply = with_token(reply, self.tracking_token, self.language)
            log.debug("call %s: replying %r", self.call_sid, reply)
            if state.get("complete"):
                await self._say_and_hang_up(reply)
                return
            await self._speak(reply)

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
        if self.tts is not None:
            await self._stop_speaking(clear=False)  # a reply the listener started meanwhile
            await self.tts.aclose()
        if self._conversation_open and self.call_sid:
            state = await asyncio.to_thread(self.intake.state, self.call_sid)
            await asyncio.to_thread(self._finish, state, dropped=True)
