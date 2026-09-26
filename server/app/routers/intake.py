"""Intake from the web form, UDC operators and the T5 conversational agent.

Every route ends in ``create_application``: parties are recorded with their
provenance and safety needs, the case gets an APP- reference, T8 triage runs,
and possible duplicates (T4) are queued for review.
"""

import base64
import contextlib
import uuid
from dataclasses import dataclass
from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents import t5_intake
from app.agents.spoken import parse_safe_window
from app.agents.state import DocumentState
from app.agents.t6_document import run_document_review
from app.config import get_settings
from app.database import get_db, utcnow
from app.models import (
    AccessibilityFlag,
    AuditAction,
    Case,
    CaseParty,
    ChecklistItem,
    ChecklistStatus,
    Document,
    DocumentKind,
    DocumentStatus,
    DoNotCallReason,
    IntakeChannel,
    Party,
    PartyRole,
    Priority,
    Provenance,
    SafetyLevel,
    new_tracking_token,
    next_reference,
    record_audit,
)
from app.routers import current_actor, require_api_token
from app.routers.dlao import (
    apply_triage,
    case_view,
    due_at_for,
    get_case_or_404,
    mark_do_not_call,
)
from app.routers.duplicates import cases_of, find_duplicates_for
from app.services.adnsms import normalize_bd_mobile
from app.services.nid_registry import Citizen
from app.services.notices import send_intake_notices
from app.services.uploads import MAX_UPLOAD_BYTES, save_upload

router = APIRouter(prefix="/intake", tags=["intake"], dependencies=[Depends(require_api_token)])


class SafeWindowIn(BaseModel):
    day: int = Field(ge=0, le=6, description="0 = Sunday, as in JS Date#getDay")
    start_hour: int = Field(ge=0, le=23)
    end_hour: int = Field(ge=1, le=24)

    @model_validator(mode="after")
    def _ordered(self) -> "SafeWindowIn":
        if self.start_hour >= self.end_hour:
            raise ValueError("start_hour must be before end_hour")
        return self


def _phone(value: str | None) -> str | None:
    return normalize_bd_mobile(value) if value else None


class PartyIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    name_bn: str | None = Field(default=None, max_length=200)
    phone: str | None = None
    nid: str | None = Field(default=None, max_length=30)
    guardian_name: str | None = Field(default=None, max_length=200)
    village: str | None = Field(default=None, max_length=120)
    upazila: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    age: int | None = Field(default=None, ge=0, le=120)
    preferred_language: Literal["bn", "en"] = "bn"
    accessibility_flags: list[AccessibilityFlag] = []

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, v: str | None) -> str | None:
        return _phone(v)


class ProxyIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    phone: str | None = None
    relation: str = Field(min_length=1, max_length=80)

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, v: str | None) -> str | None:
        return _phone(v)


class RespondentIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    relation: str | None = Field(default=None, max_length=80)


class IntakeIn(BaseModel):
    applicant: PartyIn
    narrative: str = Field(min_length=10, max_length=10_000)
    proxy: ProxyIn | None = None
    respondent: RespondentIn | None = None
    safe_contact_windows: list[SafeWindowIn] = []
    # Someone else checks the applicant's phone.
    phone_monitored: bool = False
    next_hearing_date: date | None = None
    # Client-generated ID; resubmitting the same one returns the same case.
    client_ref: str | None = Field(default=None, max_length=64)


class UdcIntakeIn(IntakeIn):
    udc_center: str = Field(min_length=1, max_length=200)
    operator_id: str = Field(min_length=1, max_length=64)


@dataclass
class Identities:
    """People matched in the NID registry during a call. Never taken from client input."""

    applicant: Citizen | None = None
    # The caller, when they apply for someone else.
    filer: Citizen | None = None
    respondent: Citizen | None = None


def apply_citizen(party: Party, citizen: Citizen) -> None:
    """Fill a party from their NID record, which replaces what was said on the call."""
    party.name, party.name_bn = citizen.name.en, citizen.name.bn
    party.guardian_name = citizen.father.name.en
    party.mother_name = citizen.mother.name.en
    party.date_of_birth = citizen.date_of_birth
    party.age = citizen.age_on(utcnow().date())
    home = citizen.present_address
    party.village, party.upazila = home.village.en, home.upazila.en
    party.district = home.district.en
    party.set_nid(citizen.nid)
    party.nid_verified = True
    party.registered_phones = citizen.phones


