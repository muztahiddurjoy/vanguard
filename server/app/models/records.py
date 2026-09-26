"""Court and jail records: the prisoner and case information database.

Courts keep their own register here (court-dashboard): each case with its
parties, what happened at every hearing, the lawyers who appeared, and the
daily cause list. Jails keep their prisoners (prison-dashboard), each linked to
the court cases they are held on. Both can submit a legal aid application for
someone before them, after checking who they are against the NID registry
(e-KYC); it becomes an ordinary application in the DLAO's queue.

Access is by role (see ``services.records``): a court sees its own register, a
jail its own prisoners, and an officer or a panel lawyer only the records
linked to a legal aid case they are responsible for. Records a court marks
``restricted`` (a juvenile's case, a sealed record) never appear as someone's
previous records.

Court cases are matched by court and case number, however the number was typed
("G.R. 455/2026", "GR-455/2026"): see ``case_number_key``. A prisoner's case
or a cause list entry names a case this way, so it links to the court's record
as soon as the court registers it, in whichever order they arrive.
"""

import re
from datetime import date, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, utcnow

_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def case_number_key(number: str) -> str:
    """How a case number is matched: digits in ASCII, letters folded, no spaces or dots.

    "G.R. 455/2026", "gr 455 / 2026" and "জি.আর. ৪৫৫/২০২৬"'s digits all agree on
    the part that matters; the slash and hyphen-free text stays distinct.
    """
    folded = number.translate(_BN_DIGITS).casefold()
    return re.sub(r"[^0-9a-zঀ-৿/]", "", folded)


class CourtCaseType(StrEnum):
    CRIMINAL = "criminal"
    CIVIL = "civil"
    FAMILY = "family"
    # Nari o Shishu Nirjatan Daman Ain 2000.
    WOMEN_CHILDREN = "womenChildren"
    LABOUR = "labour"
    OTHER = "other"


class CourtCaseStatus(StrEnum):
    PENDING = "pending"
    DISPOSED = "disposed"


class CourtPartyRole(StrEnum):
    ACCUSED = "accused"
    COMPLAINANT = "complainant"
    PETITIONER = "petitioner"
    RESPONDENT = "respondent"
    PLAINTIFF = "plaintiff"
    DEFENDANT = "defendant"
    WITNESS = "witness"


class ProceedingKind(StrEnum):
    HEARING = "hearing"
    CHARGE_FRAMING = "chargeFraming"
    EVIDENCE = "evidence"
    BAIL = "bail"
    ARGUMENT = "argument"
    ORDER = "order"
    JUDGMENT = "judgment"
    OTHER = "other"


class LawyerSide(StrEnum):
    DEFENCE = "defence"
    PROSECUTION = "prosecution"
    PLAINTIFF = "plaintiff"
    DEFENDANT = "defendant"
    PETITIONER = "petitioner"
    RESPONDENT = "respondent"


