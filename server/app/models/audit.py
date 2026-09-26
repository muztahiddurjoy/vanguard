"""Immutable ledger of human overrides, access and contact decisions.

Each entry stores the hash of the previous one, so editing or deleting any
row breaks the chain and ``verify_chain`` points at the first bad entry. The
ORM also refuses to UPDATE or DELETE entries; enforcing the same rule in the
database (REVOKE UPDATE, DELETE or a trigger) is a deployment step.

Also here: receipts for T9 offline sync operations, which are likewise
append-only records of something that already happened.
"""

from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import JSON, DateTime, Integer, String, Text, event, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.database import Base, as_utc, utcnow
from app.services.crypto import hash_payload

GENESIS_HASH = "0" * 64


class AuditAction(StrEnum):
    CASE_CREATED = "case.created"
    CASE_VIEWED = "case.viewed"
    CASE_PROMOTED = "case.promoted"
    CASE_CLOSED = "case.closed"
    TRIAGE_GENERATED = "triage.generated"
    TRIAGE_ACCEPTED = "triage.accepted"
    PRIORITY_OVERRIDE = "priority.override"
    TRACK_REVIEWED = "track.reviewed"
    IDENTITY_CHECKED = "identity.checked"
    SAFETY_CHANGED = "safety.changed"
    NOTICE_HELD = "notice.held"
    NOTICE_RELEASED = "notice.released"
    DUPLICATE_RESOLVED = "duplicate.resolved"
    REFERRAL_CREATED = "referral.created"
    REFERRAL_RESPONDED = "referral.responded"
    REFERRAL_ESCALATED = "referral.escalated"
    INCIDENT_LINKED = "incident.linked"
    CONTACT_SENT = "contact.sent"
    CONTACT_BLOCKED = "contact.blocked"
    DOCUMENT_UPLOADED = "document.uploaded"
    SETTLEMENT_DRAFTED = "settlement.drafted"
    SETTLEMENT_APPROVED = "settlement.approved"
    SIGNATURE_RECORDED = "signature.recorded"
    MEDIATION_SCHEDULED = "mediation.scheduled"
    LAWYER_ASSIGNED = "lawyer.assigned"
    LAWYER_REMINDED = "lawyer.reminded"
    LAWYER_UPDATE = "lawyer.update"
    CASE_ESCALATED = "case.escalated"
    EVIDENCE_VIEWED = "evidence.viewed"
    EVIDENCE_ACKNOWLEDGED = "evidence.acknowledged"
    SYNC_APPLIED = "sync.applied"
    # Court and jail records (court-dashboard, prison-dashboard).
    RECORD_CREATED = "record.created"
    RECORD_UPDATED = "record.updated"
    CAUSE_LIST_PUBLISHED = "causeList.published"
    RECORDS_VIEWED = "records.viewed"
    RECORDS_SEARCHED = "records.searched"
    RECORD_LINKED = "record.linked"
    EKYC_CHECKED = "ekyc.checked"
    APPLICANT_SIGNATURE_UPLOADED = "signature.uploaded"
    # Mediation notices, attendance, and asking a UDC to reach a party who keeps missing it.
    MEDIATION_NOTICE = "mediation.notice"
    MEDIATION_ATTENDANCE = "mediation.attendance"
    UDC_NOTIFIED = "udc.notified"
    UDC_NOTICE_RELEASED = "udc.released"
    UDC_INFORMED = "udc.informed"


class ImmutableRecordError(RuntimeError):
    pass


class AuditEntry(Base):
    __tablename__ = "audit_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Position in the chain; unique so two writers cannot fork it.
    seq: Mapped[int] = mapped_column(Integer, unique=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    actor: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(40), index=True)
    entity_type: Mapped[str] = mapped_column(String(30))
    entity_id: Mapped[str] = mapped_column(String(40), index=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    justification: Mapped[str | None] = mapped_column(Text)
    prev_hash: Mapped[str] = mapped_column(String(64))
    entry_hash: Mapped[str] = mapped_column(String(64), unique=True)

    def hashed_fields(self) -> dict[str, Any]:
        return {
            "seq": self.seq,
            "occurred_at": as_utc(self.occurred_at).isoformat(),
            "actor": self.actor,
            "action": str(self.action),
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "details": self.details,
            "justification": self.justification,
            "prev_hash": self.prev_hash,
        }

    def compute_hash(self) -> str:
        return hash_payload(self.hashed_fields())


@event.listens_for(AuditEntry, "before_update")
def _block_update(*_args: Any) -> None:
    raise ImmutableRecordError("audit entries cannot be modified")


@event.listens_for(AuditEntry, "before_delete")
def _block_delete(*_args: Any) -> None:
    raise ImmutableRecordError("audit entries cannot be deleted")


def record_audit(
    db: Session,
    *,
    actor: str,
    action: AuditAction | str,
    entity_type: str,
    entity_id: str | int,
    details: dict[str, Any] | None = None,
    justification: str | None = None,
) -> AuditEntry:
    """Append an entry to the chain within the caller's transaction."""
    last = db.scalars(select(AuditEntry).order_by(AuditEntry.seq.desc()).limit(1)).first()
    entry = AuditEntry(
        seq=(last.seq + 1) if last else 1,
        occurred_at=utcnow(),
        actor=actor,
        action=str(action),
        entity_type=entity_type,
        entity_id=str(entity_id),
        details=details or {},
        justification=justification,
        prev_hash=last.entry_hash if last else GENESIS_HASH,
    )
    entry.entry_hash = entry.compute_hash()
    db.add(entry)
    db.flush()
    return entry


def verify_chain(db: Session) -> tuple[bool, int | None]:
    """Walk the ledger; return (ok, seq of the first broken entry)."""
    prev = GENESIS_HASH
    expected_seq = 1
    for entry in db.scalars(select(AuditEntry).order_by(AuditEntry.seq)):
        if entry.seq != expected_seq or entry.prev_hash != prev:
            return False, entry.seq
        if entry.compute_hash() != entry.entry_hash:
            return False, entry.seq
        prev = entry.entry_hash
        expected_seq += 1
    return True, None


class SyncReceipt(Base):
    """T9: the stored outcome of one offline operation, keyed by its idempotency key."""

    __tablename__ = "sync_receipts"

    idempotency_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    device_id: Mapped[str] = mapped_column(String(100), index=True)
    op: Mapped[str] = mapped_column(String(40))
    # Hash of the op + payload, to reject a reused key carrying different data.
    request_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20))
    result: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    client_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