def create_application(
    db: Session,
    data: IntakeIn,
    *,
    channel: IntakeChannel,
    provenance: Provenance,
    actor: str,
    extra: dict[str, Any] | None = None,
    identities: Identities | None = None,
    notify: bool = True,
) -> Case:
    """Record parties and a new APP- application, triage it, and send the SMS notices.

    ``notify=False`` leaves the notices to the caller, which must send them once
    the case is fully marked (a do-not-call mark must come before any SMS).
    Caller commits.
    """
    if data.client_ref:
        existing = db.scalars(select(Case).where(Case.client_ref == data.client_ref)).first()
        if existing is not None:
            return existing

    a = data.applicant
    windows = [w.model_dump() for w in data.safe_contact_windows]
    restricted = data.phone_monitored
    applicant = Party(
        name=a.name,
        name_bn=a.name_bn,
        phone=a.phone,
        guardian_name=a.guardian_name,
        village=a.village,
        upazila=a.upazila,
        district=a.district,
        age=a.age,
        preferred_language=a.preferred_language,
        accessibility_flags=[f.value for f in a.accessibility_flags],
        safe_contact_windows=windows,
        safety_level=SafetyLevel.RESTRICTED if restricted else SafetyLevel.STANDARD,
        provenance=Provenance.PROXY_REPORTED if data.proxy else provenance,
        provenance_detail=(
            {
                "proxy_name": data.proxy.name,
                "relation": data.proxy.relation,
                "via": provenance.value,
            }
            if data.proxy
            else {}
        ),
    )
    applicant.set_nid(a.nid)
    ids = identities or Identities()
    if ids.applicant:
        apply_citizen(applicant, ids.applicant)
    links = [CaseParty(party=applicant, role=PartyRole.APPLICANT)]
    if data.proxy:
        proxy = Party(name=data.proxy.name, phone=data.proxy.phone, provenance=provenance)
        if ids.filer:
            apply_citizen(proxy, ids.filer)
        links.append(CaseParty(party=proxy, role=PartyRole.PROXY, relation=data.proxy.relation))
    if data.respondent:
        respondent = Party(name=data.respondent.name, provenance=provenance)
        if ids.respondent:
            apply_citizen(respondent, ids.respondent)
            respondent.phone = next(iter(respondent.registered_phones), None)
        links.append(
            CaseParty(
                party=respondent, role=PartyRole.RESPONDENT, relation=data.respondent.relation
            )
        )

    settings = get_settings()
    now = utcnow()
    case = Case(
        application_id=next_reference(db, "APP", now.year),
        tracking_token=new_tracking_token(db),
        channel=IntakeChannel.PROXY if data.proxy else channel,
        summary=data.narrative.strip(),
        district=applicant.district,
        upazila=applicant.upazila,
        current_office=settings.office_district,
        received_at=now,
        client_ref=data.client_ref,
        intake_data={
            "next_hearing_date": data.next_hearing_date.isoformat()
            if data.next_hearing_date
            else None,
            "phone_monitored": data.phone_monitored,
            **(extra or {}),
        },
        parties=links,
    )
    db.add(case)
    db.flush()
    record_audit(
        db,
        actor=actor,
        action=AuditAction.CASE_CREATED,
        entity_type="case",
        entity_id=case.id,
        details={"applicationId": case.application_id, "channel": case.channel},
    )
    apply_triage(db, case, actor="agent:t8")
    for review in find_duplicates_for(db, applicant):
        for linked in cases_of(db, review.party_a_id) + cases_of(db, review.party_b_id):
            linked.add_flag("possibleDuplicate")
    if notify:
        send_intake_notices(db, case, actor)
    return case