class CourtCase(Base):
    """One case on a court's register."""

    __tablename__ = "court_cases"
    __table_args__ = (UniqueConstraint("court_id", "number_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # services.courts roster.
    court_id: Mapped[str] = mapped_column(String(20), index=True)
    case_number: Mapped[str] = mapped_column(String(60))
    number_key: Mapped[str] = mapped_column(String(80), index=True)
    case_type: Mapped[CourtCaseType] = mapped_column(String(20))
    # "State vs. Abdul Karim", "Rahima Begum vs. Jalal Uddin".
    title: Mapped[str] = mapped_column(String(300))
    # The law and sections: "Penal Code 1860, s. 379".
    sections: Mapped[str | None] = mapped_column(String(300))
    filed_on: Mapped[date | None] = mapped_column(Date)
    status: Mapped[CourtCaseStatus] = mapped_column(String(20), default=CourtCaseStatus.PENDING)
    # Not legally accessible outside this court (a juvenile's case, a sealed record):
    # never shown as anyone's previous record.
    restricted: Mapped[bool] = mapped_column(Boolean, default=False)

    created_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    parties: Mapped[list["CourtCaseParty"]] = relationship(
        back_populates="court_case",
        cascade="all, delete-orphan",
        order_by="CourtCaseParty.id",
        lazy="selectin",
    )
    # Oldest first.
    proceedings: Mapped[list["CourtProceeding"]] = relationship(
        back_populates="court_case",
        cascade="all, delete-orphan",
        order_by="(CourtProceeding.held_on, CourtProceeding.id)",
        lazy="selectin",
    )
    lawyers: Mapped[list["CourtCaseLawyer"]] = relationship(
        back_populates="court_case",
        cascade="all, delete-orphan",
        order_by="CourtCaseLawyer.id",
        lazy="selectin",
    )


class CourtCaseParty(Base):
    """A person in a court case. Their NID, if the court has it, is kept only as a keyed hash."""

    __tablename__ = "court_case_parties"

    id: Mapped[int] = mapped_column(primary_key=True)
    court_case_id: Mapped[int] = mapped_column(
        ForeignKey("court_cases.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[CourtPartyRole] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(200))
    name_bn: Mapped[str | None] = mapped_column(String(200))
    father_name: Mapped[str | None] = mapped_column(String(200))
    age: Mapped[int | None] = mapped_column(Integer)
    # See models.party.hash_nid; matches Party.nid_hash and Prisoner.nid_hash.
    nid_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    nid_last4: Mapped[str | None] = mapped_column(String(4))

    court_case: Mapped[CourtCase] = relationship(back_populates="parties")


class CourtProceeding(Base):
    """What happened on one date in court, and the next date it fixed."""

    __tablename__ = "court_proceedings"

    id: Mapped[int] = mapped_column(primary_key=True)
    court_case_id: Mapped[int] = mapped_column(
        ForeignKey("court_cases.id", ondelete="CASCADE"), index=True
    )
    held_on: Mapped[date] = mapped_column(Date)
    kind: Mapped[ProceedingKind] = mapped_column(String(20))
    summary: Mapped[str] = mapped_column(Text)
    next_date: Mapped[date | None] = mapped_column(Date)
    # "For charge hearing", "For evidence".
    next_purpose: Mapped[str | None] = mapped_column(String(120))
    recorded_by: Mapped[str] = mapped_column(String(64))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    court_case: Mapped[CourtCase] = relationship(back_populates="proceedings")


class CourtCaseLawyer(Base):
    """A lawyer who appeared in the case, and for how long: the case's previous lawyers."""

    __tablename__ = "court_case_lawyers"

    id: Mapped[int] = mapped_column(primary_key=True)
    court_case_id: Mapped[int] = mapped_column(
        ForeignKey("court_cases.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    name_bn: Mapped[str | None] = mapped_column(String(200))
    side: Mapped[LawyerSide] = mapped_column(String(20))
    # Bar Council enrolment, when the court has it.
    enrolment: Mapped[str | None] = mapped_column(String(40))
    # Set when the lawyer is on the legal aid panel (services.panel).
    panel_lawyer_id: Mapped[str | None] = mapped_column(String(20))
    appeared_from: Mapped[date | None] = mapped_column(Date)
    # Empty while they still appear.
    appeared_until: Mapped[date | None] = mapped_column(Date)
    recorded_by: Mapped[str] = mapped_column(String(64))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    court_case: Mapped[CourtCase] = relationship(back_populates="lawyers")


class CauseListEntry(Base):
    """One line of a court's cause list: a case listed on a day, with its serial and purpose."""

    __tablename__ = "cause_list_entries"
    __table_args__ = (UniqueConstraint("court_id", "listed_on", "serial"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    court_id: Mapped[str] = mapped_column(String(20), index=True)
    listed_on: Mapped[date] = mapped_column(Date, index=True)
    serial: Mapped[int] = mapped_column(Integer)
    # "10:30", office time; empty when the court lists by serial only.
    time: Mapped[str | None] = mapped_column(String(5))
    case_number: Mapped[str] = mapped_column(String(60))
    number_key: Mapped[str] = mapped_column(String(80), index=True)
    purpose: Mapped[str] = mapped_column(String(120))
    judge: Mapped[str | None] = mapped_column(String(200))
    published_by: Mapped[str] = mapped_column(String(64))
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PrisonerStatus(StrEnum):
    UNDERTRIAL = "undertrial"
    CONVICTED = "convicted"
    RELEASED = "released"
    TRANSFERRED = "transferred"


class Prisoner(Base):
    """Someone held in a jail, with the court cases they are held on."""

    __tablename__ = "prisoners"
    __table_args__ = (UniqueConstraint("prison_id", "prisoner_no"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # services.prisons roster.
    prison_id: Mapped[str] = mapped_column(String(20), index=True)
    prisoner_no: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(200))
    name_bn: Mapped[str | None] = mapped_column(String(200))
    father_name: Mapped[str | None] = mapped_column(String(200))
    gender: Mapped[str | None] = mapped_column(String(10))
    age: Mapped[int | None] = mapped_column(Integer)
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    nid_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    nid_last4: Mapped[str | None] = mapped_column(String(4))
    # True once e-KYC matched them to the NID registry.
    nid_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    village: Mapped[str | None] = mapped_column(String(120))
    upazila: Mapped[str | None] = mapped_column(String(120))
    district: Mapped[str | None] = mapped_column(String(120))
    admitted_on: Mapped[date] = mapped_column(Date)
    status: Mapped[PrisonerStatus] = mapped_column(String(20), default=PrisonerStatus.UNDERTRIAL)
    ward: Mapped[str | None] = mapped_column(String(60))
    released_on: Mapped[date | None] = mapped_column(Date)

    created_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    cases: Mapped[list["PrisonerCase"]] = relationship(
        back_populates="prisoner",
        cascade="all, delete-orphan",
        order_by="PrisonerCase.id",
        lazy="selectin",
    )


class PrisonerCase(Base):
    """A court case a prisoner is held on, by court and number (see ``case_number_key``)."""

    __tablename__ = "prisoner_cases"
    __table_args__ = (UniqueConstraint("prisoner_id", "court_id", "number_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    prisoner_id: Mapped[int] = mapped_column(
        ForeignKey("prisoners.id", ondelete="CASCADE"), index=True
    )
    court_id: Mapped[str] = mapped_column(String(20))
    case_number: Mapped[str] = mapped_column(String(60))
    number_key: Mapped[str] = mapped_column(String(80), index=True)

    prisoner: Mapped[Prisoner] = relationship(back_populates="cases")


class CaseRecordLink(Base):
    """A legal aid case linked to a court case or a prisoner record.

    Made when a court or jail submits the application, or by an officer who
    finds the record for a case that came in another way (a mother calling the
    hotline about her son in jail). Only linked records are shown on the case.
    """

    __tablename__ = "case_record_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    court_case_id: Mapped[int | None] = mapped_column(
        ForeignKey("court_cases.id", ondelete="CASCADE"), index=True
    )
    prisoner_id: Mapped[int | None] = mapped_column(
        ForeignKey("prisoners.id", ondelete="CASCADE"), index=True
    )
    linked_by: Mapped[str] = mapped_column(String(64))
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class EkycResult(StrEnum):
    VERIFIED = "verified"
    # No such NID, or the date of birth or name did not match (the caller is not told which).
    NOT_MATCHED = "notMatched"
    # The NID registry could not be reached or is not configured.
    UNAVAILABLE = "unavailable"


class EkycCheck(Base):
    """One e-KYC check by court or jail staff: an NID and date of birth against the registry.

    A verified check carries the registry's record, so the application it is
    used for takes the person's details from the registry, never from the form.
    It can be used once, by the office that made it, within
    ``EKYC_CHECK_VALID_MINUTES``.
    """

    __tablename__ = "ekyc_checks"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Random and unguessable: the client refers to the check by it.
    check_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    # "court" or "prison", and the court or jail ID.
    office_kind: Mapped[str] = mapped_column(String(10))
    office_id: Mapped[str] = mapped_column(String(20))
    performed_by: Mapped[str] = mapped_column(String(64))
    # "nidDobName": NID number, date of birth and (if given) name, against the registry.
    method: Mapped[str] = mapped_column(String(20), default="nidDobName")
    result: Mapped[EkycResult] = mapped_column(String(20))
    nid_hash: Mapped[str | None] = mapped_column(String(64))
    nid_last4: Mapped[str | None] = mapped_column(String(4))
    # The registry record (services.nid_registry.Citizen), for a verified check only.
    citizen: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    used_for_case_id: Mapped[int | None] = mapped_column(
        ForeignKey("cases.id", ondelete="SET NULL")
    )
    used_for_prisoner_id: Mapped[int | None] = mapped_column(
        ForeignKey("prisoners.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class HelpNeeded(StrEnum):
    """What a court or jail asks legal aid for."""

    DEFENCE = "defence"
    BAIL = "bail"
    APPEAL = "appeal"
    FAMILY = "family"
    CIVIL = "civil"
    OTHER = "other"


class InstitutionApplication(Base):
    """A legal aid application a court or a jail submitted: who sent it, for what, and how
    the applicant was identified and signed. The case itself is an ordinary ``Case``."""

    __tablename__ = "institution_applications"

    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), unique=True, index=True
    )
    # "court" or "prison", and the court or jail ID: whose staff may see it.
    office_kind: Mapped[str] = mapped_column(String(10))
    office_id: Mapped[str] = mapped_column(String(20), index=True)
    staff_id: Mapped[str] = mapped_column(String(20))
    help_needed: Mapped[HelpNeeded] = mapped_column(String(20))
    in_custody: Mapped[bool] = mapped_column(Boolean, default=False)
    ekyc_check_id: Mapped[int | None] = mapped_column(
        ForeignKey("ekyc_checks.id", ondelete="SET NULL")
    )
    signature_document_id: Mapped[int | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL")
    )
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    ekyc_check: Mapped[EkycCheck | None] = relationship(lazy="joined")
