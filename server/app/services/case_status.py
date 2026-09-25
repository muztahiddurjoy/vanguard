"""What a tracking number may reveal: the stage a case has reached, nothing more.

The helpline reads this to anyone who says the number, so it carries no names,
narrative, parties or contact details: only the reference, the stage, the
officer's decision on how the case will be resolved, and the next date.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import as_utc, utcnow
from app.models import (
    Case,
    CaseStatus,
    MediationSession,
    MediationStatus,
    TrackStatus,
    TriageStatus,
)


def stage_of(case: Case) -> str:
    if case.status == CaseStatus.CLOSED:
        return "closed"
    if case.status == CaseStatus.IN_MEDIATION:
        return "mediation"
    if case.status == CaseStatus.REFERRED:
        return "referred"
    if case.status == CaseStatus.ACTIVE:
        return "lawyerAssigned" if case.lawyer_id else "accepted"
    return "received" if case.triage_status == TriageStatus.PENDING else "reviewed"


def next_mediation(db: Session, case: Case, now: datetime) -> datetime | None:
    upcoming = db.scalars(
        select(MediationSession.scheduled_for)
        .where(
            MediationSession.case_id == case.id,
            MediationSession.status == MediationStatus.SCHEDULED,
        )
        .order_by(MediationSession.scheduled_for)
    ).all()
    return next((as_utc(t) for t in upcoming if as_utc(t) > now), None)


def public_status(db: Session, case: Case) -> dict[str, Any]:
    nxt = next_mediation(db, case, utcnow())
    decided = case.track_status != TrackStatus.SUGGESTED
    return {
        "reference": case.display_id,
        "stage": stage_of(case),
        "outcome": case.outcome,
        # Only an officer's decision: the AI's mark is not news for the applicant.
        "track": case.track if decided else None,
        "office": case.current_office,
        "nextMediation": nxt.isoformat() if nxt else None,
    }


def lookup_token(db: Session, token: str) -> dict[str, Any] | None:
    case = db.scalars(select(Case).where(Case.tracking_token == token)).first()
    return public_status(db, case) if case else None
