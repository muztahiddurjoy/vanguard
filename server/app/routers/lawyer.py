"""Panel lawyer API: a lawyer's own cases, and the court progress they report.

Used by lawyer-dashboard. A lawyer sees only the cases assigned to them, and only
what representing the applicant needs: no call notes, audit trail or duplicate
reviews, and no phone number while the applicant must not be called. Each update
they post resets their reporting clock, clears the case's inactivity alert (T1)
and appears on the DLAO dashboard.

Sign-in is owned by the dashboard, as it is for officers: requests name the
lawyer in ``X-Lawyer-Id``, which must be on the panel (``services.panel``).
"""

import base64
import binascii
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import as_utc, get_db, utcnow
from app.models import (
    AuditAction,
    AuditEntry,
    Case,
    CaseStatus,
    CourtStage,
    DocumentKind,
    LawyerUpdate,
    PartyRole,
    SafetyLevel,
    record_audit,
)
from app.routers import require_api_token
from app.routers.dlao import OPEN_STATUSES, get_case_or_404
from app.services.court_progress import (
    latest_stage,
    missed_updates,
    next_hearing,
    next_hearing_view,
    update_due_at,
    update_view,
)
from app.services.panel import PanelLawyer, get_lawyer
from app.services.uploads import MAX_UPLOAD_BYTES, save_upload

router = APIRouter(prefix="/lawyer", tags=["lawyer"], dependencies=[Depends(require_api_token)])


def current_lawyer(x_lawyer_id: str | None = Header(default=None)) -> PanelLawyer:
    lawyer = get_lawyer(x_lawyer_id or "")
    if lawyer is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Sign in with a panel lawyer ID (X-Lawyer-Id)"
        )
    return lawyer


def own_case(db: Session, ref: str, lawyer: PanelLawyer) -> Case:
    case = get_case_or_404(db, ref)
    if case.lawyer_id != lawyer.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This case is not assigned to you")
    return case


def lawyer_case_view(case: Case, now: datetime) -> dict[str, Any]:
    """What the assigned lawyer needs to represent the applicant, and nothing else."""
    applicant = case.applicant
    respondent_link = next((cp for cp in case.parties if cp.role == PartyRole.RESPONDENT), None)
    # The same rule as every call from the office: no number to dial when nobody may call.
    no_contact = case.do_not_call_reason is not None or (
        applicant is not None and applicant.safety_level == SafetyLevel.NO_CONTACT
    )
    due = update_due_at(case)
    missed = missed_updates(case, now)
    return {
        "id": case.display_id,
        "applicationId": case.application_id,
        "caseNumber": case.case_number,
        "status": case.status,
        "category": case.category,
        "priority": case.priority,
        "track": case.track,
        "sensitive": "sensitive" in (case.flags or []),
        "summary": case.summary,
        "summaryBn": case.summary_bn,
        "receivedAt": as_utc(case.received_at).isoformat(),
        "client": (
            {
                "name": applicant.name,
                "nameBn": applicant.name_bn,
                "age": applicant.age,
                "village": applicant.village,
                "upazila": applicant.upazila,
                "district": applicant.district,
                "phone": None if no_contact else applicant.phone,
                "safetyLevel": applicant.safety_level,
                "safeContactWindows": applicant.safe_contact_windows,
            }
            if applicant
            else None
        ),
        "doNotCall": {"reason": case.do_not_call_reason} if case.do_not_call_reason else None,
        "respondent": (
            {
                "name": respondent_link.party.name,
                "nameBn": respondent_link.party.name_bn,
                "relation": respondent_link.relation,
            }
            if respondent_link
            else None
        ),
        "lastUpdateAt": (
            as_utc(case.lawyer_last_update_at).isoformat() if case.lawyer_last_update_at else None
        ),
        "updateDueAt": due.isoformat() if due else None,
        "missedUpdates": missed,
        "nextHearing": next_hearing_view(case),
        "courtStage": latest_stage(case),
        "updates": [update_view(u) for u in case.lawyer_updates],
    }


def by_attention(view: dict[str, Any]) -> tuple[int, str, str]:
    """Late reports first, then the soonest hearing, then the case reference."""
    hearing = (view["nextHearing"] or {}).get("at") or "9999"
    return (0 if view["missedUpdates"] else 1, hearing, view["id"])


@router.get("/me")
def me(lawyer: PanelLawyer = Depends(current_lawyer)) -> dict[str, Any]:
    return lawyer.view()


