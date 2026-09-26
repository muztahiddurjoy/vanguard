"""Jail staff API (prison-dashboard): the jail's prisoners, their court dates and the legal
aid applications it submits. See ``services.records``."""

from fastapi import APIRouter, Depends

from app.routers import require_api_token

router = APIRouter(prefix="/prison", tags=["prison"], dependencies=[Depends(require_api_token)])
