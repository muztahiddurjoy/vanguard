"""DLAO dashboard API: work queues, case detail, T1 alerts and officer decisions.

Responses use the dashboard's field names (camelCase, ``LegalCase`` shape) so
the React app can swap its sample data for these endpoints.
"""

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.agents.t8_triage import run_triage
from app.config import get_settings
from app.database import as_utc, get_db, utcnow
from app.models import (
    AuditAction,
    AuditEntry,
    Case,
    CaseOutcome,
    CaseStatus,
    ChecklistItem,
    Document,
    DoNotCallReason,
    PartyRole,
    Priority,
    ReferralStatus,
    SafetyLevel,
    Track,
    TrackStatus,
    TriageStatus,
    format_token,
    next_reference,
    record_audit,
    verify_chain,
)
from app.models.case import PRIORITY_RANK
from app.routers import current_actor, require_api_token
from app.services import notices, safe_contact
from app.services.court_progress import (
    latest_stage,
    missed_updates,
    next_hearing_view,
    reminded_at,
    update_due_at,
    update_view,
    waiting_after_reminder,
)
from app.services.panel import get_lawyer

router = APIRouter(prefix="/dlao", tags=["dlao"], dependencies=[Depends(require_api_token)])

# How soon an officer should act on a new case, by priority.
RESPONSE_HOURS = {Priority.CRITICAL: 4, Priority.HIGH: 24, Priority.MEDIUM: 72, Priority.LOW: 168}
QUEUE_KEYS = ("actionToday", "pendingTriage", "duplicates", "alerts")
OPEN_STATUSES = (
    CaseStatus.APPLICATION,
    CaseStatus.ACTIVE,
    CaseStatus.REFERRED,
    CaseStatus.IN_MEDIATION,
)


# --- helpers shared with other routers ---------------------------------------


def get_case_or_404(db: Session, ref: str) -> Case:
    """Look a case up by APP- or DLAS- reference (or numeric id)."""
    query = select(Case).where(or_(Case.application_id == ref, Case.case_number == ref))
    if ref.isdigit():
        query = select(Case).where(Case.id == int(ref))
    case = db.scalars(query).first()
    if case is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No case {ref}")
    return case


def due_at_for(priority: str, received_at: datetime) -> datetime:
    return as_utc(received_at) + timedelta(hours=RESPONSE_HOURS[Priority(priority)])


def mask_phone(phone: str | None) -> str | None:
    return f"{phone[:5]}-XXX-{phone[-3:]}" if phone and len(phone) == 11 else phone


def live_flags(case: Case, now: datetime) -> list[str]:
    """Stored flags plus the ones that depend on the clock (T1)."""
    flags = list(case.flags or [])
    is_open = case.status in OPEN_STATUSES
    if is_open and case.due_at and as_utc(case.due_at) < now and "overdue" not in flags:
        flags.append("overdue")
    # Fortnightly reports, and one within days of every hearing (services.court_progress).
    if is_open and missed_updates(case, now) > 0 and "lawyerInactivity" not in flags:
        flags.append("lawyerInactivity")
    return flags


def queues_for(case: Case, flags: list[str], now: datetime) -> list[str]:
    if case.status not in OPEN_STATUSES:
        return []
    queues = []
    end_of_day = now.astimezone(get_settings().tz).replace(hour=23, minute=59, second=59)
    urgent = case.priority in (Priority.CRITICAL, Priority.HIGH)
    due_today = case.due_at is not None and as_utc(case.due_at) <= end_of_day
    if urgent or due_today:
        queues.append("actionToday")
    if case.triage and case.triage_status == TriageStatus.PENDING:
        queues.append("pendingTriage")
    # Set when T4 queues a review, cleared once no review for its parties is pending.
    if "possibleDuplicate" in flags:
        queues.append("duplicates")
    # A late lawyer who was just reminded is waiting on the lawyer, not the officer.
    late_lawyer = "lawyerInactivity" in flags and not waiting_after_reminder(case, now)
    if {"overdue", "jurisdictionEscalation"} & set(flags) or late_lawyer:
        queues.append("alerts")
    return queues


