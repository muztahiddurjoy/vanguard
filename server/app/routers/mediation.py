"""Online dispute resolution: scheduling, attendance, settlement drafts (T7) and e-signatures (T11).

Scheduling a session sends each party an SMS notice with its own notice number
and the helpline's; the officer then records who came, and a party who keeps
missing sessions is looked for through their Union Digital Centre
(``services.mediation``).

Lifecycle of a settlement document:

1. ``POST /mediation/cases/{ref}/settlement-draft`` - T7 drafts it (status processed).
2. ``PUT /mediation/documents/{id}`` - the officer edits the text.
3. ``POST /mediation/documents/{id}/approve`` - text is frozen; its SHA-256 is final.
4. ``POST /mediation/signatures`` - each party's device signs
   ``signing_message(document_id, sha256)`` with Ed25519 (see services.crypto).
   When every required signer has signed, the document is executed.
"""

from datetime import datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import AwareDatetime, BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.t7_settlement import run_settlement_draft
from app.config import get_settings
from app.database import as_utc, get_db, utcnow
from app.models import (
    Attendance,
    AuditAction,
    Case,
    CaseStatus,
    Document,
    DocumentKind,
    DocumentStatus,
    MediationMode,
    MediationSession,
    MediationStatus,
    Party,
    PartyRole,
    SafetyLevel,
    Signature,
    UdcNotice,
    UdcNoticeStatus,
    record_audit,
)
from app.routers import current_actor, require_api_token
from app.routers.dlao import JustificationIn, get_case_or_404
from app.services import crypto, mediation, safe_contact

router = APIRouter(
    prefix="/mediation", tags=["mediation"], dependencies=[Depends(require_api_token)]
)


# --- scheduling ---------------------------------------------------------------


def fits_safe_window(party: Party, start: datetime, minutes: int) -> bool:
    """For restricted parties the whole session must sit inside one safe window."""
    if party.safety_level != SafetyLevel.RESTRICTED:
        return True
    tz = get_settings().tz
    local_start = start.astimezone(tz)
    local_end = (start + timedelta(minutes=minutes)).astimezone(tz)
    for window in safe_contact.party_windows(party):
        if safe_contact.is_within_window(local_start, window):
            window_end = local_start.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(
                hours=window.end_hour
            )
            if local_end <= window_end:
                return True
    return False


class SessionIn(BaseModel):
    case_ref: str
    scheduled_for: AwareDatetime
    duration_minutes: int = Field(default=60, ge=15, le=240)
    mode: MediationMode
    meeting_url: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=2000)
    # SMS notices to both parties (services.mediation). notify_applicant is the older
    # name for it: either one asks for the notices.
    notify_parties: bool = True
    notify_applicant: bool = False


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
def schedule_session(
    body: SessionIn, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    case = get_case_or_404(db, body.case_ref)
    applicant = case.applicant
    remote = body.mode in (MediationMode.ODR_PHONE, MediationMode.ODR_VIDEO)
    if (
        applicant
        and remote
        and not fits_safe_window(applicant, body.scheduled_for, body.duration_minutes)
    ):
        windows = applicant.safe_contact_windows or []
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "Session must fall inside the applicant's safe contact window",
                "windows": windows,
            },
        )
    session = MediationSession(
        case_id=case.id,
        # In UTC: SQLite keeps the wall time and drops the offset.
        scheduled_for=as_utc(body.scheduled_for),
        duration_minutes=body.duration_minutes,
        mode=body.mode,
        meeting_url=body.meeting_url,
        notes=body.notes,
        created_by=actor,
    )
    db.add(session)
    case.status = CaseStatus.IN_MEDIATION
    db.flush()
    record_audit(
        db,
        actor=actor,
        action=AuditAction.MEDIATION_SCHEDULED,
        entity_type="case",
        entity_id=case.id,
        details={"sessionId": session.id, "at": body.scheduled_for.isoformat(), "mode": body.mode},
    )
    if body.notify_parties or body.notify_applicant:
        mediation.send_session_notices(db, case, session, actor)
    # Someone who has missed too many in a row is told of this one by their UDC too.
    mediation.ask_udcs(db, case, session, mediation.missed_in_a_row(db, case), actor)
    db.commit()
    return mediation.session_view(db, session)


def sessions_of(db: Session, case: Case) -> list[MediationSession]:
    return list(
        db.scalars(
            select(MediationSession)
            .where(MediationSession.case_id == case.id)
            .order_by(MediationSession.scheduled_for, MediationSession.id)
        )
    )


