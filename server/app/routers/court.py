"""Court staff API (court-dashboard): the court's register, cause lists and legal aid
applications it submits. See ``services.records``.

Staff sign in on court-dashboard, as officers and lawyers do on theirs: requests name
them in ``X-Court-Staff-Id`` (``services.courts``). A court sees only its own register,
cause lists and submissions; any other record is a 404, so its ID is not confirmed.
"""

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import get_db, utcnow
from app.models import (
    AuditAction,
    CauseListEntry,
    CourtCase,
    CourtCaseLawyer,
    CourtCaseParty,
    CourtCaseStatus,
    CourtCaseType,
    CourtPartyRole,
    CourtProceeding,
    LawyerSide,
    ProceedingKind,
    record_audit,
)
from app.models.party import hash_nid
from app.routers import require_api_token
from app.services import ekyc
from app.services.courts import CourtStaff, get_court_staff
from app.services.panel import get_lawyer
from app.services.records import (
    NEWEST_FILED,
    cause_list_view,
    court_case_detail,
    court_case_summaries,
    date_range,
    matching_court_cases,
    number_key_or_422,
    office_today,
    own_court_case,
)

router = APIRouter(prefix="/court", tags=["court"], dependencies=[Depends(require_api_token)])

# The overview of listed dates, and how far ahead it may reach.
CAUSE_LIST_DAYS = 30
CAUSE_LIST_MAX_DAYS = 92


def current_court_staff(x_court_staff_id: str | None = Header(default=None)) -> CourtStaff:
    staff = get_court_staff(x_court_staff_id or "")
    if staff is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Sign in with a court staff ID (X-Court-Staff-Id)"
        )
    return staff


def _stripped(value: str | None) -> str | None:
    return value.strip() or None if value is not None else None


@router.get("/me")
def me(staff: CourtStaff = Depends(current_court_staff)) -> dict[str, Any]:
    return staff.view()


# --- the register ------------------------------------------------------------------


class CourtPartyIn(BaseModel):
    role: CourtPartyRole
    name: str = Field(min_length=1, max_length=200)
    name_bn: str | None = Field(default=None, max_length=200)
    father_name: str | None = Field(default=None, max_length=200)
    age: int | None = Field(default=None, ge=0, le=120)
    # Kept only as a keyed hash and the last four digits.
    nid: str | None = Field(default=None, max_length=40)

    @field_validator("nid")
    @classmethod
    def _nid(cls, value: str | None) -> str | None:
        return ekyc.normalize_nid(value) if value and value.strip() else None


class CourtCaseIn(BaseModel):
    case_number: str = Field(min_length=1, max_length=60)
    case_type: CourtCaseType
    title: str = Field(min_length=3, max_length=300)
    sections: str | None = Field(default=None, max_length=300)
    filed_on: date | None = None
    status: CourtCaseStatus = CourtCaseStatus.PENDING
    restricted: bool = False
    parties: list[CourtPartyIn] = Field(min_length=1, max_length=30)

    @field_validator("case_number", "title")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class CourtCasePatch(BaseModel):
    status: CourtCaseStatus | None = None
    title: str | None = Field(default=None, min_length=3, max_length=300)
    sections: str | None = Field(default=None, max_length=300)
    restricted: bool | None = None


@router.get("/cases")
def list_cases(
    q: str = "",
    case_status: CourtCaseStatus | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    staff: CourtStaff = Depends(current_court_staff),
) -> list[dict[str, Any]]:
    query = select(CourtCase).where(CourtCase.court_id == staff.court_id)
    if q.strip():
        query = query.where(matching_court_cases(q))
    if case_status is not None:
        query = query.where(CourtCase.status == case_status)
    return court_case_summaries(db, db.scalars(query.order_by(*NEWEST_FILED)).all())


@router.post("/cases", status_code=status.HTTP_201_CREATED)
def register_case(
    body: CourtCaseIn = Depends(ekyc.private_body(CourtCaseIn)),
    db: Session = Depends(get_db),
    staff: CourtStaff = Depends(current_court_staff),
) -> dict[str, Any]:
    key = number_key_or_422(body.case_number)
    duplicate = db.scalars(
        select(CourtCase.id).where(
            CourtCase.court_id == staff.court_id, CourtCase.number_key == key
        )
    ).first()
    if duplicate is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"This court already has case {body.case_number}"
        )
    if body.filed_on and body.filed_on > office_today():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "The filing date cannot be in the future"
        )
    court_case = CourtCase(
        court_id=staff.court_id,
        case_number=body.case_number,
        number_key=key,
        case_type=body.case_type,
        title=body.title,
        sections=_stripped(body.sections),
        filed_on=body.filed_on,
        status=body.status,
        restricted=body.restricted,
        created_by=staff.actor,
        parties=[
            CourtCaseParty(
                role=p.role,
                name=p.name.strip(),
                name_bn=_stripped(p.name_bn),
                father_name=_stripped(p.father_name),
                age=p.age,
                nid_hash=hash_nid(p.nid) if p.nid else None,
                nid_last4=p.nid[-4:] if p.nid else None,
            )
            for p in body.parties
        ],
    )
    db.add(court_case)
    db.flush()
    record_audit(
        db,
        actor=staff.actor,
        action=AuditAction.RECORD_CREATED,
        entity_type="courtCase",
        entity_id=court_case.id,
        details={"court": staff.court_id, "caseNumber": court_case.case_number},
    )
    db.commit()
    return court_case_detail(db, court_case)