def party_view(party: Any, *, full_phone: bool) -> dict[str, Any]:
    view = {
        "id": party.id,
        "name": party.name,
        "nameBn": party.name_bn,
        "phone": party.phone if full_phone else mask_phone(party.phone),
        "village": party.village,
        "upazila": party.upazila,
        "district": party.district,
        "guardian": party.guardian_name,
        "nidMasked": party.nid_masked,
        "nidVerified": party.nid_verified,
        "age": party.age,
        "safetyLevel": party.safety_level,
        "provenance": party.provenance,
        "accessibility": party.accessibility_flags,
        "safeContactWindows": party.safe_contact_windows,
    }
    if full_phone:  # case detail only, which is access-logged
        view["motherName"] = party.mother_name
        view["dateOfBirth"] = party.date_of_birth.isoformat() if party.date_of_birth else None
    return view


def lawyer_view(case: Case, now: datetime) -> dict[str, Any]:
    due = update_due_at(case)
    return {
        "id": case.lawyer_id,
        "lastUpdateAt": (
            as_utc(case.lawyer_last_update_at).isoformat() if case.lawyer_last_update_at else None
        ),
        "missedUpdates": missed_updates(case, now),
        "updateDueAt": due.isoformat() if due else None,
        "remindedAt": reminded.isoformat() if (reminded := reminded_at(case)) else None,
    }


def track_view(case: Case) -> dict[str, Any] | None:
    if case.track is None:
        return None
    suggestion = (case.triage or {}).get("track") or {}
    return {
        "key": case.track,
        "status": case.track_status,
        # The AI's reason explains its own mark; after an officer's change it is history.
        "aiKey": suggestion.get("key"),
        "reason": suggestion.get("reason"),
    }


# How a verified caller was confirmed (see t5_intake), as the dashboard names it.
VERIFIED_BY = {"answers": "answers", "sim": "sim", "sim_family": "simFamily"}


def identity_view(case: Case) -> dict[str, Any]:
    """Whose identity was confirmed against the NID registry, and how the case was filed."""
    recorded = dict((case.intake_data or {}).get("identity") or {})
    applicant = case.applicant
    verified = recorded.get("caller") == "verified"
    return {
        "filingFor": recorded.get(
            "filingFor", "other" if case.party_with_role(PartyRole.PROXY) else "self"
        ),
        "applicantVerified": bool(applicant and applicant.nid_verified),
        "callerVerified": verified,
        # Applications from before this was recorded were all confirmed by answers.
        "callerVerifiedBy": (
            VERIFIED_BY.get(recorded.get("callerVerifiedBy") or "answers") if verified else None
        ),
        "callerSimRegistered": bool(recorded.get("callerSimRegistered")),
    }


