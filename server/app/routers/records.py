"""The prisoner and case information linked to a legal aid case, for the DLAO
(the panel lawyer's view is in ``routers.lawyer``). See ``services.records``.

An officer sees the records linked to a case: those the court or jail linked when it
submitted the application, and any the officer linked after searching (a mother
calling the hotline about her son in jail). Every read and search is audited.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    AuditAction,
    CaseRecordLink,
    CourtCase,
    Prisoner,
    record_audit,
)
from app.routers import current_actor, require_api_token
from app.routers.dlao import get_case_or_404
from app.services.records import (
    NEWEST_FILED,
    SEARCH_LIMIT,
    audit_records_viewed,
    case_records,
    court_case_summaries,
    link_record,
    matching_court_cases,
    matching_prisoners,
    prisoner_summaries,
)

router = APIRouter(prefix="/dlao", tags=["dlao"], dependencies=[Depends(require_api_token)])

MIN_QUERY = 3


@router.get("/cases/{ref}/records")
def get_case_records(
    ref: str, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    case = get_case_or_404(db, ref)
    view = case_records(db, case)
    audit_records_viewed(db, case, view, actor)
    db.commit()
    return view


@router.get("/records/search")
def search_records(
    q: str = "", db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    """Court cases and prisoners to link to a case. Restricted court cases never show."""
    needle = q.strip()
    if len(needle) < MIN_QUERY:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Search with at least {MIN_QUERY} characters",
        )
    court_cases = db.scalars(
        select(CourtCase)
        .where(CourtCase.restricted.is_(False), matching_court_cases(needle))
        .order_by(*NEWEST_FILED)
        .limit(SEARCH_LIMIT)
    ).all()
    prisoners = db.scalars(
        select(Prisoner)
        .where(matching_prisoners(needle))
        .order_by(Prisoner.admitted_on.desc(), Prisoner.id.desc())
        .limit(SEARCH_LIMIT)
    ).all()
    record_audit(
        db,
        actor=actor,
        action=AuditAction.RECORDS_SEARCHED,
        entity_type="records",
        entity_id="search",
        details={"q": needle, "courtCases": len(court_cases), "prisoners": len(prisoners)},
    )
    db.commit()
    return {
        "courtCases": court_case_summaries(db, court_cases),
        "prisoners": prisoner_summaries(db, prisoners),
    }


class RecordLinkIn(BaseModel):
    court_case_id: int | None = None
    prisoner_id: int | None = None

    @model_validator(mode="after")
    def _exactly_one(self) -> "RecordLinkIn":
        if (self.court_case_id is None) == (self.prisoner_id is None):
            raise ValueError("Link either a court case or a prisoner")
        return self


@router.post("/cases/{ref}/records")
def link_case_record(
    ref: str,
    body: RecordLinkIn,
    db: Session = Depends(get_db),
    actor: str = Depends(current_actor),
) -> dict[str, Any]:
    """Link a court case or a prisoner found by search; linking it again changes nothing."""
    case = get_case_or_404(db, ref)
    if body.court_case_id is not None:
        court_case = db.get(CourtCase, body.court_case_id)
        # A restricted record is linked only by the court itself, with its application.
        if court_case is None or court_case.restricted:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"No court case {body.court_case_id}")
        link_record(db, case, actor=actor, court_case=court_case)
    else:
        prisoner = db.get(Prisoner, body.prisoner_id)
        if prisoner is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"No prisoner {body.prisoner_id}")
        other = db.scalars(
            select(CaseRecordLink.prisoner_id).where(
                CaseRecordLink.case_id == case.id,
                CaseRecordLink.prisoner_id.is_not(None),
                CaseRecordLink.prisoner_id != prisoner.id,
            )
        ).first()
        if other is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "The case is already linked to another prisoner record"
            )
        link_record(db, case, actor=actor, prisoner=prisoner)
    view = case_records(db, case)
    audit_records_viewed(db, case, view, actor)
    db.commit()
    return view