@router.get("/sessions")
def list_sessions(case_ref: str, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    case = get_case_or_404(db, case_ref)
    return mediation.session_views(db, sessions_of(db, case))


@router.get("/cases/{ref}")
def case_mediation(ref: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Sessions (soonest first), UDC notices (newest first) and who keeps missing sessions."""
    case = get_case_or_404(db, ref)
    udc_notices = db.scalars(
        select(UdcNotice)
        .where(UdcNotice.case_id == case.id)
        .order_by(UdcNotice.created_at.desc(), UdcNotice.id.desc())
    )
    return {
        "sessions": mediation.session_views(db, sessions_of(db, case)),
        "udcNotices": [mediation.udc_notice_view(db, n) for n in udc_notices],
        "missedInARow": mediation.missed_in_a_row(db, case),
        "noShowLimit": get_settings().mediation_no_show_limit,
    }


class SessionStatusIn(BaseModel):
    status: Literal["held", "cancelled"]
    notes: str | None = Field(default=None, max_length=2000)


def get_session_or_404(db: Session, session_id: int) -> MediationSession:
    session = db.get(MediationSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such session")
    return session


@router.post("/sessions/{session_id}/status")
def update_session_status(
    session_id: int, body: SessionStatusIn, db: Session = Depends(get_db)
) -> dict[str, Any]:
    session = get_session_or_404(db, session_id)
    session.status = MediationStatus(body.status)
    if body.notes:
        session.notes = body.notes
    db.flush()
    # A cancelled session's attendance no longer counts towards missing too many.
    case = db.get(Case, session.case_id)
    assert case is not None
    mediation.refresh_no_show(db, case)
    db.commit()
    return mediation.session_view(db, session)


class AttendanceIn(BaseModel):
    applicant: Attendance
    respondent: Attendance
    notes: str | None = Field(default=None, max_length=2000)


@router.post("/sessions/{session_id}/attendance")
def record_attendance(
    session_id: int,
    body: AttendanceIn,
    db: Session = Depends(get_db),
    actor: str = Depends(current_actor),
) -> dict[str, Any]:
    """Who came. Recording it again replaces it; both present means it was held."""
    session = get_session_or_404(db, session_id)
    if session.status == MediationStatus.CANCELLED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This session was cancelled")
    if as_utc(session.scheduled_for) > utcnow():
        raise HTTPException(status.HTTP_409_CONFLICT, "This session has not started yet")
    case = db.get(Case, session.case_id)
    assert case is not None
    came = {"applicant": body.applicant, "respondent": body.respondent}
    mediation.record_attendance(db, case, session, came, actor)
    if body.notes:
        session.notes = body.notes
    db.commit()
    return mediation.session_view(db, session)


@router.post("/udc-notices/{notice_id}/release")
def release_udc_notice(
    notice_id: int,
    body: JustificationIn,
    db: Session = Depends(get_db),
    actor: str = Depends(current_actor),
) -> dict[str, Any]:
    """Ask the UDC after all, on the officer's judgement that it is safe."""
    notice = db.get(UdcNotice, notice_id)
    if notice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such UDC notice")
    if notice.status != UdcNoticeStatus.HELD:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a held notice can be released")
    mediation.release_udc_notice(db, notice, actor, body.justification)
    db.commit()
    return mediation.udc_notice_view(db, notice)


# --- settlement drafts (T7) -------------------------------------------------------


def document_view(doc: Document) -> dict[str, Any]:
    return {
        "id": doc.id,
        "caseId": doc.case_id,
        "kind": doc.kind,
        "status": doc.status,
        "content": doc.content,
        "sha256": doc.sha256,
        "requiredSigners": doc.required_signers,
        "signatures": [
            {
                "partyId": s.party_id,
                "keyFingerprint": s.key_fingerprint,
                "signedAt": as_utc(s.signed_at).isoformat(),
            }
            for s in doc.signatures
        ],
        "signingMessage": (
            crypto.signing_message(doc.id, doc.sha256).decode()
            if doc.sha256 and doc.status in (DocumentStatus.APPROVED, DocumentStatus.EXECUTED)
            else None
        ),
    }


def risk_flags_of(case: Case) -> list[str]:
    factors = (case.triage or {}).get("factors", [])
    return [f["key"] for f in factors if f.get("detected")]


class DraftIn(BaseModel):
    terms: list[str] = Field(min_length=1, max_length=30)
    language: Literal["bn", "en"] = "bn"
    session_id: int | None = None
    # Required to draft when violence is on record; the justification is audited.
    acknowledge_risk: bool = False
    justification: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _justified(self) -> "DraftIn":
        if self.acknowledge_risk and len((self.justification or "").strip()) < 20:
            raise ValueError("acknowledge_risk needs a justification of at least 20 characters")
        return self


@router.post("/cases/{ref}/settlement-draft", status_code=status.HTTP_201_CREATED)
def draft_settlement(
    ref: str, body: DraftIn, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    case = get_case_or_404(db, ref)
    signers = [cp for cp in case.parties if cp.role in (PartyRole.APPLICANT, PartyRole.RESPONDENT)]
    out = run_settlement_draft(
        case_ref=case.display_id,
        parties=[{"id": cp.party_id, "name": cp.party.name, "role": cp.role} for cp in signers],
        terms=body.terms,
        office=case.current_office,
        language=body.language,
        category=case.category,
        risk_flags=risk_flags_of(case),
        risk_acknowledged=body.acknowledge_risk,
    )
    if not out.get("ready_for_review"):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, {"issues": out.get("issues", [])}
        )

    draft = out["draft"]
    doc = Document(
        case_id=case.id,
        kind=DocumentKind.SETTLEMENT_DRAFT,
        status=DocumentStatus.PROCESSED,
        content=draft,
        sha256=crypto.sha256_hex(draft),
        required_signers=[cp.party_id for cp in signers],
        uploaded_by=actor,
    )
    db.add(doc)
    db.flush()
    if body.session_id:
        session = db.get(MediationSession, body.session_id)
        if session is None or session.case_id != case.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No such session for this case")
        session.settlement_document_id = doc.id
    record_audit(
        db,
        actor=actor,
        action=AuditAction.SETTLEMENT_DRAFTED,
        entity_type="case",
        entity_id=case.id,
        details={
            "documentId": doc.id,
            "source": out.get("draft_source"),
            "riskAcknowledged": body.acknowledge_risk,
        },
        justification=body.justification if body.acknowledge_risk else None,
    )
    db.commit()
    return document_view(doc)


def get_settlement_or_404(db: Session, document_id: int) -> Document:
    doc = db.get(Document, document_id)
    if doc is None or doc.kind != DocumentKind.SETTLEMENT_DRAFT:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such settlement document")
    return doc


@router.get("/documents/{document_id}")
def get_document(document_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    return document_view(get_settlement_or_404(db, document_id))


class EditIn(BaseModel):
    content: str = Field(min_length=20, max_length=50_000)


@router.put("/documents/{document_id}")
def edit_document(document_id: int, body: EditIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    doc = get_settlement_or_404(db, document_id)
    if doc.status != DocumentStatus.PROCESSED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Approved documents cannot be edited")
    doc.content = body.content
    doc.sha256 = crypto.sha256_hex(body.content)
    db.commit()
    return document_view(doc)


@router.post("/documents/{document_id}/approve")
def approve_document(
    document_id: int, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    doc = get_settlement_or_404(db, document_id)
    if doc.status != DocumentStatus.PROCESSED:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Document is {doc.status}")
    doc.status = DocumentStatus.APPROVED
    record_audit(
        db,
        actor=actor,
        action=AuditAction.SETTLEMENT_APPROVED,
        entity_type="case",
        entity_id=doc.case_id,
        details={"documentId": doc.id, "sha256": doc.sha256},
    )
    db.commit()
    return document_view(doc)


# --- T11 signatures ---------------------------------------------------------------


class SignatureIn(BaseModel):
    document_id: int
    party_id: int
    public_key: str = Field(min_length=40, max_length=100, description="Raw Ed25519 key, base64")
    signature: str = Field(min_length=80, max_length=200, description="Ed25519 signature, base64")
    signed_sha256: str = Field(pattern="^[0-9a-f]{64}$")
    device_id: str | None = Field(default=None, max_length=100)


def apply_signature(db: Session, body: SignatureIn, actor: str) -> Document:
    """Verify and record one T11 signature. Caller commits."""
    doc = get_settlement_or_404(db, body.document_id)
    if doc.status != DocumentStatus.APPROVED:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Document is {doc.status}, not open for signing"
        )
    if body.party_id not in doc.required_signers:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This party is not a signer of the document")
    if body.signed_sha256 != doc.sha256:
        raise HTTPException(status.HTTP_409_CONFLICT, "Signed a different version of the document")
    if any(s.party_id == body.party_id for s in doc.signatures):
        raise HTTPException(status.HTTP_409_CONFLICT, "This party has already signed")
    assert doc.sha256 is not None
    message = crypto.signing_message(doc.id, doc.sha256)
    if not crypto.verify_ed25519(body.public_key, body.signature, message):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Signature does not verify")

    fingerprint = crypto.public_key_fingerprint(body.public_key)
    doc.signatures.append(
        Signature(
            party_id=body.party_id,
            public_key=body.public_key,
            key_fingerprint=fingerprint,
            signature=body.signature,
            signed_sha256=doc.sha256,
            device_id=body.device_id,
        )
    )
    signed = {s.party_id for s in doc.signatures}
    if set(doc.required_signers) <= signed:
        doc.status = DocumentStatus.EXECUTED
    record_audit(
        db,
        actor=actor,
        action=AuditAction.SIGNATURE_RECORDED,
        entity_type="case",
        entity_id=doc.case_id,
        details={
            "documentId": doc.id,
            "partyId": body.party_id,
            "keyFingerprint": fingerprint,
            "sha256": doc.sha256,
            "executed": doc.status == DocumentStatus.EXECUTED,
        },
    )
    return doc


@router.post("/signatures", status_code=status.HTTP_201_CREATED)
def receive_signature(
    body: SignatureIn, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    doc = apply_signature(db, body, actor)
    db.commit()
    return document_view(doc)