def case_view(
    case: Case,
    *,
    now: datetime | None = None,
    full_phone: bool = False,
) -> dict[str, Any]:
    now = now or utcnow()
    flags = live_flags(case, now)
    applicant = case.applicant
    proxy_link = next((cp for cp in case.parties if cp.role == PartyRole.PROXY), None)
    respondent_link = next((cp for cp in case.parties if cp.role == PartyRole.RESPONDENT), None)
    return {
        "id": case.display_id,
        "applicationId": case.application_id,
        "caseNumber": case.case_number,
        "status": case.status,
        "outcome": case.outcome,
        "category": case.category,
        "priority": case.priority,
        "priorityChanged": case.triage_status == TriageStatus.OVERRIDDEN,
        "queues": queues_for(case, flags, now),
        "flags": flags,
        "channel": case.channel,
        "summary": case.summary,
        "summaryBn": case.summary_bn,
        "receivedAt": as_utc(case.received_at).isoformat(),
        "dueAt": as_utc(case.due_at).isoformat() if case.due_at else None,
        "currentOffice": case.current_office,
        "district": case.district,
        "applicant": party_view(applicant, full_phone=full_phone) if applicant else None,
        "proxy": (
            {
                "name": proxy_link.party.name,
                "nameBn": proxy_link.party.name_bn,
                "relation": proxy_link.relation,
                "nidVerified": proxy_link.party.nid_verified,
            }
            if proxy_link
            else None
        ),
        "respondent": (
            {
                "name": respondent_link.party.name,
                "nameBn": respondent_link.party.name_bn,
                "relation": respondent_link.relation,
                "nidVerified": respondent_link.party.nid_verified,
                "registeredSims": len(respondent_link.party.registered_phones or []),
            }
            if respondent_link
            else None
        ),
        "trackingToken": format_token(case.tracking_token) if case.tracking_token else None,
        "track": track_view(case),
        "doNotCall": {"reason": case.do_not_call_reason} if case.do_not_call_reason else None,
        "identity": identity_view(case),
        "notices": case.notices or {},
        "lawyer": lawyer_view(case, now) if case.lawyer_id else None,
        "nextHearing": next_hearing_view(case),
        "courtStage": latest_stage(case),
        "triage": ({**case.triage, "status": case.triage_status} if case.triage else None),
        # T2: how often another office sent the case back.
        "timesReturned": times_returned(case),
        "incidentId": case.incident_id,
    }


def times_returned(case: Case) -> int:
    return sum(1 for r in case.referrals if r.status == ReferralStatus.RETURNED)


def by_urgency(view: dict[str, Any]) -> tuple[int, str, float]:
    """Priority, then earliest deadline, then newest (as the dashboard sorts)."""
    rank = PRIORITY_RANK.get(view["priority"], 9) if view["priority"] else 9
    due = view["dueAt"] or "9999"
    return rank, due, -datetime.fromisoformat(view["receivedAt"]).timestamp()


# Safety levels from least to most protective; triage only ever moves a party up.
SAFETY_RANK = {
    SafetyLevel.STANDARD: 0,
    SafetyLevel.CAUTION: 1,
    SafetyLevel.RESTRICTED: 2,
    SafetyLevel.NO_CONTACT: 3,
}


def raise_safety(party: Any, level: SafetyLevel) -> bool:
    """Make ``party`` at least as protected as ``level``; True if it changed."""
    if SAFETY_RANK[SafetyLevel(party.safety_level)] >= SAFETY_RANK[level]:
        return False
    party.safety_level = level
    return True


def mark_do_not_call(db: Session, case: Case, reason: DoNotCallReason, actor: str) -> None:
    """Block every call and SMS to the applicant and show why on the dashboard."""
    if case.do_not_call_reason is not None:
        return
    case.do_not_call_reason = reason
    case.add_flag("doNotCall")
    if case.applicant is not None:
        raise_safety(case.applicant, SafetyLevel.NO_CONTACT)
    record_audit(
        db,
        actor=actor,
        action=AuditAction.SAFETY_CHANGED,
        entity_type="case",
        entity_id=case.id,
        details={"level": SafetyLevel.NO_CONTACT, "reason": reason},
    )


