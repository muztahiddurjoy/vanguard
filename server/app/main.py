"""FastAPI application factory."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import get_settings
from app.database import init_db
from app.routers import (
    court,
    dlao,
    duplicates,
    helpline,
    incidents,
    intake,
    lawyer,
    mediation,
    prison,
    records,
    referrals,
    sync,
    telephony,
    udc,
)
from app.services.elevenlabs import ElevenLabsTTS

log = logging.getLogger(__name__)


class ServerErrorInsideCors:
    """Answer an unhandled error with a JSON 500 that the CORS headers are added to.

    Starlette answers such errors in its outermost layer, outside CORSMiddleware, so a
    dashboard on another origin got a 500 without them: the browser hid it and the
    dashboard could only say the server was unreachable. The error is raised on after
    the answer, so it is still logged (and still fails tests).
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def tracked(message: Message) -> None:
            nonlocal started
            started = started or message["type"] == "http.response.start"
            await send(message)

        try:
            await self.app(scope, receive, tracked)
        except Exception:
            if not started:
                response = JSONResponse({"detail": "Internal Server Error"}, status_code=500)
                await response(scope, receive, send)
            raise


async def voice_status() -> str:
    """The phone lines' voice: "ok", "off", "error: ..." or "unchecked: ...".

    Checked once at startup, so a wrong key, voice or model shows before a call
    rather than as silence on it.
    """
    tts = ElevenLabsTTS()
    if not tts.configured:
        return "off"
    try:
        result, why = await tts.check()
    finally:
        await tts.aclose()
    if result == "error":
        log.error("The phone lines cannot speak: %s", why)
    elif result == "unchecked":
        log.warning("The phone lines' voice could not be checked: %s", why)
    return f"{result}: {why}" if why else result


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    if settings.environment == "production" and settings.nid_hash_key == "dev-only-nid-key":
        raise RuntimeError("Set NID_HASH_KEY before running in production")
    init_db()
    app.state.voice = await voice_status()
    yield


def configure_logging(level: str) -> None:
    """Show the app's own log lines (uvicorn's --log-level covers only uvicorn's)."""
    app_log = logging.getLogger("app")
    app_log.setLevel(level.upper())
    if not app_log.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
        app_log.addHandler(handler)


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
    # Added first, so it runs inside CORSMiddleware (the last one added is outermost).
    app.add_middleware(ServerErrorInsideCors)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for module in (
        intake,
        dlao,
        records,
        lawyer,
        court,
        prison,
        duplicates,
        referrals,
        incidents,
        mediation,
        udc,
        sync,
        helpline,
        telephony,
    ):
        app.include_router(module.router)

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, object]:
        return {
            "status": "ok",
            "environment": settings.environment,
            "llm": settings.llm_enabled,
            "llm_provider": settings.llm_provider,
            "speech_to_text": settings.stt_enabled,
            "voice": getattr(app.state, "voice", "off"),
            "sms_dry_run": settings.sms_dry_run or not settings.adnsms_api_key,
        }

    return app


app = create_app()
