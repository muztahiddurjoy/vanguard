"""Union Digital Centres: notices asking them to tell a party about the next mediation
session, and their report that they did. See ``services.mediation``.

A UDC sees only the notices sent to it. One an officer is holding back, or one for
another centre, is a 404, as if it did not exist.
"""

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UdcNotice, UdcNoticeStatus
from app.routers import require_api_token
from app.services import mediation
from app.services.udc import Udc, get_udc

router = APIRouter(prefix="/udc", tags=["udc"], dependencies=[Depends(require_api_token)])


def current_udc(x_udc_id: str | None = Header(default=None)) -> Udc:
    """The centre acting. Sign-in is owned by the UDC's app, as for officers."""
    udc = get_udc(x_udc_id or "")
    if udc is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in with a UDC ID (X-Udc-Id)")
    return udc


@router.get("/me")
def me(udc: Udc = Depends(current_udc)) -> dict[str, Any]:
    return udc.view()


@router.get("/notices")
def notices(db: Session = Depends(get_db), udc: Udc = Depends(current_udc)) -> list[dict[str, Any]]:
    """The centre's notices, newest first."""
    rows = db.scalars(
        select(UdcNotice)
        .where(UdcNotice.udc_id == udc.id, UdcNotice.status != UdcNoticeStatus.HELD)
        .order_by(UdcNotice.created_at.desc(), UdcNotice.id.desc())
    )
    return [mediation.udc_notice_view(db, n) for n in rows]


class InformedIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


@router.post("/notices/{notice_id}/informed")
def informed(
    notice_id: int,
    body: InformedIn,
    db: Session = Depends(get_db),
    udc: Udc = Depends(current_udc),
) -> dict[str, Any]:
    """The centre told the person in person."""
    notice = db.get(UdcNotice, notice_id)
    if notice is None or notice.udc_id != udc.id or notice.status == UdcNoticeStatus.HELD:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such notice")
    if notice.status == UdcNoticeStatus.INFORMED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This notice is already marked as informed")
    mediation.mark_informed(db, notice, udc, body.note)
    db.commit()
    return mediation.udc_notice_view(db, notice)
