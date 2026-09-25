"""Intake from the web form, UDC operators and the T5 conversational agent.

Every route ends in ``create_application``: parties are recorded with their
provenance and safety needs, the case gets an APP- reference, T8 triage runs,
and possible duplicates (T4) are queued for review.
"""

import uuid
from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents import t5_intake
from app.config import get_settings
from app.database import get_db, utcnow
from app.models import (
    AccessibilityFlag,
    AuditAction,
    Case,
    CaseParty,
    IntakeChannel,
    Party,
    PartyRole,
    Priority,
    Provenance,
    SafetyLevel,
    next_reference,
    record_audit,
)
from app.routers import current_actor, require_api_token
from app.routers.dlao import apply_triage, case_view, due_at_for
from app.services.adnsms import normalize_bd_mobile

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


def create_application(
    db: Session,
    data: IntakeIn,
    *,
    channel: IntakeChannel,
    provenance: Provenance,
    actor: str,
    extra: dict[str, Any] | None = None,
) -> Case:
    """Record parties and a new APP- application, then triage it. Caller commits."""
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
    links = [CaseParty(party=applicant, role=PartyRole.APPLICANT)]
    if data.proxy:
        proxy = Party(name=data.proxy.name, phone=data.proxy.phone, provenance=provenance)
        links.append(CaseParty(party=proxy, role=PartyRole.PROXY, relation=data.proxy.relation))
    if data.respondent:
        respondent = Party(name=data.respondent.name, provenance=provenance)
        links.append(
            CaseParty(
                party=respondent, role=PartyRole.RESPONDENT, relation=data.respondent.relation
            )
        )

    settings = get_settings()
    now = utcnow()
    case = Case(
        application_id=next_reference(db, "APP", now.year),
        channel=IntakeChannel.PROXY if data.proxy else channel,
        summary=data.narrative.strip(),
        district=a.district,
        upazila=a.upazila,
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


def intake_from_slots(slots: dict[str, Any], session_id: str, last_utterance: str = "") -> IntakeIn:
    """Turn T5 slots into the same payload the forms send.

    Emergency calls may end before every slot is filled; they still become an
    application, with placeholders an officer replaces on the callback.
    """
    window = t5_intake.parse_safe_window(slots.get("safe_to_call") or "")
    problem = slots.get("problem") or f"Caller reported immediate danger: {last_utterance}"
    proxy = (
        ProxyIn(name="Caller (name not given)", relation="reported by phone")
        if slots.get("is_proxy")
        else None
    )
    return IntakeIn(
        applicant=PartyIn(
            name=slots.get("name") or "Unknown caller",
            phone=slots.get("phone"),
            district=slots.get("district"),
            upazila=slots.get("upazila"),
        ),
        narrative=problem if len(problem) >= 10 else f"{problem} (reported by phone)",
        proxy=proxy,
        safe_contact_windows=[SafeWindowIn(**window)] if window else [],
        phone_monitored=bool(slots.get("phone_monitored")),
        client_ref=f"conv:{session_id}",
    )


def finish_conversation(
    db: Session, session_id: str, state: t5_intake.IntakeState, actor: str
) -> Case | None:
    """Create the application when the conversation ends.

    A normal call needs every required slot. A call that ended in an emergency
    always creates one, escalated and critical, so the callback happens.
    """
    slots = state.get("slots") or {}
    emergency = bool(state.get("emergency"))
    if not state.get("complete") or (t5_intake.missing_required(slots) and not emergency):
        return None
    channel, provenance = CONVERSATION_CHANNEL.get(
        state.get("channel", "web"), CONVERSATION_CHANNEL["web"]
    )
    data = intake_from_slots(slots, session_id, state.get("utterance", ""))
    case = create_application(
        db,
        data,
        channel=channel,
        provenance=provenance,
        actor=actor,
        extra={"conversation": session_id, "safe_to_call_said": slots.get("safe_to_call")},
    )
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
    return case


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
    return {
        "reply": state["reply"],
        "asking": state.get("asking"),
        "complete": state.get("complete", False),
        "emergency": state.get("emergency", False),
        "slots": {k: v for k, v in (state.get("slots") or {}).items() if k != "phone"},
        "case": case_view(case) if case else None,
    }
