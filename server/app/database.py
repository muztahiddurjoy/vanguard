"""SQLAlchemy engine, session factory and declarative base."""

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


# How far the app's clock is from the real one. Only the demo seed moves it
# (scripts/seed_cases.py, to date its cases in the past); it is 0 everywhere else.
_clock_offset = timedelta(0)


def utcnow() -> datetime:
    """Now. Every time the app records (audit entries included) comes from here."""
    return datetime.now(UTC) + _clock_offset


@contextmanager
def clock_set_to(moment: datetime) -> Iterator[None]:
    """Record what is done inside as happening from ``moment`` on; time still runs.

    For the demo seed only: it is one clock for the whole process, not per request.
    """
    global _clock_offset
    previous = _clock_offset
    _clock_offset = moment - datetime.now(UTC)
    try:
        yield
    finally:
        _clock_offset = previous


def as_utc(value: datetime) -> datetime:
    """SQLite returns naive datetimes; everything we store is UTC."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def make_engine(url: str, **kwargs: Any) -> Engine:
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True, **kwargs)
    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn: Any, _record: Any) -> None:
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

    return engine


engine = make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, rolled back on error."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db(bind: Engine | None = None) -> None:
    """Create tables. Schema migrations (Alembic) are a follow-up."""
    import app.models  # noqa: F401  (registers every table on Base.metadata)

    Base.metadata.create_all(bind=bind or engine)