def apply_triage(db: Session, case: Case, actor: str) -> None:
    """Run T8 on the case narrative and store the recommendation."""
    applicant = case.applicant
    hearing = case.intake_data.get("next_hearing_date")
    days = None
    if hearing:
        days = (datetime.fromisoformat(hearing).date() - utcnow().date()).days
    rec = run_triage(
        case.summary,
        channel=case.channel,
        district=case.district,
        office_district=case.current_office,
        is_proxy=case.party_with_role(PartyRole.PROXY) is not None,
        safety_level=str(applicant.safety_level) if applicant else "standard",
        next_hearing_days=days,
        has_respondent=case.party_with_role(PartyRole.RESPONDENT) is not None,
    )
    case.triage = rec
    case.triage_status = TriageStatus.PENDING
    if rec.get("category") and not case.category:
        case.category = rec["category"]
    if case.priority is None:
        # Until an officer decides, the AI suggestion drives the queue order.
        case.priority = rec["priority"]
        case.due_at = due_at_for(rec["priority"], case.received_at)
    detected = {f["key"] for f in rec["factors"] if f["detected"]}
    if "proxyReported" in detected:
        case.add_flag("proxyReported")
    if "safeContactRestricted" in detected:
        case.add_flag("restrictedContact")
    if "outOfJurisdiction" in detected:
        case.add_flag("jurisdictionEscalation")
    if applicant and rec.get("recommendedSafetyLevel") == SafetyLevel.RESTRICTED:
        raise_safety(applicant, SafetyLevel.RESTRICTED)
    # An officer's confirmed or changed track stands; a fresh AI mark replaces only a mark.
    if case.track_status == TrackStatus.SUGGESTED:
        case.track = Track(rec["track"]["key"])
    if case.track == Track.SENSITIVE:
        case.add_flag("sensitive")
    record_audit(
        db,
        actor=actor,
        action=AuditAction.TRIAGE_GENERATED,
        entity_type="case",
        entity_id=case.id,
        details={
            "priority": rec["priority"],
            "confidence": rec["confidence"],
            "category": rec.get("category"),
            "source": rec.get("categorySource"),
            "track": rec["track"]["key"],
        },
    )
    if "hostageSituation" in detected:
        mark_do_not_call(db, case, DoNotCallReason.HOSTAGE, actor=actor)


# --- endpoints ------------------------------------------------------------


@router.get("/queues")
def queue_counts(db: Session = Depends(get_db)) -> dict[str, int]:
    cases = db.scalars(select(Case).where(Case.status.in_(OPEN_STATUSES))).all()
    now = utcnow()
    counts = {"all": len(cases), **{k: 0 for k in QUEUE_KEYS}}
    for case in cases:
        for q in queues_for(case, live_flags(case, now), now):
            counts[q] += 1
    return counts


