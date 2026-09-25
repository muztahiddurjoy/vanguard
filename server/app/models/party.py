"""People involved in cases: applicants, respondents and proxies.

A party carries the facts that change how we may contact them: a safety level,
where their details came from (provenance), accessibility needs, and the weekly
windows in which it is safe to reach them.
"""

import hashlib
import hmac
import re
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.config import get_settings
from app.database import Base, utcnow


def hash_nid(nid: str) -> str:
    """HMAC-SHA256 of the digits, keyed by NID_HASH_KEY.

    NIDs are short numeric strings, so a plain hash could be reversed by
    enumeration; the key keeps the column useless without the server secret.
    """
    digits = re.sub(r"\D", "", nid)
    key = get_settings().nid_hash_key.encode()
    return hmac.new(key, digits.encode(), hashlib.sha256).hexdigest()


class SafetyLevel(StrEnum):
    STANDARD = "standard"
    # Known risk: contact with care, no case details in messages.
    CAUTION = "caution"
    # Contact only inside a safe window (e.g. the abuser monitors the phone).
    RESTRICTED = "restricted"
    # No calls or SMS at all: the caller signalled they are held hostage, or the
    # call was cut while they were in danger. A ringing phone could alert whoever
    # is holding them. Only an officer can lift it.
    NO_CONTACT = "no_contact"


class Provenance(StrEnum):
    SELF_REPORTED = "self_reported"
    PROXY_REPORTED = "proxy_reported"
    HOTLINE_16699 = "hotline_16699"
    UDC_OPERATOR = "udc_operator"
    WEB_FORM = "web_form"
    DOCUMENT_VERIFIED = "document_verified"


class AccessibilityFlag(StrEnum):
    LOW_LITERACY = "low_literacy"
    VISUALLY_IMPAIRED = "visually_impaired"
    HEARING_IMPAIRED = "hearing_impaired"
    MOBILITY_IMPAIRED = "mobility_impaired"
    NEEDS_INTERPRETER = "needs_interpreter"
    NO_OWN_PHONE = "no_own_phone"


class Party(Base):
    __tablename__ = "parties"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    name_bn: Mapped[str | None] = mapped_column(String(200))
    # Normalised to 01XXXXXXXXX; see services.adnsms.normalize_bd_mobile.
    phone: Mapped[str | None] = mapped_column(String(20), index=True)
    # The NID itself is never stored: only a keyed hash (see hash_nid) for exact
    # matching and the last four digits for display ("•••• 2741").
    nid_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    nid_last4: Mapped[str | None] = mapped_column(String(4))
    guardian_name: Mapped[str | None] = mapped_column(String(200))
    village: Mapped[str | None] = mapped_column(String(120))
    upazila: Mapped[str | None] = mapped_column(String(120))
    district: Mapped[str | None] = mapped_column(String(120))
    age: Mapped[int | None]
    preferred_language: Mapped[str] = mapped_column(String(2), default="bn")

    safety_level: Mapped[SafetyLevel] = mapped_column(String(20), default=SafetyLevel.STANDARD)
    provenance: Mapped[Provenance] = mapped_column(String(30), default=Provenance.SELF_REPORTED)
    # Free-form detail about the source, e.g. {"proxy_name": ..., "relation": "neighbour"}.
    provenance_detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    accessibility_flags: Mapped[list[str]] = mapped_column(JSON, default=list)
    # [{"day": 2, "start_hour": 14, "end_hour": 16}] — day as in JS Date#getDay
    # (0 = Sunday), hours in the office time zone. Matches the dashboard.
    safe_contact_windows: Mapped[list[dict[str, int]]] = mapped_column(JSON, default=list)
    contact_notes: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    def set_nid(self, nid: str | None) -> None:
        digits = re.sub(r"\D", "", nid or "")
        self.nid_hash = hash_nid(digits) if digits else None
        self.nid_last4 = digits[-4:] if digits else None

    @property
    def nid_masked(self) -> str | None:
        return f"•••• •••• {self.nid_last4}" if self.nid_last4 else None


class DuplicateStatus(StrEnum):
    PENDING = "pending"
    DISTINCT = "distinct"
    MERGED = "merged"


class DuplicateReview(Base):
    """T4: a possible duplicate pair awaiting an officer's decision."""

    __tablename__ = "duplicate_reviews"
    __table_args__ = (UniqueConstraint("party_a_id", "party_b_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # Always stored with party_a_id < party_b_id so a pair is recorded once.
    party_a_id: Mapped[int] = mapped_column(ForeignKey("parties.id", ondelete="CASCADE"))
    party_b_id: Mapped[int] = mapped_column(ForeignKey("parties.id", ondelete="CASCADE"))
    score: Mapped[float] = mapped_column(Float)
    matching_fields: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[DuplicateStatus] = mapped_column(String(20), default=DuplicateStatus.PENDING)
    resolved_by: Mapped[str | None] = mapped_column(String(64))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
