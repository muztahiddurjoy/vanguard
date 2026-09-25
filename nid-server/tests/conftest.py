import os
from pathlib import Path

# Tests never read a developer's .env values.
os.environ.update(
    {
        "ENVIRONMENT": "development",
        "NID_API_KEY": "",
        "NAME_MATCH_THRESHOLD": "85",
        "DATA_FILE": str(Path(__file__).resolve().parents[1] / "app" / "data" / "citizens.json"),
    }
)

from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture
def app_with() -> Callable[..., FastAPI]:
    """An app whose settings differ from the defaults, e.g. ``app_with(nid_api_key="k")``."""

    def build(**overrides: Any) -> FastAPI:
        settings = get_settings().model_copy(update=overrides)
        app = create_app()
        app.dependency_overrides[get_settings] = lambda: settings
        return app

    return build
