"""ElevenLabs streaming TTS over HTTP, producing μ-law 8 kHz for telephony.

``ulaw_8000`` is exactly what Twilio media streams play, so audio chunks can
be forwarded to the call without transcoding. Each reply is one streamed
``POST /v1/text-to-speech/{voice}/stream``; the call's replies share one HTTP
connection, and closing the stream mid-reply (barge-in) cancels it.

HTTP rather than the WebSocket input-streaming endpoint because that one
rejects the models that speak Bangla (``eleven_v3`` and newer): we always
have the whole reply before speaking, so nothing is lost. The call's language
is sent as ``language_code`` so the model does not guess (a model without
Bangla reads Bangla script with a Hindi accent).

``eleven_v3`` usually starts speaking within about a second but now and then
stalls for 5-10 s before the first audio. A caller would hear dead air, so a
reply with no audio after ``ELEVENLABS_FIRST_AUDIO_TIMEOUT_S`` is requested
once more (without a limit the second time).

Twilio plays audio the moment it arrives, and ``eleven_v3`` sends it in
bursts: played as it comes, half of all replies had audible gaps (measured).
So the first ``VOICE_START_BUFFER_S`` of each reply is held back and sent at
once; waiting for it costs about 0.4 s, because the second burst usually
brings it.

``eleven_v3`` speaks slowly and ignores the API's ``voice_settings.speed``, so
the audio is sped up here instead, ``VOICE_SPEED`` times at the same pitch,
but only while more than ``CUSHION_S`` is already queued: a sped-up line
drains Twilio's queue faster than a burst refills it.
"""

import asyncio
import contextlib
import logging
import time
from collections.abc import AsyncGenerator, AsyncIterator
from typing import Any, Protocol

import httpx

from app.config import Settings, get_settings
from app.services.audio import SAMPLE_RATE, TempoChanger, ulaw_decode, ulaw_encode

log = logging.getLogger(__name__)


class TTSError(RuntimeError):
    pass


class TextToSpeech(Protocol):
    def stream(self, text: str, language: str | None = None) -> AsyncGenerator[bytes, None]:
        """Yield raw μ-law 8 kHz audio for ``text`` as it is generated."""
        ...

    async def aclose(self) -> None: ...


class ElevenLabsTTS:
    OUTPUT_FORMAT = "ulaw_8000"
    # Audio queued at Twilio before a reply is sped up. With a 0.6 s start buffer,
    # 16 recorded eleven_v3 replies had one gap (70 ms) and played 1.1x faster.
    CUSHION_S = 1.0

    def __init__(
        self,
        settings: Settings | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.settings = settings or get_settings()
        self._transport = transport
        self._client: httpx.AsyncClient | None = None

    @property
    def configured(self) -> bool:
        return bool(self.settings.elevenlabs_api_key and self.settings.elevenlabs_voice_id)

    def url(self) -> str:
        s = self.settings
        return (
            f"{s.elevenlabs_base_url.rstrip('/')}/v1/text-to-speech/{s.elevenlabs_voice_id}/stream"
        )

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                headers={"xi-api-key": self.settings.elevenlabs_api_key},
                timeout=httpx.Timeout(30.0, connect=10.0),
                transport=self._transport,
            )
        return self._client

    async def stream(self, text: str, language: str | None = None) -> AsyncGenerator[bytes, None]:
        if not self.configured:
            raise TTSError("ElevenLabs is not configured")
        body: dict[str, str] = {"text": text.strip(), "model_id": self.settings.elevenlabs_model_id}
        if language:
            body["language_code"] = language
        timeout: float | None = self.settings.elevenlabs_first_audio_timeout_s or None
        try:
            for _ in range(2):
                async with contextlib.AsyncExitStack() as stack:
                    try:
                        chunks, first = await asyncio.wait_for(self._start(stack, body), timeout)
                    except TimeoutError:
                        log.warning("ElevenLabs gave no audio in %.1fs; asking again", timeout)
                        timeout = None
                        continue
                    async for chunk in self._playable(first, chunks):
                        yield chunk
                    return
        except httpx.HTTPError as exc:
            raise TTSError(f"ElevenLabs request failed: {exc}") from exc

    async def _playable(
        self, first: bytes, chunks: AsyncIterator[bytes]
    ) -> AsyncGenerator[bytes, None]:
        """The reply as Twilio should get it: sped up, its start held back to play smoothly."""
        speed = self.settings.voice_speed
        hold = int(self.settings.voice_start_buffer_s * SAMPLE_RATE)
        tempo = TempoChanger(speed)
        queued_until = 0.0  # when the audio sent so far will have played
        held: bytes | None = b""  # the start of the reply, until there is enough of it

        async def generated() -> AsyncIterator[bytes]:
            if first:
                yield first
            async for chunk in chunks:
                if chunk:
                    yield chunk

        async for chunk in generated():
            now = time.monotonic()
            if speed == 1.0:
                out = chunk
            else:
                tempo.rate = speed if queued_until - now >= self.CUSHION_S else 1.0
                out = ulaw_encode(tempo.process(ulaw_decode(chunk)))
            if held is not None:
                held += out
                if len(held) < hold:
                    continue
                out, held = held, None
            if out:
                queued_until = max(queued_until, now) + len(out) / SAMPLE_RATE
                yield out
        if rest := (held or b"") + ulaw_encode(tempo.flush()):
            yield rest

    async def _start(
        self, stack: contextlib.AsyncExitStack, body: dict[str, Any]
    ) -> tuple[AsyncIterator[bytes], bytes]:
        """Send the request and wait for the first audio; the stack owns the response."""
        response = await stack.enter_async_context(
            self._http().stream(
                "POST", self.url(), params={"output_format": self.OUTPUT_FORMAT}, json=body
            )
        )
        if response.status_code != 200:
            detail = (await response.aread()).decode(errors="replace")[:300]
            raise TTSError(f"ElevenLabs {response.status_code}: {detail}")
        chunks = response.aiter_bytes()
        return chunks, await anext(chunks, b"")

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
