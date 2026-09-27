"""The dashboards call the backend from their own origins, so every answer they may
get, errors included, must carry the CORS headers: without them the browser hides
the answer and a dashboard can only say the server could not be reached."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

DASHBOARD = "http://localhost:5173"  # one of the default CORS_ORIGINS


@pytest.fixture
def failing_app():  # type: ignore[no-untyped-def]
    app = create_app()

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("a bug")

    return app


def allowed(response) -> str | None:  # type: ignore[no-untyped-def]
    return response.headers.get("access-control-allow-origin")


def test_a_dashboard_may_call_the_api(client):
    r = client.get("/health", headers={"Origin": DASHBOARD})
    assert allowed(r) == DASHBOARD
    assert r.headers["access-control-allow-credentials"] == "true"


def test_the_preflight_allows_the_dashboards_headers_and_methods(client):
    for method in ("GET", "POST", "PUT", "PATCH"):
        r = client.options(
            "/court/cases/1",
            headers={
                "Origin": DASHBOARD,
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": "authorization, content-type, x-court-staff-id",
            },
        )
        assert r.status_code == 200, method
        assert allowed(r) == DASHBOARD
        assert method in r.headers["access-control-allow-methods"]
        assert "x-court-staff-id" in r.headers["access-control-allow-headers"].lower()


def test_other_origins_are_refused(client):
    r = client.options(
        "/dlao/cases",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert r.status_code == 400
    assert allowed(r) is None
    assert allowed(client.get("/health", headers={"Origin": "https://evil.example"})) is None


def test_errors_the_api_raises_carry_the_headers(client):
    r = client.get("/dlao/cases/APP-9999-999", headers={"Origin": DASHBOARD})
    assert r.status_code == 404
    assert allowed(r) == DASHBOARD


def test_an_unhandled_error_is_a_500_the_dashboard_can_read(failing_app):
    with TestClient(failing_app, raise_server_exceptions=False) as client:
        r = client.get("/boom", headers={"Origin": DASHBOARD})
    assert r.status_code == 500
    assert r.json() == {"detail": "Internal Server Error"}
    assert allowed(r) == DASHBOARD


def test_an_unhandled_error_still_reaches_the_server_log(failing_app):
    # Raised on after the answer is sent, so it is logged (and fails tests) as before.
    with TestClient(failing_app) as client, pytest.raises(RuntimeError, match="a bug"):
        client.get("/boom", headers={"Origin": DASHBOARD})
