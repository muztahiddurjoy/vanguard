import os
import tempfile

# Tests never touch real services or a developer's .env values.
os.environ.update(
    {
        "DATABASE_URL": "sqlite://",
        "API_TOKEN": "",
        "ANTHROPIC_API_KEY": "",
        "OPENAI_API_KEY": "",
        "LLM_PROVIDER": "anthropic",
        "SMS_DRY_RUN": "true",
        # Environment variables beat .env, so blanking these keeps a developer's
        # real gateway credentials out of tests that build Settings() directly.
        "ADNSMS_API_KEY": "",
        "ADNSMS_API_SECRET": "",
        "ELEVENLABS_API_KEY": "",
        # Defaults, not whatever a developer's .env tunes them to.
        "ELEVENLABS_MODEL_ID": "eleven_v3",
        "VOICE_SPEED": "1.2",
        "OPENAI_MODEL": "gpt-6-luna",
        "OPENAI_STT_MODEL": "gpt-live-transcribe",
        "OPENAI_STT_DELAY": "low",
        "STT_END_OF_TURN_MS": "700",
        "STT_STORY_END_OF_TURN_MS": "1200",
        "STT_MIN_SPEECH_RMS": "500",
        "LOG_LEVEL": "INFO",
        "TWILIO_AUTH_TOKEN": "",
        "NID_SERVER_URL": "",
        "HELPLINE_NUMBER": "16430",
        "SMS_ALLOWLIST": "",
        "OFFICE_DISTRICT": "Rangpur",
        "TWILIO_VALIDATE_SIGNATURES": "false",
        "UPLOAD_DIR": tempfile.mkdtemp(prefix="dlas-test-uploads-"),
    }
)

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db, init_db, make_engine


@pytest.fixture
def db_engine():  # type: ignore[no-untyped-def]
    # StaticPool: one in-memory database shared with the TestClient thread.
    eng = make_engine("sqlite://", poolclass=StaticPool)
    init_db(eng)
    yield eng
    Base.metadata.drop_all(eng)


@pytest.fixture
def db(db_engine) -> Iterator[Session]:  # type: ignore[no-untyped-def]
    session = sessionmaker(bind=db_engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


@pytest.fixture
def client(db_engine) -> Iterator[TestClient]:  # type: ignore[no-untyped-def]
    from app.main import create_app

    factory = sessionmaker(bind=db_engine, autoflush=False, expire_on_commit=False)

    def _get_db() -> Iterator[Session]:
        s = factory()
        try:
            yield s
        finally:
            s.close()

    app = create_app()
    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c
