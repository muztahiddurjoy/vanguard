"""What a legal aid case cost its panel lawyer, and the court's decision on it.

A lawyer who took a case to court claims what it cost them once the case is
closed: one line per item, each under a head of the fee schedule
(``services.gazette``). They send the bill to the court that heard the case; the
court allows or disallows each line, then releases it for payment against a
voucher number. This mirrors NLASO's এল.এ. ফরম-১১ (বিল ফরম) and
এল.এ. ফরম-১৮ (আইনজীবীর ফি প্রদান রেজিস্টার).

Money is whole taka throughout, never a float: a bill is paid in taka and a
rounding error in an officer's ledger is not an option.
"""

from datetime import date, datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, utcnow

if TYPE_CHECKING:
    from app.models.case import Case


class BillStatus(StrEnum):
    # The lawyer is still itemising it; the court cannot see it yet.
    DRAFT = "draft"
    SUBMITTED = "submitted"
    # Sent back for correction: the lawyer edits it and submits again.
    RETURNED = "returned"
    # Each line allowed or cut, waiting for the money to be released.
    VERIFIED = "verified"
    RELEASED = "released"
    REJECTED = "rejected"


class BillHead(StrEnum):
    """The heads a claim can be made under; each has its own ceiling in the schedule."""

    APPEARANCE = "appearance"  # attending a hearing
    DRAFTING = "drafting"  # plaint, written statement, application
    COURT_FEE = "courtFee"  # court fee stamps
    VAKALATNAMA = "vakalatnama"
    CERTIFIED_COPY = "certifiedCopy"  # certified copy of an order or judgment
    PROCESS_FEE = "processFee"  # summons and warrant service
    AFFIDAVIT = "affidavit"
    CLERICAL = "clerical"  # the lawyer's clerk, typing, photocopies
    CONVEYANCE = "conveyance"  # travel to the court
    MEDIATION = "mediation"  # attending a mediation session
    OTHER = "other"


class Bill(Base):
    """One closed case's bill: at most one per case, claimed by the lawyer who took it."""

    __tablename__ = "bills"

    id: Mapped[int] = mapped_column(primary_key=True)
    bill_number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    # Unique: what a case cost is claimed once, as one bill.
    case_id: Mapped[int] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), unique=True, index=True
    )
    # Plain strings like ``Case.lawyer_id``: the panel and court rosters are code
    # (``services.panel``, ``services.courts``), not tables.
    lawyer_id: Mapped[str] = mapped_column(String(20), index=True)
    court_id: Mapped[str] = mapped_column(String(20), index=True)
    status: Mapped[BillStatus] = mapped_column(String(20), default=BillStatus.DRAFT)
    # The fee schedule the lines were checked against, so a bill decided last year
    # still reads against the ceilings that applied to it.
    schedule_version: Mapped[str] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(Text)
    # For a note written in Bangla; the dashboards send one note today.
    note_bn: Mapped[str | None] = mapped_column(Text)

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The court's decision: when it verified or rejected the bill, and who did.
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_by: Mapped[str | None] = mapped_column(String(64))
    # Why it was cut, sent back or rejected, as the lawyer reads it.
    decision_note: Mapped[str | None] = mapped_column(Text)

    voucher_number: Mapped[str | None] = mapped_column(String(64))
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    released_by: Mapped[str | None] = mapped_column(String(64))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    # Saving a bill replaces every line, so orphans are deleted with it.
    lines: Mapped[list["BillLine"]] = relationship(
        back_populates="bill",
        cascade="all, delete-orphan",
        order_by="BillLine.id",
        lazy="selectin",
    )
    case: Mapped["Case"] = relationship(lazy="joined")


class BillLine(Base):
    """One item claimed: a head, what it was for, when it was incurred and how much."""

    __tablename__ = "bill_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    bill_id: Mapped[int] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"), index=True)
    head: Mapped[BillHead] = mapped_column(String(20))
    description: Mapped[str] = mapped_column(Text)
    incurred_on: Mapped[date] = mapped_column(Date)
    # Whole taka. Integer everywhere: money on a bill is never a float.
    claimed_taka: Mapped[int] = mapped_column(Integer)
    # Empty until the court decides the line; 0 means the whole line was cut.
    allowed_taka: Mapped[int | None] = mapped_column(Integer)
    disallowed_reason: Mapped[str | None] = mapped_column(Text)
    # The receipt, stamp or challan the claim rests on.
    voucher_ref: Mapped[str | None] = mapped_column(String(80))

    bill: Mapped[Bill] = relationship(back_populates="lines")
