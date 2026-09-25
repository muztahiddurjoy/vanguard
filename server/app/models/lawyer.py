"""What panel lawyers report from court: one row per progress update."""

from datetime import date, datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, utcnow

if TYPE_CHECKING:
    from app.models.case import Case
    from app.models.document import Document


class CourtStage(StrEnum):
    """Where the case stands in court after the step the lawyer reports."""

    PLAINT_FILED = "plaintFiled"  # plaint and vakalatnama filed
    EVIDENCE_RECORDED = "evidenceRecorded"  # witnesses examined, statements recorded
    HEARING_ADJOURNED = "hearingAdjourned"  # heard, order reserved or hearing adjourned
    BAIL_HEARD = "bailHeard"  # bail application heard
    SETTLEMENT_FILED = "settlementFiled"  # mediation settlement filed with the court
    JUDGMENT = "judgment"  # judgment and decree given
    OTHER = "other"


class LawyerUpdate(Base):
    __tablename__ = "lawyer_updates"

    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    # Kept per update: a case can move to another lawyer, and its history stays.
    lawyer_id: Mapped[str] = mapped_column(String(20))
    stage: Mapped[CourtStage] = mapped_column(String(30))
    summary: Mapped[str] = mapped_column(Text)
    court: Mapped[str | None] = mapped_column(String(200))
    # The hearing this update reports on, if there was one.
    hearing_held_on: Mapped[date | None] = mapped_column(Date)
    # The next date the court fixed; empty once there is none (e.g. after judgment).
    next_hearing_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The order sheet or certified copy the lawyer attached.
    document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    case: Mapped["Case"] = relationship(back_populates="lawyer_updates")
    document: Mapped["Document | None"] = relationship(lazy="joined")
