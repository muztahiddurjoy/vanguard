"""T2 referrals between district legal aid offices, with ping-pong escalation.

A case that is passed back to an office it already left, or that has already
been referred ``REFERRAL_ESCALATION_HOPS`` times, is not referred again: the
referral is recorded as escalated, the case is flagged for the dashboard's
alerts, and a decision above district level is required. This stops an
applicant being bounced between offices while nobody helps them.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db, utcnow
from app.models import AuditAction, Case, CaseStatus, Referral, ReferralStatus, record_audit
from app.routers import current_actor, require_api_token
from app.routers.dlao import get_case_or_404

router = APIRouter(
    prefix="/referrals", tags=["referrals"], dependencies=[Depends(require_api_token)]
)


def referral_view(r: Referral) -> dict[str, Any]:
    return {
        "id": r.id,
        "caseId": r.case.display_id,
        "from": r.from_office,
        "to": r.to_office,
        "reason": r.reason,
        "status": r.status,
        "createdBy": r.created_by,
        "createdAt": r.created_at.isoformat(),
        "respondedBy": r.responded_by,
        "responseNote": r.response_note,
    }


def ping_pong_reason(case: Case, to_office: str) -> str | None:
    hops = [r for r in case.referrals if r.status != ReferralStatus.ESCALATED]
    visited = {r.from_office.casefold() for r in hops}
    if to_office.casefold() in visited:
        return f"would return the case to {to_office}, which already referred it on"
    limit = get_settings().referral_escalation_hops
    if len(hops) >= limit:
        return f"already referred {len(hops)} times (limit {limit})"
    return None


class ReferralIn(BaseModel):
    case_ref: str
    to_office: str = Field(min_length=2, max_length=120)
    reason: str = Field(min_length=10, max_length=2000)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_referral(
    body: ReferralIn, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    case = get_case_or_404(db, body.case_ref)
    to_office = body.to_office.strip()
    if to_office.casefold() == case.current_office.casefold():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Case is already at that office")
    if any(r.status == ReferralStatus.PENDING for r in case.referrals):
        raise HTTPException(status.HTTP_409_CONFLICT, "A referral is already awaiting a response")

    reason = ping_pong_reason(case, to_office)
    referral = Referral(
        case=case,
        from_office=case.current_office,
        to_office=to_office,
        reason=body.reason.strip(),
        created_by=actor,
        status=ReferralStatus.ESCALATED if reason else ReferralStatus.PENDING,
    )
    db.add(referral)
    db.flush()
    if reason:
        case.add_flag("jurisdictionEscalation")
        case.add_flag("escalated")
        record_audit(
            db,
            actor=actor,
            action=AuditAction.REFERRAL_ESCALATED,
            entity_type="case",
            entity_id=case.id,
            details={"referralId": referral.id, "to": to_office, "why": reason},
        )
    else:
        case.status = CaseStatus.REFERRED
        record_audit(
            db,
            actor=actor,
            action=AuditAction.REFERRAL_CREATED,
            entity_type="case",
            entity_id=case.id,
            details={"referralId": referral.id, "from": referral.from_office, "to": to_office},
            justification=referral.reason,
        )
    db.commit()
    return {**referral_view(referral), "escalated": reason is not None, "escalationReason": reason}


class RespondIn(BaseModel):
    accept: bool
    note: str | None = Field(default=None, max_length=2000)


@router.post("/{referral_id}/respond")
def respond(
    referral_id: int,
    body: RespondIn,
    db: Session = Depends(get_db),
    actor: str = Depends(current_actor),
) -> dict[str, Any]:
    referral = db.get(Referral, referral_id)
    if referral is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such referral")
    if referral.status != ReferralStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Referral is {referral.status}")
    if not body.accept and not (body.note and body.note.strip()):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Say why the case is returned")

    case = referral.case
    referral.status = ReferralStatus.ACCEPTED if body.accept else ReferralStatus.RETURNED
    referral.responded_by = actor
    referral.responded_at = utcnow()
    referral.response_note = body.note
    if body.accept:
        case.current_office = referral.to_office
        case.remove_flag("jurisdictionEscalation")
    else:
        returned = sum(1 for r in case.referrals if r.status == ReferralStatus.RETURNED)
        # Sent back as often as the ping-pong limit: someone above district level must decide.
        if returned >= get_settings().referral_escalation_hops and "escalated" not in case.flags:
            case.add_flag("jurisdictionEscalation")
    case.status = CaseStatus.ACTIVE if case.case_number else CaseStatus.APPLICATION
    record_audit(
        db,
        actor=actor,
        action=AuditAction.REFERRAL_RESPONDED,
        entity_type="case",
        entity_id=case.id,
        details={"referralId": referral.id, "accepted": body.accept},
        justification=body.note,
    )
    db.commit()
    return referral_view(referral)


@router.get("/escalated")
def escalated(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(Referral).where(Referral.status == ReferralStatus.ESCALATED).order_by(Referral.id)
    )
    return [referral_view(r) for r in rows]


@router.get("/case/{ref}")
def case_referrals(ref: str, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    return [referral_view(r) for r in get_case_or_404(db, ref).referrals]
