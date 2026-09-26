"""Mediation notices, attendance, and Union Digital Centres asked to reach a party.

When the office schedules a mediation session, each party gets an SMS notice
with its own notice number and the AI helpline's number: a caller who says the
notice number hears what the notice means (``agents.helpline``). The officer
records who came. Someone who misses ``MEDIATION_NO_SHOW_LIMIT`` sessions in a
row is looked for through their Union Digital Centre (UDC), which is sent the
next date to pass on in person (``services.mediation``).
"""

from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, utcnow


class Attendance(StrEnum):
    PRESENT = "present"
    ABSENT = "absent"


class MediationAttendance(Base):
    """Whether one party came to one session, as the officer recorded it."""

    __tablename__ = "mediation_attendance"
    __table_args__ = (UniqueConstraint("session_id", "party_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("mediation_sessions.id", ondelete="CASCADE"), index=True
    )
    party_id: Mapped[int] = mapped_column(ForeignKey("parties.id", ondelete="CASCADE"))
    # models.case.PartyRole: applicant or respondent.
    role: Mapped[str] = mapped_column(String(20))
    attendance: Mapped[Attendance] = mapped_column(String(10))
    recorded_by: Mapped[str] = mapped_column(String(64))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MediationNotice(Base):
    """The SMS notice one party got for one session.

    ``code`` is the notice number printed in the SMS. The helpline reads out only
    what the SMS itself said (the case reference, the date and the place) to
    anyone who says it. It is eight digits, like a tracking number, and never
    the same as one.
    """

    __tablename__ = "mediation_notices"
    __table_args__ = (UniqueConstraint("session_id", "party_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("mediation_sessions.id", ondelete="CASCADE"), index=True
    )
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    party_id: Mapped[int] = mapped_column(ForeignKey("parties.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(20))
    # Empty for a notice that was held: nothing went out, so there is no number to give.
    code: Mapped[str | None] = mapped_column(String(8), unique=True, index=True)
    # "sent", "failed", "held" (waits for an officer), "blocked" (safe_contact) or
    # "notFound" (no number to send to).
    status: Mapped[str] = mapped_column(String(20))
    # {"reasons": [...], "dryRun": bool, "sentTo": n, "variant": "full" | "neutral"}
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UdcNoticeStatus(StrEnum):
    SENT = "sent"
    # Waits for an officer: telling a UDC where an at-risk applicant lives could endanger them.
    HELD = "held"
    # No UDC is known for the party's upazila.
    NO_UDC = "noUdc"
    FAILED = "failed"
    # The UDC reported that it told the person.
    INFORMED = "informed"


class UdcNotice(Base):
    """A UDC asked to tell a party who keeps missing mediation about the next session."""

    __tablename__ = "udc_notices"
    __table_args__ = (UniqueConstraint("session_id", "party_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    party_id: Mapped[int] = mapped_column(ForeignKey("parties.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(20))
    # The session the UDC is to tell them about.
    session_id: Mapped[int] = mapped_column(
        ForeignKey("mediation_sessions.id", ondelete="CASCADE"), index=True
    )
    # services.udc roster; empty when no UDC serves the party's upazila.
    udc_id: Mapped[str | None] = mapped_column(String(20), index=True)
    missed_in_a_row: Mapped[int] = mapped_column(Integer)
    status: Mapped[UdcNoticeStatus] = mapped_column(String(20))
    reasons: Mapped[list[str]] = mapped_column(JSON, default=list)
    # {"dryRun": bool} once an SMS went out.
    sms: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    released_by: Mapped[str | None] = mapped_column(String(64))
    informed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    informed_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