@router.get("/cases")
def list_cases(
    queue: str = Query("all", pattern="^(all|actionToday|pendingTriage|duplicates|alerts)$"),
    priority: Priority | None = None,
    q: str = "",
    include_closed: bool = False,
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    query = select(Case)
    if not include_closed:
        query = query.where(Case.status.in_(OPEN_STATUSES))
    if priority:
        query = query.where(Case.priority == priority)
    now = utcnow()
    needle = q.strip().casefold()
    views = []
    for case in db.scalars(query):
        view = case_view(case, now=now)
        if queue != "all" and queue not in view["queues"]:
            continue
        if needle:
            applicant = view["applicant"] or {}
            haystack = [view["id"], case.application_id, applicant.get("name") or ""]
            if not any(needle in h.casefold() for h in haystack) and not (
                applicant.get("nameBn") and q.strip() in applicant["nameBn"]
            ):
                continue
        views.append(view)
    return sorted(views, key=by_urgency)


@router.get("/cases/{ref}")
def get_case(
    ref: str, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    case = get_case_or_404(db, ref)
    # Opening a case is an access event: sensitive cases must show who looked.
    record_audit(
        db, actor=actor, action=AuditAction.CASE_VIEWED, entity_type="case", entity_id=case.id
    )
    db.commit()
    view = case_view(case, full_phone=True)
    view["activity"] = [
        {
            "at": as_utc(e.occurred_at).isoformat(),
            "actor": e.actor,
            "action": e.action,
            "details": e.details,
            "justification": e.justification,
        }
        for e in db.scalars(
            select(AuditEntry)
            .where(AuditEntry.entity_type == "case", AuditEntry.entity_id == str(case.id))
            .where(AuditEntry.action != AuditAction.CASE_VIEWED)
            .order_by(AuditEntry.seq)
        )
    ]
    # A sensitive case's file names and summaries can reveal what the files show:
    # they are given only on request, and each request is audited (evidence/view).
    view["documents"] = documents_view(db, case, withhold="sensitive" in (case.flags or []))
    receipt = db.scalars(
        select(AuditEntry)
        .where(
            AuditEntry.entity_type == "case",
            AuditEntry.entity_id == str(case.id),
            AuditEntry.action == AuditAction.EVIDENCE_ACKNOWLEDGED,
        )
        .order_by(AuditEntry.seq.desc())
    ).first()
    view["evidenceReceipt"] = (
        {"at": as_utc(receipt.occurred_at).isoformat(), "by": receipt.actor} if receipt else None
    )
    view["checklist"] = [
        {"key": i.item_key, "label": i.label, "labelBn": i.label_bn, "required": i.required,
         "status": i.status, "documentId": i.document_id}
        for i in db.scalars(select(ChecklistItem).where(ChecklistItem.case_id == case.id))
    ]  # fmt: skip
    view["callNotes"] = case.call_notes or []
    view["lawyerUpdates"] = [update_view(u) for u in case.lawyer_updates]
    view["referrals"] = [
        {
            "id": r.id,
            "at": as_utc(r.created_at).isoformat(),
            "from": r.from_office,
            "to": r.to_office,
            "status": r.status,
            "reason": r.reason,
            "respondedAt": as_utc(r.responded_at).isoformat() if r.responded_at else None,
            "responseNote": r.response_note,
        }
        for r in case.referrals
    ]
    return view


def documents_view(db: Session, case: Case, *, withhold: bool) -> list[dict[str, Any]]:
    return [
        {
            "id": d.id,
            "kind": d.kind,
            "filename": None if withhold else d.filename,
            "contentType": d.content_type,
            "sizeBytes": d.size_bytes,
            "status": d.status,
            "summary": None if withhold else d.summary,
            "withheld": withhold,
        }
        for d in db.scalars(
            select(Document).where(Document.case_id == case.id).order_by(Document.id)
        )
    ]


def evidence_acknowledged(db: Session, case: Case) -> bool:
    return (
        db.scalars(
            select(AuditEntry.id).where(
                AuditEntry.entity_type == "case",
                AuditEntry.entity_id == str(case.id),
                AuditEntry.action == AuditAction.EVIDENCE_ACKNOWLEDGED,
            )
        ).first()
        is not None
    )


@router.post("/cases/{ref}/evidence/view")
def view_evidence(
    ref: str, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    """The documents in full, for the officer allowed to see a sensitive case's evidence."""
    case = get_case_or_404(db, ref)
    documents = documents_view(db, case, withhold=False)
    record_audit(
        db,
        actor=actor,
        action=AuditAction.EVIDENCE_VIEWED,
        entity_type="case",
        entity_id=case.id,
        details={"documents": len(documents)},
    )
    db.commit()
    return {"documents": documents}


@router.post("/cases/{ref}/evidence/receipt")
def acknowledge_evidence(
    ref: str, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    """The receiving officer confirms the evidence arrived and is in their keeping (A3)."""
    case = get_case_or_404(db, ref)
    if evidence_acknowledged(db, case):
        raise HTTPException(status.HTTP_409_CONFLICT, "Receipt has already been acknowledged")
    count = db.scalars(select(Document.id).where(Document.case_id == case.id)).all()
    record_audit(
        db,
        actor=actor,
        action=AuditAction.EVIDENCE_ACKNOWLEDGED,
        entity_type="case",
        entity_id=case.id,
        details={"documents": len(count)},
    )
    db.commit()
    return case_view(case)


@router.get("/alerts")
def alerts(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    """T1: everything that needs an officer's attention, most urgent first."""
    now = utcnow()
    out: list[dict[str, Any]] = []
    for case in db.scalars(select(Case).where(Case.status.in_(OPEN_STATUSES))):
        flags = live_flags(case, now)
        base = {"caseId": case.display_id, "priority": case.priority}
        if "overdue" in flags and case.due_at:
            out.append({**base, "type": "overdue", "since": as_utc(case.due_at).isoformat()})
        if "lawyerInactivity" in flags and case.lawyer_last_update_at:
            since = as_utc(case.lawyer_last_update_at).isoformat()
            out.append(
                {**base, "type": "lawyerInactivity", "lawyerId": case.lawyer_id, "since": since}
            )
        if "jurisdictionEscalation" in flags:
            out.append({**base, "type": "jurisdictionEscalation"})
        if case.priority == Priority.CRITICAL and case.triage_status == TriageStatus.PENDING:
            out.append({**base, "type": "criticalUntriaged"})
        if any(r.status == ReferralStatus.ESCALATED for r in case.referrals):
            out.append({**base, "type": "referralEscalated"})
    return sorted(out, key=lambda a: PRIORITY_RANK.get(a["priority"], 9) if a["priority"] else 9)


class OverrideIn(BaseModel):
    priority: Priority
    justification: str = Field(min_length=20, max_length=2000)


@router.post("/cases/{ref}/triage/accept")
def accept_triage(
    ref: str, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    case = get_case_or_404(db, ref)
    if not case.triage:
        raise HTTPException(status.HTTP_409_CONFLICT, "No AI triage to accept")
    case.priority = case.triage["priority"]
    case.triage_status = TriageStatus.ACCEPTED
    case.due_at = due_at_for(case.triage["priority"], case.received_at)
    record_audit(
        db,
        actor=actor,
        action=AuditAction.TRIAGE_ACCEPTED,
        entity_type="case",
        entity_id=case.id,
        details={"priority": case.priority},
    )
    db.commit()
    return case_view(case)


@router.post("/cases/{ref}/triage/rerun")
def rerun_triage(
    ref: str, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    case = get_case_or_404(db, ref)
    apply_triage(db, case, actor)
    db.commit()
    return case_view(case)


@router.post("/cases/{ref}/priority-override")
def override_priority(
    ref: str,
    body: OverrideIn,
    db: Session = Depends(get_db),
    actor: str = Depends(current_actor),
) -> dict[str, Any]:
    case = get_case_or_404(db, ref)
    previous = case.priority
    case.priority = body.priority
    case.triage_status = TriageStatus.OVERRIDDEN
    case.due_at = due_at_for(body.priority, case.received_at)
    record_audit(
        db,
        actor=actor,
        action=AuditAction.PRIORITY_OVERRIDE,
        entity_type="case",
        entity_id=case.id,
        details={
            "from": previous,
            "to": body.priority,
            "aiRecommended": (case.triage or {}).get("priority"),
        },
        justification=body.justification.strip(),
    )
    db.commit()
    return case_view(case)


@router.post("/cases/{ref}/promote")
def promote_to_case(
    ref: str, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    """Accept an application as a legal aid case: APP-… keeps its ID and gains DLAS-…."""
    case = get_case_or_404(db, ref)
    if case.case_number:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already {case.case_number}")
    case.case_number = next_reference(db, "DLAS", utcnow().year)
    case.status = CaseStatus.ACTIVE
    record_audit(
        db,
        actor=actor,
        action=AuditAction.CASE_PROMOTED,
        entity_type="case",
        entity_id=case.id,
        details={"applicationId": case.application_id, "caseNumber": case.case_number},
    )
    db.commit()
    return case_view(case)


class LawyerIn(BaseModel):
    lawyer_id: str = Field(min_length=1, max_length=20)
    # Why the case moves to another lawyer (e.g. the last one stopped reporting).
    reason: str | None = Field(default=None, max_length=2000)


@router.post("/cases/{ref}/lawyer")
def assign_lawyer(
    ref: str, body: LawyerIn, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    """Assign a panel lawyer, or move the case to another one."""
    case = get_case_or_404(db, ref)
    lawyer = get_lawyer(body.lawyer_id)
    if lawyer is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"{body.lawyer_id} is not on the panel"
        )
    if case.lawyer_id == lawyer.id:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{lawyer.id} already has this case")
    previous = case.lawyer_id
    case.lawyer_id = lawyer.id
    # The new lawyer's reporting clock starts now.
    case.lawyer_last_update_at = utcnow()
    case.remove_flag("lawyerInactivity")
    record_audit(
        db,
        actor=actor,
        action=AuditAction.LAWYER_ASSIGNED,
        entity_type="case",
        entity_id=case.id,
        details={"lawyerId": lawyer.id, **({"from": previous} if previous else {})},
        justification=(body.reason or "").strip() or None,
    )
    db.commit()
    return case_view(case)


@router.post("/cases/{ref}/lawyer-update")
def lawyer_update_received(
    ref: str, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    """The panel lawyer reported progress; clears the inactivity alert."""
    case = get_case_or_404(db, ref)
    if not case.lawyer_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "No lawyer assigned")
    case.lawyer_last_update_at = utcnow()
    case.remove_flag("lawyerInactivity")
    db.commit()
    return case_view(case)


@router.post("/cases/{ref}/lawyer-reminder")
def remind_lawyer(
    ref: str, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    """Ask the lawyer for their overdue report. They see it on their own dashboard."""
    case = get_case_or_404(db, ref)
    if not case.lawyer_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "No lawyer assigned")
    case.notices = {
        **(case.notices or {}),
        "lawyerReminder": {"lawyerId": case.lawyer_id, "at": utcnow().isoformat()},
    }
    record_audit(
        db,
        actor=actor,
        action=AuditAction.LAWYER_REMINDED,
        entity_type="case",
        entity_id=case.id,
        details={"lawyerId": case.lawyer_id},
    )
    db.commit()
    return case_view(case)


class EscalateIn(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


@router.post("/cases/{ref}/escalate")
def escalate_to_chief(
    ref: str,
    body: EscalateIn | None = None,
    db: Session = Depends(get_db),
    actor: str = Depends(current_actor),
) -> dict[str, Any]:
    """Send the case above district level, to the Chief Legal Aid Officer (NLASO).

    For a case this office cannot act on (T2), or one that other offices keep
    sending back: the chief's decision on who handles it binds every office.
    """
    case = get_case_or_404(db, ref)
    if "escalated" in case.flags and "jurisdictionEscalation" not in case.flags:
        raise HTTPException(status.HTTP_409_CONFLICT, "The case has already been escalated")
    case.remove_flag("jurisdictionEscalation")
    case.add_flag("escalated")
    record_audit(
        db,
        actor=actor,
        action=AuditAction.CASE_ESCALATED,
        entity_type="case",
        entity_id=case.id,
        details={"to": "chiefLegalAidOfficer", "timesReturned": times_returned(case)},
        justification=((body.note if body else None) or "").strip() or None,
    )
    db.commit()
    return case_view(case)


@router.get("/cases/{ref}/contact-window")
def contact_window(ref: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Whether the applicant may be called right now (drives the dashboard's Call button)."""
    case = get_case_or_404(db, ref)
    if case.applicant is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Case has no applicant")
    d = safe_contact.evaluate(case.applicant, safe_contact.ContactChannel.CALL)
    return {
        "allowed": d.allowed,
        "reason": d.reason,
        "nextWindow": d.next_window.isoformat() if d.next_window else None,
        "neutralOnly": d.neutral_only,
    }


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=1000)
    neutral_body: str | None = Field(default=None, max_length=300)


@router.post("/cases/{ref}/messages")
def message_applicant(
    ref: str, body: MessageIn, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    case = get_case_or_404(db, ref)
    if case.applicant is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Case has no applicant")
    outcome = safe_contact.contact_party(
        db,
        case.applicant,
        body=body.body,
        neutral_body=body.neutral_body,
        actor=actor,
        case_ref=case.display_id,
    )
    db.commit()
    d = outcome.decision
    return {
        "sent": outcome.sms is not None and outcome.sms.ok,
        "variant": outcome.variant,
        "dryRun": outcome.sms.dry_run if outcome.sms else None,
        "blockedReason": d.reason,
        "nextWindow": d.next_window.isoformat() if d.next_window else None,
    }


class CloseIn(BaseModel):
    outcome: CaseOutcome
    note: str = Field(min_length=10, max_length=2000)


@router.post("/cases/{ref}/close")
def close_case(
    ref: str, body: CloseIn, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    case = get_case_or_404(db, ref)
    if case.status == CaseStatus.CLOSED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Case is already closed")
    case.status = CaseStatus.CLOSED
    case.outcome = body.outcome
    record_audit(
        db,
        actor=actor,
        action=AuditAction.CASE_CLOSED,
        entity_type="case",
        entity_id=case.id,
        details={"outcome": body.outcome},
        justification=body.note.strip(),
    )
    db.commit()
    return case_view(case)


class TrackIn(BaseModel):
    track: Track
    # Needed when the officer changes the AI's mark, like a priority override.
    justification: str | None = Field(default=None, max_length=2000)


@router.post("/cases/{ref}/track")
def review_track(
    ref: str, body: TrackIn, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    """The officer confirms the AI's advice/mediation/sensitive mark, or changes it."""
    case = get_case_or_404(db, ref)
    suggested = ((case.triage or {}).get("track") or {}).get("key")
    changed = body.track != suggested
    note = (body.justification or "").strip()
    if changed and len(note) < 20:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Changing the AI's mark needs a justification of at least 20 characters",
        )
    previous = case.track
    case.track = body.track
    case.track_status = TrackStatus.CHANGED if changed else TrackStatus.CONFIRMED
    if body.track == Track.SENSITIVE:
        case.add_flag("sensitive")
    else:
        case.remove_flag("sensitive")
    record_audit(
        db,
        actor=actor,
        action=AuditAction.TRACK_REVIEWED,
        entity_type="case",
        entity_id=case.id,
        details={"from": previous, "to": body.track, "aiSuggested": suggested},
        justification=note or None,
    )
    db.commit()
    return case_view(case)


class JustificationIn(BaseModel):
    justification: str = Field(min_length=20, max_length=2000)


@router.post("/cases/{ref}/respondent-notice")
def release_respondent_notice(
    ref: str,
    body: JustificationIn,
    db: Session = Depends(get_db),
    actor: str = Depends(current_actor),
) -> dict[str, Any]:
    """Send a held "visit the office" SMS to the respondent, on the officer's judgement."""
    case = get_case_or_404(db, ref)
    if (case.notices or {}).get("respondent", {}).get("status") == "sent":
        raise HTTPException(status.HTTP_409_CONFLICT, "The respondent has already been notified")
    record_audit(
        db,
        actor=actor,
        action=AuditAction.NOTICE_RELEASED,
        entity_type="case",
        entity_id=case.id,
        details={"notice": "respondent"},
        justification=body.justification.strip(),
    )
    notice = notices.send_respondent_notice(db, case, actor, released_by_officer=True)
    if notice["status"] == "notFound":
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "No registered number for the respondent; notify in person"
        )
    db.commit()
    return case_view(case)


class SafetyIn(BaseModel):
    level: SafetyLevel
    justification: str = Field(min_length=20, max_length=2000)


@router.post("/cases/{ref}/safety")
def set_safety(
    ref: str, body: SafetyIn, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    """Set how the applicant may be contacted; this is how an officer lifts do-not-call."""
    case = get_case_or_404(db, ref)
    if case.applicant is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Case has no applicant")
    previous = case.applicant.safety_level
    case.applicant.safety_level = body.level
    if body.level != SafetyLevel.NO_CONTACT:
        case.do_not_call_reason = None
        case.remove_flag("doNotCall")
    record_audit(
        db,
        actor=actor,
        action=AuditAction.SAFETY_CHANGED,
        entity_type="case",
        entity_id=case.id,
        details={"from": previous, "to": body.level},
        justification=body.justification.strip(),
    )
    db.commit()
    return case_view(case)


@router.get("/audit/verify")
def verify_audit(db: Session = Depends(get_db)) -> dict[str, Any]:
    ok, broken_at = verify_chain(db)
    return {"ok": ok, "brokenAtSeq": broken_at}
