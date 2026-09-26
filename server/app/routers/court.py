"""Court staff API (court-dashboard): the court's register, cause lists and legal aid
applications it submits. See ``services.records``."""

from fastapi import APIRouter, Depends

from app.routers import require_api_token

router = APIRouter(prefix="/court", tags=["court"], dependencies=[Depends(require_api_token)])
