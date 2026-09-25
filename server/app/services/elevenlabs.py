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
"""

import asyncio
import contextlib
import logging
from collections.abc import AsyncGenerator, AsyncIterator
from typing import Any, Protocol

import httpx

from app.config import Settings, get_settings

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
                    if first:
                        yield first
                    async for chunk in chunks:
                        if chunk:
                            yield chunk
                    return
        except httpx.HTTPError as exc:
            raise TTSError(f"ElevenLabs request failed: {exc}") from exc

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
