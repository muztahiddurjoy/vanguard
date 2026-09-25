"""HTTP and WebSocket routers, plus the dependencies they share."""

import secrets

from fastapi import Header, HTTPException, status

from app.config import get_settings


def require_api_token(authorization: str | None = Header(default=None)) -> None:
    """Reject the request unless it carries the configured bearer token.

    With no API_TOKEN configured (local development) every request passes.
    """
    expected = get_settings().api_token
    if not expected:
        return
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(token, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or invalid API token")


def current_actor(x_officer_id: str | None = Header(default=None)) -> str:
    """Who is acting, for the audit ledger. Officer sign-in is owned by the dashboard."""
    return (x_officer_id or "").strip() or "anonymous"
