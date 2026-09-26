"""Union Digital Centres: notices asking them to tell a party about the next mediation
session, and their report that they did. See ``services.mediation``."""

from fastapi import APIRouter, Depends

from app.routers import require_api_token

router = APIRouter(prefix="/udc", tags=["udc"], dependencies=[Depends(require_api_token)])
