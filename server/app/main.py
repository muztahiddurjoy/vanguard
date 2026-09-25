"""FastAPI application factory."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db
from app.routers import dlao, duplicates, incidents, intake, mediation, referrals, sync


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    if settings.environment == "production" and settings.nid_hash_key == "dev-only-nid-key":
        raise RuntimeError("Set NID_HASH_KEY before running in production")
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for module in (intake, dlao, duplicates, referrals, incidents, mediation, sync):
        app.include_router(module.router)

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, object]:
        return {
            "status": "ok",
            "environment": settings.environment,
            "llm": settings.llm_enabled,
            "sms_dry_run": settings.sms_dry_run or not settings.adnsms_api_key,
        }

    return app


app = create_app()
