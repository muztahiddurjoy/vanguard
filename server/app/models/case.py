"""Cases and their progression.

An intake first becomes an *application* (``APP-2026-001``). Once the DLAO
accepts it, it is promoted to a *case* (``DLAS-2026-045``) and keeps both IDs.
Referrals (T2), group incidents (T3) and mediation sessions hang off a case.
"""

import secrets
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, select
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship

from app.database import Base, utcnow
from app.models.party import Party

if TYPE_CHECKING:
    from app.models.lawyer import LawyerUpdate


class CaseStatus(StrEnum):
    APPLICATION = "application"
    ACTIVE = "active"
    REFERRED = "referred"
    IN_MEDIATION = "in_mediation"
    CLOSED = "closed"


class CaseOutcome(StrEnum):
    RESOLVED = "resolved"
    SETTLED = "settled"
    WITHDRAWN = "withdrawn"
    REFERRED = "referred"


class Priority(StrEnum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


PRIORITY_RANK = {Priority.CRITICAL: 0, Priority.HIGH: 1, Priority.MEDIUM: 2, Priority.LOW: 3}


class IntakeChannel(StrEnum):
    HOTLINE = "hotline"
    WALK_IN = "walkIn"
    ONLINE = "online"
    PROXY = "proxy"
    UDC = "udc"


class TriageStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    OVERRIDDEN = "overridden"


class Track(StrEnum):
    """How the case could be resolved. T8 marks it; an officer confirms or changes it."""

    ADVICE = "advice"
    MEDIATION = "mediation"
    SENSITIVE = "sensitive"


class TrackStatus(StrEnum):
    SUGGESTED = "suggested"
    CONFIRMED = "confirmed"
    CHANGED = "changed"


class DoNotCallReason(StrEnum):
    # The caller said something suggesting they are being held.
    HOSTAGE = "hostage"
    # The call was cut while the caller was describing immediate danger.
    DANGER_CALL_CUT = "dangerCallCut"


class PartyRole(StrEnum):
    APPLICANT = "applicant"
    RESPONDENT = "respondent"
    PROXY = "proxy"
    WITNESS = "witness"


class IdCounter(Base):
    """Per-prefix, per-year sequence for human-readable IDs."""

    __tablename__ = "id_counters"
    __table_args__ = (UniqueConstraint("prefix", "year"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    prefix: Mapped[str] = mapped_column(String(10))
    year: Mapped[int] = mapped_column(Integer)
    value: Mapped[int] = mapped_column(Integer, default=0)


def next_reference(db: Session, prefix: str, year: int, width: int = 3) -> str:
    """Allocate the next ``PREFIX-YEAR-NNN`` reference inside the caller's transaction."""
    query = select(IdCounter).where(IdCounter.prefix == prefix, IdCounter.year == year)
    counter = db.scalars(query.with_for_update()).first()
    if counter is None:
        counter = IdCounter(prefix=prefix, year=year, value=0)
        db.add(counter)
    counter.value += 1
    db.flush()
    return f"{prefix}-{year}-{counter.value:0{width}d}"


def new_tracking_token(db: Session) -> str:
    """Eight random digits: easy to say on the phone and to type on any handset."""
    while True:
        token = f"{secrets.randbelow(10**8):08d}"
        if db.scalars(select(Case.id).where(Case.tracking_token == token)).first() is None:
            return token


def format_token(token: str) -> str:
    return f"{token[:4]}-{token[4:]}"


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    case_number: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)
    status: Mapped[CaseStatus] = mapped_column(String(20), default=CaseStatus.APPLICATION)
    outcome: Mapped[CaseOutcome | None] = mapped_column(String(20))

    category: Mapped[str | None] = mapped_column(String(40))
    priority: Mapped[Priority | None] = mapped_column(String(10))
    # The latest T8 recommendation, shaped like the dashboard's TriageRecommendation.
    triage: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    triage_status: Mapped[TriageStatus] = mapped_column(String(20), default=TriageStatus.PENDING)
    # Dashboard CaseFlag values: proxyReported, restrictedContact, lawyerInactivity, …
    flags: Mapped[list[str]] = mapped_column(JSON, default=list)
    track: Mapped[Track | None] = mapped_column(String(20))
    track_status: Mapped[TrackStatus] = mapped_column(String(20), default=TrackStatus.SUGGESTED)
    # Set with the applicant's no_contact safety level; shown as a banner.
    do_not_call_reason: Mapped[DoNotCallReason | None] = mapped_column(String(20))

    # Given to whoever filed the case, to follow its progress on the helpline.
    tracking_token: Mapped[str | None] = mapped_column(String(8), unique=True, index=True)
    # What the caller said, turn by turn: [{"at", "topic", "text"}].
    call_notes: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    # SMS notices: {"filer": {"status", "at"}, "respondent": {"status", "reasons", ...}}.
    notices: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    channel: Mapped[IntakeChannel] = mapped_column(String(20))
    summary: Mapped[str] = mapped_column(Text, default="")
    summary_bn: Mapped[str | None] = mapped_column(Text)
    # Raw answers collected at intake (T5 slots or form fields).
    intake_data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    district: Mapped[str | None] = mapped_column(String(120))
    upazila: Mapped[str | None] = mapped_column(String(120))
    # The district legal aid office currently responsible (changes on referral).
    current_office: Mapped[str] = mapped_column(String(120))

    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    lawyer_id: Mapped[str | None] = mapped_column(String(20))
    lawyer_last_update_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    incident_id: Mapped[int | None] = mapped_column(ForeignKey("incidents.id", ondelete="SET NULL"))

    # Offline (T9) clients create cases with their own UUID; unique so replays are harmless.
    client_ref: Mapped[str | None] = mapped_column(String(64), unique=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    parties: Mapped[list["CaseParty"]] = relationship(
        back_populates="case", cascade="all, delete-orphan", lazy="selectin"
    )
    referrals: Mapped[list["Referral"]] = relationship(
        back_populates="case", cascade="all, delete-orphan", order_by="Referral.id"
    )
    incident: Mapped["Incident | None"] = relationship(back_populates="cases")
    # Oldest first. Loaded with the case: the dashboards' lists show the next hearing.
    lawyer_updates: Mapped[list["LawyerUpdate"]] = relationship(
        back_populates="case",
        cascade="all, delete-orphan",
        order_by="LawyerUpdate.id",
        lazy="selectin",
    )

    @property
    def display_id(self) -> str:
        return self.case_number or self.application_id

    def party_with_role(self, role: PartyRole) -> Party | None:
        return next((cp.party for cp in self.parties if cp.role == role), None)

    @property
    def applicant(self) -> Party | None:
        return self.party_with_role(PartyRole.APPLICANT)

    def add_flag(self, flag: str) -> None:
        if flag not in self.flags:
            self.flags = [*self.flags, flag]

    def remove_flag(self, flag: str) -> None:
        self.flags = [f for f in self.flags if f != flag]


class CaseParty(Base):
    __tablename__ = "case_parties"
    __table_args__ = (UniqueConstraint("case_id", "party_id", "role"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"))
    party_id: Mapped[int] = mapped_column(ForeignKey("parties.id", ondelete="CASCADE"))
    role: Mapped[PartyRole] = mapped_column(String(20))
    # e.g. "husband", "neighbour" — relative to the applicant.
    relation: Mapped[str | None] = mapped_column(String(80))

    case: Mapped[Case] = relationship(back_populates="parties")
    party: Mapped[Party] = relationship(lazy="joined")


class ReferralStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    RETURNED = "returned"
    # T2: stopped from bouncing further; needs a decision above district level.
    ESCALATED = "escalated"


class Referral(Base):
    """T2: one hop of a case between district legal aid offices."""

    __tablename__ = "referrals"

    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    from_office: Mapped[str] = mapped_column(String(120))
    to_office: Mapped[str] = mapped_column(String(120))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[ReferralStatus] = mapped_column(String(20), default=ReferralStatus.PENDING)
    created_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    responded_by: Mapped[str | None] = mapped_column(String(64))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    response_note: Mapped[str | None] = mapped_column(Text)

    case: Mapped[Case] = relationship(back_populates="referrals")


class Incident(Base):
    """T3: one event (e.g. a factory wage theft) that several applicants report."""

    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(20), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str | None] = mapped_column(String(200))
    respondent: Mapped[str | None] = mapped_column(String(200))
    occurred_on: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    cases: Mapped[list[Case]] = relationship(back_populates="incident")


class MediationMode(StrEnum):
    ODR_VIDEO = "odr_video"
    ODR_PHONE = "odr_phone"
    IN_PERSON = "in_person"


class MediationStatus(StrEnum):
    SCHEDULED = "scheduled"
    HELD = "held"
    CANCELLED = "cancelled"


class MediationSession(Base):
    __tablename__ = "mediation_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    mode: Mapped[MediationMode] = mapped_column(String(20))
    status: Mapped[MediationStatus] = mapped_column(String(20), default=MediationStatus.SCHEDULED)
    meeting_url: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    settlement_document_id: Mapped[int | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL")
    )
    created_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
