"""Twilio voice webhook and media-stream WebSocket for the legal aid phone lines.

Two lines share these endpoints: the application hotline (the default), which
asks whether the caller wants to file a new case (T5 intake) or hear the
progress of one (the helpline agent), and the query helpline printed in SMS
(``?line=helpline``).

Twilio cannot send our bearer token, so these endpoints are authenticated by
Twilio's request signature instead (``X-Twilio-Signature``), which is always
enforced in production.
"""

import base64
import hashlib
import hmac
import logging
from xml.sax.saxutils import escape, quoteattr

from fastapi import APIRouter, HTTPException, Request, Response, WebSocket, status

from app.config import get_settings
from app.services.elevenlabs import ElevenLabsTTS
from app.services.stream_manager import StreamManager

log = logging.getLogger(__name__)

router = APIRouter(prefix="/telephony", tags=["telephony"])

UNAVAILABLE = (
    "The legal aid hotline cannot take applications by phone right now. "
    "If you are in danger, call 9 9 9. To apply, please visit your Union Digital Centre."
)


def twilio_signature(auth_token: str, url: str, params: dict[str, str]) -> str:
    """Twilio's scheme: HMAC-SHA1 over the URL followed by each sorted key+value."""
    payload = url + "".join(f"{k}{params[k]}" for k in sorted(params))
    digest = hmac.new(auth_token.encode(), payload.encode(), hashlib.sha1).digest()
    return base64.b64encode(digest).decode()


def _validation_on() -> bool:
    s = get_settings()
    return s.twilio_validate_signatures or s.environment == "production"


def _check_signature(signature: str | None, url: str, params: dict[str, str]) -> None:
    if not _validation_on():
        return
    token = get_settings().twilio_auth_token
    if not token or not signature:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing Twilio signature")
    if not hmac.compare_digest(twilio_signature(token, url, params), signature):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid Twilio signature")


def public_url(path: str, query: str = "") -> str:
    """The URL Twilio called, as configured publicly (proxies rewrite the host)."""
    url = get_settings().public_base_url.rstrip("/") + path
    return f"{url}?{query}" if query else url


def media_stream_url() -> str:
    base = get_settings().public_base_url.rstrip("/")
    return base.replace("https://", "wss://", 1).replace("http://", "ws://", 1) + "/telephony/media"


def twiml(body: str) -> Response:
    xml = f'<?xml version="1.0" encoding="UTF-8"?><Response>{body}</Response>'
    return Response(content=xml, media_type="application/xml")


@router.post("/voice")
async def voice(request: Request, lang: str = "bn", line: str = "intake") -> Response:
    form = {k: str(v) for k, v in (await request.form()).items()}
    _check_signature(
        request.headers.get("X-Twilio-Signature"),
        public_url(request.url.path, request.url.query),
        form,
    )
    # Without a working voice the caller would hear silence: say so instead.
    broken = str(getattr(request.app.state, "voice", "")).startswith("error")
    if broken or not ElevenLabsTTS().configured:
        return twiml(f'<Say language="en-IN">{escape(UNAVAILABLE)}</Say><Hangup/>')
    language = "en" if lang == "en" else "bn"
    params = f'<Parameter name="language" value={quoteattr(language)}/>'
    if line == "helpline":
        params += '<Parameter name="line" value="helpline"/>'
    if caller := form.get("From"):
        params += f'<Parameter name="caller" value={quoteattr(caller)}/>'
    # When our side closes the stream, Twilio continues with <Hangup/>.
    return twiml(
        f"<Connect><Stream url={quoteattr(media_stream_url())}>{params}</Stream></Connect><Hangup/>"
    )


@router.post("/status", status_code=status.HTTP_204_NO_CONTENT)
async def call_status(request: Request) -> Response:
    form = {k: str(v) for k, v in (await request.form()).items()}
    _check_signature(request.headers.get("X-Twilio-Signature"), public_url(request.url.path), form)
    log.info("call %s is %s", form.get("CallSid"), form.get("CallStatus"))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def make_stream_manager(ws: WebSocket) -> StreamManager:
    tts = ElevenLabsTTS()
    return StreamManager(ws, tts=tts if tts.configured else None)


@router.websocket("/media")
async def media(ws: WebSocket) -> None:
    if _validation_on():
        token = get_settings().twilio_auth_token
        signature = ws.headers.get("x-twilio-signature") or ""
        expected = twilio_signature(token, media_stream_url(), {}) if token else ""
        if not token or not hmac.compare_digest(expected, signature):
            await ws.close(code=1008)
            return
    await ws.accept()
    await make_stream_manager(ws).run()
