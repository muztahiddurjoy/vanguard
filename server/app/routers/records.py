"""The prisoner and case information linked to a legal aid case, for the DLAO
(the panel lawyer's view is in ``routers.lawyer``). See ``services.records``."""

from fastapi import APIRouter, Depends

from app.routers import require_api_token

router = APIRouter(prefix="/dlao", tags=["dlao"], dependencies=[Depends(require_api_token)])