@router.get("/cases/{case_id}")
def get_case(
    case_id: int, db: Session = Depends(get_db), staff: CourtStaff = Depends(current_court_staff)
) -> dict[str, Any]:
    return court_case_detail(db, own_court_case(db, staff.court_id, case_id))


def _audit_update(db: Session, staff: CourtStaff, court_case: CourtCase, **details: Any) -> None:
    record_audit(
        db,
        actor=staff.actor,
        action=AuditAction.RECORD_UPDATED,
        entity_type="courtCase",
        entity_id=court_case.id,
        details=details,
    )


@router.patch("/cases/{case_id}")
def update_case(
    case_id: int,
    body: CourtCasePatch,
    db: Session = Depends(get_db),
    staff: CourtStaff = Depends(current_court_staff),
) -> dict[str, Any]:
    court_case = own_court_case(db, staff.court_id, case_id)
    changes = body.model_dump(exclude_unset=True)
    for field in ("status", "restricted", "title"):
        if changes.get(field) is None:
            changes.pop(field, None)
    if "title" in changes:
        changes["title"] = changes["title"].strip()
    if "sections" in changes:
        changes["sections"] = _stripped(changes["sections"])
    for field, value in changes.items():
        setattr(court_case, field, value)
    if changes:
        _audit_update(db, staff, court_case, fields=sorted(changes))
    db.commit()
    return court_case_detail(db, court_case)


class ProceedingIn(BaseModel):
    held_on: date
    kind: ProceedingKind
    summary: str = Field(min_length=10, max_length=2000)
    next_date: date | None = None
    next_purpose: str | None = Field(default=None, max_length=120)


@router.post("/cases/{case_id}/proceedings", status_code=status.HTTP_201_CREATED)
def record_proceeding(
    case_id: int,
    body: ProceedingIn,
    db: Session = Depends(get_db),
    staff: CourtStaff = Depends(current_court_staff),
) -> dict[str, Any]:
    """What happened on a date, and the next date the court fixed. A judgment ends the case."""
    court_case = own_court_case(db, staff.court_id, case_id)
    if body.held_on > office_today():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "The hearing date cannot be in the future"
        )
    if body.kind == ProceedingKind.JUDGMENT and body.next_date is not None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A judgment has no next date")
    if body.next_date is not None and body.next_date <= body.held_on:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "The next date must be after the hearing"
        )
    proceeding = CourtProceeding(
        held_on=body.held_on,
        kind=body.kind,
        summary=body.summary.strip(),
        next_date=body.next_date,
        next_purpose=_stripped(body.next_purpose),
        recorded_by=staff.actor,
        recorded_at=utcnow(),
    )
    court_case.proceedings.append(proceeding)
    if body.kind == ProceedingKind.JUDGMENT:
        court_case.status = CourtCaseStatus.DISPOSED
    db.flush()
    _audit_update(db, staff, court_case, proceedingId=proceeding.id, kind=body.kind)
    db.commit()
    db.refresh(court_case)
    return court_case_detail(db, court_case)


class CourtLawyerIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    name_bn: str | None = Field(default=None, max_length=200)
    side: LawyerSide
    enrolment: str | None = Field(default=None, max_length=40)
    panel_lawyer_id: str | None = Field(default=None, max_length=20)
    appeared_from: date | None = Field(default=None, alias="from")


class LawyerEndIn(BaseModel):
    until: date


@router.post("/cases/{case_id}/lawyers", status_code=status.HTTP_201_CREATED)
def add_lawyer(
    case_id: int,
    body: CourtLawyerIn,
    db: Session = Depends(get_db),
    staff: CourtStaff = Depends(current_court_staff),
) -> dict[str, Any]:
    court_case = own_court_case(db, staff.court_id, case_id)
    panel_id = None
    if body.panel_lawyer_id and body.panel_lawyer_id.strip():
        panel = get_lawyer(body.panel_lawyer_id)
        if panel is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"{body.panel_lawyer_id} is not on the legal aid panel",
            )
        panel_id = panel.id
    lawyer = CourtCaseLawyer(
        name=body.name.strip(),
        name_bn=_stripped(body.name_bn),
        side=body.side,
        enrolment=_stripped(body.enrolment),
        panel_lawyer_id=panel_id,
        appeared_from=body.appeared_from,
        recorded_by=staff.actor,
        recorded_at=utcnow(),
    )
    court_case.lawyers.append(lawyer)
    db.flush()
    _audit_update(db, staff, court_case, lawyerId=lawyer.id, side=body.side)
    db.commit()
    db.refresh(court_case)
    return court_case_detail(db, court_case)