@router.get("/cases")
def my_cases(
    db: Session = Depends(get_db), lawyer: PanelLawyer = Depends(current_lawyer)
) -> list[dict[str, Any]]:
    now = utcnow()
    cases = db.scalars(
        select(Case).where(Case.lawyer_id == lawyer.id, Case.status.in_(OPEN_STATUSES))
    )
    return sorted((lawyer_case_view(c, now) for c in cases), key=by_attention)


@router.get("/cases/{ref}")
def my_case(
    ref: str, db: Session = Depends(get_db), lawyer: PanelLawyer = Depends(current_lawyer)
) -> dict[str, Any]:
    case = own_case(db, ref, lawyer)
    record_audit(
        db, actor=lawyer.id, action=AuditAction.CASE_VIEWED, entity_type="case", entity_id=case.id
    )
    db.commit()
    view = lawyer_case_view(case, utcnow())
    # Reminders the office sent this lawyer, so they know the office is waiting.
    view["reminders"] = [
        as_utc(at).isoformat()
        for at, details in db.execute(
            select(AuditEntry.occurred_at, AuditEntry.details)
            .where(
                AuditEntry.entity_type == "case",
                AuditEntry.entity_id == str(case.id),
                AuditEntry.action == AuditAction.LAWYER_REMINDED,
            )
            .order_by(AuditEntry.seq)
        )
        if (details or {}).get("lawyerId") == lawyer.id
    ]
    return view


class AttachmentIn(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=100)
    # Base64 of at most MAX_UPLOAD_BYTES (checked again once decoded).
    data_b64: str = Field(min_length=1, max_length=(MAX_UPLOAD_BYTES * 4) // 3 + 4)


class UpdateIn(BaseModel):
    stage: CourtStage
    summary: str = Field(min_length=20, max_length=2000)
    court: str | None = Field(default=None, max_length=200)
    # The hearing this update reports on, if one was held.
    hearing_held_on: date | None = None
    # The next date the court fixed. A date without a time zone is office time.
    next_hearing_at: datetime | None = None
    # The order sheet or certified copy.
    attachment: AttachmentIn | None = None

    @field_validator("summary", "court")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


@router.post("/cases/{ref}/updates", status_code=status.HTTP_201_CREATED)
def post_update(
    ref: str,
    body: UpdateIn,
    db: Session = Depends(get_db),
    lawyer: PanelLawyer = Depends(current_lawyer),
) -> dict[str, Any]:
    """Report progress from court: what happened, and the next date the court fixed."""
    case = own_case(db, ref, lawyer)
    if case.status == CaseStatus.CLOSED:
        raise HTTPException(status.HTTP_409_CONFLICT, "The case is closed")
    if len(body.summary or "") < 20:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Say what happened in at least 20 characters"
        )
    now = utcnow()
    tz = get_settings().tz
    if body.hearing_held_on and body.hearing_held_on > now.astimezone(tz).date():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "The hearing date cannot be in the future"
        )
    next_at = body.next_hearing_at
    if next_at is not None:
        next_at = as_utc(next_at if next_at.tzinfo else next_at.replace(tzinfo=tz))
        if body.stage == CourtStage.JUDGMENT:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "A judgment has no next hearing date"
            )
        if next_at <= now:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "The next hearing must be in the future"
            )

    document = None
    if body.attachment is not None:
        try:
            data = base64.b64decode(body.attachment.data_b64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "The attachment is not valid base64"
            ) from exc
        document = save_upload(
            db,
            case,
            data=data,
            filename=body.attachment.filename,
            content_type=body.attachment.content_type,
            kind=DocumentKind.COURT_ORDER,
            actor=lawyer.id,
        )
        record_audit(
            db,
            actor=lawyer.id,
            action=AuditAction.DOCUMENT_UPLOADED,
            entity_type="case",
            entity_id=case.id,
            details={"documentId": document.id, "kind": document.kind, "sha256": document.sha256},
        )

    update = LawyerUpdate(
        case=case,
        lawyer_id=lawyer.id,
        stage=body.stage,
        summary=body.summary,
        court=body.court or None,
        hearing_held_on=body.hearing_held_on,
        next_hearing_at=next_at,
        document_id=document.id if document else None,
        document=document,
        submitted_at=now,
    )
    db.add(update)
    db.flush()
    case.lawyer_last_update_at = now
    case.remove_flag("lawyerInactivity")
    found = next_hearing(case)
    record_audit(
        db,
        actor=lawyer.id,
        action=AuditAction.LAWYER_UPDATE,
        entity_type="case",
        entity_id=case.id,
        details={
            "updateId": update.id,
            "lawyerId": lawyer.id,
            "stage": body.stage,
            "nextHearingAt": found[0].isoformat() if found else None,
            **({"documentId": document.id} if document else {}),
        },
    )
    db.commit()
    return lawyer_case_view(case, now)
