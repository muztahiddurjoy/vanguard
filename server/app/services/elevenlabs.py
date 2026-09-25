"""ElevenLabs streaming TTS over WebSocket, producing μ-law 8 kHz for telephony.

``ulaw_8000`` is exactly what Twilio media streams play, so audio chunks can
be forwarded to the call without transcoding. One WebSocket is opened per
reply: replies are short, and a fresh connection keeps barge-in (cancelling
a reply mid-sentence) simple.
"""

import base64
import json
from collections.abc import AsyncGenerator, Callable
from typing import Any, Protocol
from urllib.parse import urlencode

from websockets.asyncio.client import connect as ws_connect

from app.config import Settings, get_settings


class TTSError(RuntimeError):
    pass


class TextToSpeech(Protocol):
    def stream(self, text: str) -> AsyncGenerator[bytes, None]:
        """Yield raw μ-law 8 kHz audio for ``text`` as it is generated."""
        ...


class ElevenLabsTTS:
    OUTPUT_FORMAT = "ulaw_8000"

    def __init__(self, settings: Settings | None = None, connect: Callable[..., Any] | None = None):
        self.settings = settings or get_settings()
        self._connect = connect or ws_connect

    @property
    def configured(self) -> bool:
        return bool(self.settings.elevenlabs_api_key and self.settings.elevenlabs_voice_id)

    def url(self) -> str:
        s = self.settings
        query = urlencode({"model_id": s.elevenlabs_model_id, "output_format": self.OUTPUT_FORMAT})
        base = s.elevenlabs_ws_base.rstrip("/")
        return f"{base}/v1/text-to-speech/{s.elevenlabs_voice_id}/stream-input?{query}"

    async def stream(self, text: str) -> AsyncGenerator[bytes, None]:
        if not self.configured:
            raise TTSError("ElevenLabs is not configured")
        headers = {"xi-api-key": self.settings.elevenlabs_api_key}
        async with self._connect(self.url(), additional_headers=headers) as ws:
            # Opening message primes the voice; "flush" asks for audio now; "" ends input.
            await ws.send(
                json.dumps(
                    {"text": " ", "voice_settings": {"stability": 0.5, "similarity_boost": 0.8}}
                )
            )
            await ws.send(json.dumps({"text": text.strip() + " ", "flush": True}))
            await ws.send(json.dumps({"text": ""}))
            async for raw in ws:
                message = json.loads(raw)
                if message.get("error") or (message.get("message") and "audio" not in message):
                    raise TTSError(str(message.get("error") or message.get("message")))
                if message.get("audio"):
                    yield base64.b64decode(message["audio"])
                if message.get("isFinal"):
                    break