@router.post("/web", status_code=status.HTTP_201_CREATED)
def web_intake(
    body: IntakeIn, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    case = create_application(
        db, body, channel=IntakeChannel.ONLINE, provenance=Provenance.WEB_FORM, actor=actor
    )
    db.commit()
    return case_view(case)


@router.post("/udc", status_code=status.HTTP_201_CREATED)
def udc_intake(
    body: UdcIntakeIn, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    case = create_application(
        db,
        body,
        channel=IntakeChannel.UDC,
        provenance=Provenance.UDC_OPERATOR,
        actor=actor if actor != "anonymous" else f"udc:{body.operator_id}",
        extra={"udc_center": body.udc_center, "operator_id": body.operator_id},
    )
    db.commit()
    return case_view(case)


# --- documents (T6) ----------------------------------------------------------


def refresh_checklist(db: Session, case: Case, new_doc: Document, data: bytes) -> DocumentState:
    """Run T6 on the new document and rebuild the case checklist.

    Documents already read are passed as text, so only the new one is OCR'd.
    """
    existing = db.scalars(
        select(Document).where(Document.case_id == case.id, Document.id != new_doc.id)
    ).all()
    # Not intake evidence: drafts are generated here, court orders come from the lawyer,
    # and a signature is what court or jail staff took from the applicant.
    not_evidence = (
        DocumentKind.SETTLEMENT_DRAFT,
        DocumentKind.COURT_ORDER,
        DocumentKind.APPLICANT_SIGNATURE,
    )
    docs: list[dict[str, Any]] = [
        {"id": d.id, "kind": d.kind, "content_type": d.content_type, "text": d.extracted_text}
        for d in existing
        if d.kind not in not_evidence
    ]
    docs.append(
        {
            "id": new_doc.id,
            "kind": None if new_doc.kind == DocumentKind.OTHER else new_doc.kind,
            "filename": new_doc.filename,
            "content_type": new_doc.content_type,
            "data_b64": base64.b64encode(data).decode(),
        }
    )
    out = run_document_review(case.category, docs)
    result = out["results"][str(new_doc.id)]
    new_doc.extracted_text = result["text"]
    new_doc.summary = result["summary"]
    new_doc.kind = result["kind"]
    new_doc.status = DocumentStatus(result["status"])

    current = {
        i.item_key: i
        for i in db.scalars(select(ChecklistItem).where(ChecklistItem.case_id == case.id))
    }
    for item in out["checklist"]:
        row = current.get(item["key"]) or ChecklistItem(case_id=case.id, item_key=item["key"])
        if row.status == ChecklistStatus.WAIVED:
            continue  # an officer's waiver stands
        row.label, row.label_bn, row.required = item["label"], item["label_bn"], item["required"]
        row.status = ChecklistStatus(item["status"])
        row.document_id = item["document_id"]
        db.add(row)
    return out


def store_document(
    db: Session,
    case: Case,
    *,
    data: bytes,
    filename: str | None,
    content_type: str | None,
    kind: DocumentKind,
    actor: str,
) -> dict[str, Any]:
    """Validate, store and read one document, and refresh the checklist. Caller commits."""
    doc = save_upload(
        db, case, data=data, filename=filename, content_type=content_type, kind=kind, actor=actor
    )
    digest = doc.sha256
    out = refresh_checklist(db, case, doc, data)
    record_audit(
        db,
        actor=actor,
        action=AuditAction.DOCUMENT_UPLOADED,
        entity_type="case",
        entity_id=case.id,
        details={"documentId": doc.id, "kind": doc.kind, "sha256": digest, "status": doc.status},
    )
    return {
        "document": {
            "id": doc.id,
            "kind": doc.kind,
            "status": doc.status,
            "summary": doc.summary,
            "sha256": digest,
        },
        "checklist": out["checklist"],
        "missing": out["missing"],
    }


@router.post("/cases/{ref}/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(
    ref: str,
    file: UploadFile = File(...),
    kind: DocumentKind = Form(DocumentKind.OTHER),
    db: Session = Depends(get_db),
    actor: str = Depends(current_actor),
) -> dict[str, Any]:
    case = get_case_or_404(db, ref)
    result = store_document(
        db,
        case,
        data=await file.read(MAX_UPLOAD_BYTES + 1),
        filename=file.filename,
        content_type=file.content_type,
        kind=kind,
        actor=actor,
    )
    db.commit()
    return result


# --- T5 conversation ---------------------------------------------------------


class ConversationStartIn(BaseModel):
    channel: Literal["hotline_16699", "udc", "web"] = "web"
    language: Literal["bn", "en"] = "bn"


class TurnIn(BaseModel):
    utterance: str = Field(min_length=1, max_length=2000)


CONVERSATION_CHANNEL = {
    "hotline_16699": (IntakeChannel.HOTLINE, Provenance.HOTLINE_16699),
    "udc": (IntakeChannel.UDC, Provenance.UDC_OPERATOR),
    "web": (IntakeChannel.ONLINE, Provenance.WEB_FORM),
}


def filer_relation(filing: str, caller: Citizen | None) -> str:
    """How the caller is related to the person they apply for."""
    gender = caller.gender if caller else None
    if filing in ("father", "mother"):
        return {"male": "son", "female": "daughter"}.get(gender or "", "child")
    if filing == "sibling":
        return {"male": "brother", "female": "sister"}.get(gender or "", "sibling")
    return "reported by phone"


def intake_from_conversation(
    state: t5_intake.IntakeState, session_id: str
) -> tuple[IntakeIn, Identities]:
    """Turn a T5 conversation into the payload the forms send, plus its NID matches.

    Calls that end early (an emergency, a cut call) still become an application,
    with placeholders an officer replaces on follow-up.
    """
    slots = state.get("slots") or {}
    filing = slots.get("filing_for") or "self"
    caller = t5_intake.citizen_of(state, "caller_record")
    notes = " / ".join(n["text"] for n in state.get("notes") or [])
    last = state.get("utterance", "")
    narrative = slots.get("problem") or notes or f"Caller reported immediate danger: {last}"
    window = parse_safe_window(slots.get("safe_to_call") or "")
    proxy = (
        ProxyIn(
            name=slots.get("caller_name") or "Caller (name not given)",
            phone=state.get("caller_phone"),
            relation=filer_relation(filing, caller),
        )
        if filing != "self"
        else None
    )
    respondent = (
        RespondentIn(name=slots["respondent_name"], relation=slots.get("respondent_relation"))
        if slots.get("respondent_name")
        else None
    )
    data = IntakeIn(
        applicant=PartyIn(
            name=slots.get("name") or slots.get("caller_name") or "Unknown caller",
            phone=slots.get("phone"),
            district=slots.get("district"),
            upazila=slots.get("upazila"),
            preferred_language=state.get("language", "bn"),
        ),
        narrative=narrative if len(narrative) >= 10 else f"{narrative} (reported by phone)",
        proxy=proxy,
        respondent=respondent,
        safe_contact_windows=[SafeWindowIn(**window)] if window else [],
        phone_monitored=bool(slots.get("phone_monitored")),
        client_ref=f"conv:{session_id}",
    )
    identities = Identities(
        applicant=t5_intake.citizen_of(state, "applicant_record"),
        filer=caller if filing != "self" else None,
        respondent=t5_intake.citizen_of(state, "respondent_record"),
    )
    return data, identities


# Violence described before a call was cut: calling back may alert whoever cut it.
CUT_CALL_DANGER = {"activeViolence", "weaponThreat", "hostageSituation"}


def finish_conversation(
    db: Session,
    session_id: str,
    state: t5_intake.IntakeState,
    actor: str,
    fallback_phone: str | None = None,
    dropped: bool = False,
) -> Case | None:
    """Create the application when the conversation ends, or when the call is cut.

    A call creates one once the problem has been described, even if it was cut
    before the last question (flagged ``callDropped``, with everything said so
    far in the call notes). An emergency always creates one, escalated and
    critical, so the callback happens; if the caller never gave a number,
    ``fallback_phone`` (caller ID) is used. If the caller seemed to be held
    (hostage), or the call was cut while they described violence, the
    applicant is marked do-not-call instead: a callback could alert whoever is
    with them. Calling this twice for one conversation returns the same case.
    """
    client_ref = f"conv:{session_id}"
    if existing := db.scalars(select(Case).where(Case.client_ref == client_ref)).first():
        return existing
    slots = dict(state.get("slots") or {})
    emergency, hostage = bool(state.get("emergency")), bool(state.get("hostage"))
    cut_short = dropped and not state.get("complete")
    if not state.get("complete") and not dropped:
        return None
    if not (emergency or hostage or slots.get("problem")):
        return None  # nothing an officer could act on
    if emergency and not hostage and not slots.get("phone") and fallback_phone:
        with contextlib.suppress(ValueError):
            slots["phone"] = normalize_bd_mobile(fallback_phone)
    channel, provenance = CONVERSATION_CHANNEL.get(
        state.get("channel", "web"), CONVERSATION_CHANNEL["web"]
    )
    data, identities = intake_from_conversation({**state, "slots": slots}, session_id)
    case = create_application(
        db,
        data,
        channel=channel,
        provenance=provenance,
        actor=actor,
        extra={
            "conversation": session_id,
            "safe_to_call_said": slots.get("safe_to_call"),
            "notify_respondent": slots.get("notify_respondent"),
            "identity": {
                "filingFor": slots.get("filing_for") or "self",
                "caller": state.get("identity"),
                "callerVerifiedBy": state.get("identity_via"),
                "applicant": state.get("applicant_status"),
                "respondent": state.get("respondent_status"),
                "respondentFoundBy": state.get("respondent_via"),
                "callerSimRegistered": bool(state.get("caller_sim_registered")),
            },
        },
        identities=identities,
        notify=False,
    )
    case.call_notes = list(state.get("notes") or [])
    record_audit(
        db,
        actor=actor,
        action=AuditAction.IDENTITY_CHECKED,
        entity_type="case",
        entity_id=case.id,
        details=case.intake_data["identity"],
    )
    if cut_short:
        case.add_flag("callDropped")
    if emergency:
        case.add_flag("escalated")
        case.priority = Priority.CRITICAL
        case.due_at = due_at_for(Priority.CRITICAL, case.received_at)
        record_audit(
            db,
            actor=actor,
            action=AuditAction.TRIAGE_GENERATED,
            entity_type="case",
            entity_id=case.id,
            details={"priority": "critical", "reason": "caller reported immediate danger"},
        )
    detected = {f["key"] for f in (case.triage or {}).get("factors", []) if f["detected"]}
    if hostage:
        mark_do_not_call(db, case, DoNotCallReason.HOSTAGE, actor=actor)
    elif cut_short and CUT_CALL_DANGER & detected:
        mark_do_not_call(db, case, DoNotCallReason.DANGER_CALL_CUT, actor=actor)
    send_intake_notices(db, case, actor)
    return case


# Security answers and contact details are not echoed back to the client.
PRIVATE_SLOTS = {"phone", "father_name", "date_of_birth"}


def turn_view(state: t5_intake.IntakeState, case: Case | None) -> dict[str, Any]:
    lang = state.get("language", "bn")
    return {
        "reply": t5_intake.with_token(state["reply"], case.tracking_token if case else None, lang),
        "asking": state.get("asking"),
        "complete": state.get("complete", False),
        "emergency": state.get("emergency", False),
        "hostage": state.get("hostage", False),
        "identity": {
            "caller": state.get("identity"),
            "applicant": state.get("applicant_status"),
            "respondent": state.get("respondent_status"),
        },
        "slots": {k: v for k, v in (state.get("slots") or {}).items() if k not in PRIVATE_SLOTS},
        "case": case_view(case) if case else None,
    }


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
def start_conversation(body: ConversationStartIn) -> dict[str, Any]:
    session_id = uuid.uuid4().hex
    state = t5_intake.conversations().start(
        session_id, channel=body.channel, language=body.language
    )
    return {"sessionId": session_id, "reply": state["reply"], "asking": state.get("asking")}


@router.post("/conversations/{session_id}/turns")
def conversation_turn(
    session_id: str,
    body: TurnIn,
    db: Session = Depends(get_db),
    actor: str = Depends(current_actor),
) -> dict[str, Any]:
    conv = t5_intake.conversations()
    if not conv.state(session_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown conversation")
    if conv.state(session_id).get("complete"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Conversation already finished")
    state = conv.turn(session_id, body.utterance)
    case = finish_conversation(db, session_id, state, actor=f"agent:t5:{actor}")
    db.commit()
    return turn_view(state, case)


@router.post("/conversations/{session_id}/end")
def end_conversation(
    session_id: str, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    """The caller left before the end (the web or UDC equivalent of a cut call)."""
    conv = t5_intake.conversations()
    state = conv.state(session_id)
    if not state:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown conversation")
    case = finish_conversation(db, session_id, state, actor=f"agent:t5:{actor}", dropped=True)
    db.commit()
    return {"case": case_view(case) if case else None}