@router.post("/cases/{case_id}/lawyers/{lawyer_id}/end")
def end_lawyer(
    case_id: int,
    lawyer_id: int,
    body: LawyerEndIn,
    db: Session = Depends(get_db),
    staff: CourtStaff = Depends(current_court_staff),
) -> dict[str, Any]:
    """The lawyer no longer appears (withdrew, was replaced, or the case ended)."""
    court_case = own_court_case(db, staff.court_id, case_id)
    lawyer = next((x for x in court_case.lawyers if x.id == lawyer_id), None)
    if lawyer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No lawyer {lawyer_id} on this case")
    if lawyer.appeared_until is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This lawyer's appearance has already ended")
    if lawyer.appeared_from and body.until < lawyer.appeared_from:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "The end date is before the lawyer first appeared",
        )
    lawyer.appeared_until = body.until
    _audit_update(db, staff, court_case, lawyerId=lawyer.id, until=body.until.isoformat())
    db.commit()
    return court_case_detail(db, court_case)


# --- cause lists -------------------------------------------------------------------


@router.get("/cause-lists")
def cause_list_dates(
    start: date | None = Query(None, alias="from"),
    end: date | None = Query(None, alias="to"),
    db: Session = Depends(get_db),
    staff: CourtStaff = Depends(current_court_staff),
) -> list[dict[str, Any]]:
    """The dates this court has listed cases for, with how many."""
    start, end = date_range(start, end, days=CAUSE_LIST_DAYS, limit=CAUSE_LIST_MAX_DAYS)
    counts: dict[date, int] = {}
    for day in db.scalars(
        select(CauseListEntry.listed_on).where(
            CauseListEntry.court_id == staff.court_id,
            CauseListEntry.listed_on >= start,
            CauseListEntry.listed_on <= end,
        )
    ):
        counts[day] = counts.get(day, 0) + 1
    return [{"date": day.isoformat(), "entries": n} for day, n in sorted(counts.items())]


@router.get("/cause-lists/{day}")
def get_cause_list(
    day: date, db: Session = Depends(get_db), staff: CourtStaff = Depends(current_court_staff)
) -> dict[str, Any]:
    return cause_list_view(db, staff.court_id, day)


class CauseListEntryIn(BaseModel):
    serial: int = Field(ge=1, le=999)
    time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    case_number: str = Field(min_length=1, max_length=60)
    purpose: str = Field(min_length=1, max_length=120)

    @field_validator("case_number", "purpose")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class CauseListIn(BaseModel):
    judge: str | None = Field(default=None, max_length=200)
    entries: list[CauseListEntryIn] = Field(default_factory=list, max_length=300)

    @model_validator(mode="after")
    def _unique_serials(self) -> "CauseListIn":
        serials = [e.serial for e in self.entries]
        if len(serials) != len(set(serials)):
            raise ValueError("Each serial may appear only once")
        return self


@router.put("/cause-lists/{day}")
def publish_cause_list(
    day: date,
    body: CauseListIn,
    db: Session = Depends(get_db),
    staff: CourtStaff = Depends(current_court_staff),
) -> dict[str, Any]:
    """Replace the court's list for the day; an empty list withdraws it.

    Cases the court has not registered yet can be listed: they link once it does.
    """
    keys = [number_key_or_422(e.case_number) for e in body.entries]
    # Deleted first, so the new serials do not collide with the old ones.
    db.execute(
        delete(CauseListEntry).where(
            CauseListEntry.court_id == staff.court_id, CauseListEntry.listed_on == day
        )
    )
    now = utcnow()
    judge = _stripped(body.judge)
    for entry, key in zip(body.entries, keys, strict=True):
        db.add(
            CauseListEntry(
                court_id=staff.court_id,
                listed_on=day,
                serial=entry.serial,
                time=entry.time,
                case_number=entry.case_number,
                number_key=key,
                purpose=entry.purpose,
                judge=judge,
                published_by=staff.actor,
                published_at=now,
            )
        )
    db.flush()
    record_audit(
        db,
        actor=staff.actor,
        action=AuditAction.CAUSE_LIST_PUBLISHED,
        entity_type="causeList",
        entity_id=f"{staff.court_id}:{day.isoformat()}",
        details={"date": day.isoformat(), "entries": len(body.entries)},
    )
    db.commit()
    return cause_list_view(db, staff.court_id, day)


# --- e-KYC -----------------------------------------------------------------------------


@router.post("/ekyc")
def check_identity(
    body: ekyc.EkycIn = Depends(ekyc.private_body(ekyc.EkycIn)),
    db: Session = Depends(get_db),
    staff: CourtStaff = Depends(current_court_staff),
) -> dict[str, Any]:
    """Someone's NID and date of birth against the NID registry (``services.ekyc``)."""
    check = ekyc.run_check(
        db, body, office_kind="court", office_id=staff.court_id, actor=staff.actor
    )
    db.commit()
    return ekyc.check_view(check)
