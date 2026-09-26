"""Jail staff API (prison-dashboard): the jail's prisoners, their court dates and the legal
aid applications it submits. See ``services.records``.

Staff sign in on prison-dashboard: requests name them in ``X-Prison-Staff-Id``
(``services.prisons``). A jail sees only its own prisoners and submissions; any other
record is a 404, so its ID is not confirmed. Of the courts it sees only what producing
its prisoners needs: each case's number, court, next date and cause list slots.
"""

from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    AuditAction,
    CauseListEntry,
    Prisoner,
    PrisonerCase,
    PrisonerStatus,
    record_audit,
)
from app.models.party import hash_nid
from app.routers import require_api_token
from app.services import ekyc
from app.services.courts import get_court
from app.services.prisons import PrisonStaff, get_prison_staff
from app.services.records import (
    IN_CUSTODY,
    court_ref,
    date_range,
    matching_prisoners,
    number_key_or_422,
    office_today,
    own_prisoner,
    prisoner_detail,
    prisoner_summaries,
)

router = APIRouter(prefix="/prison", tags=["prison"], dependencies=[Depends(require_api_token)])

# The production list: how far ahead it looks by default, and at most.
COURT_DATE_DAYS = 14
COURT_DATE_MAX_DAYS = 62


def current_prison_staff(x_prison_staff_id: str | None = Header(default=None)) -> PrisonStaff:
    staff = get_prison_staff(x_prison_staff_id or "")
    if staff is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Sign in with a jail staff ID (X-Prison-Staff-Id)"
        )
    return staff


def _stripped(value: str | None) -> str | None:
    return value.strip() or None if value is not None else None


@router.get("/me")
def me(staff: PrisonStaff = Depends(current_prison_staff)) -> dict[str, Any]:
    return staff.view()


class PrisonerCaseIn(BaseModel):
    court_id: str = Field(min_length=1, max_length=20)
    case_number: str = Field(min_length=1, max_length=60)


class PrisonerIn(BaseModel):
    prisoner_no: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=200)
    name_bn: str | None = Field(default=None, max_length=200)
    father_name: str | None = Field(default=None, max_length=200)
    gender: Literal["male", "female", "other"] | None = None
    age: int | None = Field(default=None, ge=0, le=120)
    # Kept only as a keyed hash and the last four digits.
    nid: str | None = Field(default=None, max_length=40)
    village: str | None = Field(default=None, max_length=120)
    upazila: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    admitted_on: date
    status: PrisonerStatus = PrisonerStatus.UNDERTRIAL
    ward: str | None = Field(default=None, max_length=60)
    cases: list[PrisonerCaseIn] = Field(default_factory=list, max_length=20)
    # A verified e-KYC check: the prisoner's identity then comes from the NID registry.
    ekyc_check_id: str | None = Field(default=None, max_length=64)

    @field_validator("nid")
    @classmethod
    def _nid(cls, value: str | None) -> str | None:
        return ekyc.normalize_nid(value) if value and value.strip() else None

    @field_validator("prisoner_no", "name")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class PrisonerPatch(BaseModel):
    status: PrisonerStatus | None = None
    ward: str | None = Field(default=None, max_length=60)
    released_on: date | None = None
    # Replaces the list.
    cases: list[PrisonerCaseIn] | None = Field(default=None, max_length=20)


def case_links(cases: list[PrisonerCaseIn]) -> list[PrisonerCase]:
    """The cases a prisoner is held on, once each; the court must be on the roster."""
    links: dict[tuple[str, str], PrisonerCase] = {}
    for c in cases:
        court = get_court(c.court_id)
        if court is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown court {c.court_id}"
            )
        key = number_key_or_422(c.case_number)
        links.setdefault(
            (court.id, key),
            PrisonerCase(court_id=court.id, case_number=c.case_number.strip(), number_key=key),
        )
    return list(links.values())


@router.get("/prisoners")
def list_prisoners(
    q: str = "",
    prisoner_status: PrisonerStatus | None = Query(None, alias="status"),
    include_released: bool = False,
    db: Session = Depends(get_db),
    staff: PrisonStaff = Depends(current_prison_staff),
) -> list[dict[str, Any]]:
    """The jail's prisoners, newest admission first; those still held unless asked."""
    query = select(Prisoner).where(Prisoner.prison_id == staff.prison_id)
    if q.strip():
        query = query.where(matching_prisoners(q))
    if prisoner_status is not None:
        query = query.where(Prisoner.status == prisoner_status)
    elif not include_released:
        query = query.where(Prisoner.status.in_(IN_CUSTODY))
    query = query.order_by(Prisoner.admitted_on.desc(), Prisoner.id.desc())
    return prisoner_summaries(db, db.scalars(query).all())


@router.post("/prisoners", status_code=status.HTTP_201_CREATED)
def admit_prisoner(
    body: PrisonerIn = Depends(ekyc.private_body(PrisonerIn)),
    db: Session = Depends(get_db),
    staff: PrisonStaff = Depends(current_prison_staff),
) -> dict[str, Any]:
    duplicate = db.scalars(
        select(Prisoner.id).where(
            Prisoner.prison_id == staff.prison_id, Prisoner.prisoner_no == body.prisoner_no
        )
    ).first()
    if duplicate is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"This jail already has prisoner {body.prisoner_no}"
        )
    if body.admitted_on > office_today():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "The admission date cannot be in the future"
        )
    links = case_links(body.cases)
    check = citizen = None
    if body.ekyc_check_id:
        check, citizen = ekyc.use_check(
            db, body.ekyc_check_id, office_kind="prison", office_id=staff.prison_id
        )
    prisoner = Prisoner(
        prison_id=staff.prison_id,
        prisoner_no=body.prisoner_no,
        name=body.name,
        name_bn=_stripped(body.name_bn),
        father_name=_stripped(body.father_name),
        gender=body.gender,
        age=body.age,
        village=_stripped(body.village),
        upazila=_stripped(body.upazila),
        district=_stripped(body.district),
        admitted_on=body.admitted_on,
        status=body.status,
        ward=_stripped(body.ward),
        created_by=staff.actor,
        cases=links,
    )
    if body.nid:
        prisoner.nid_hash, prisoner.nid_last4 = hash_nid(body.nid), body.nid[-4:]
    if citizen is not None:
        ekyc.fill_prisoner(prisoner, citizen)
    db.add(prisoner)
    db.flush()
    if check is not None:
        check.used_for_prisoner_id = prisoner.id
    record_audit(
        db,
        actor=staff.actor,
        action=AuditAction.RECORD_CREATED,
        entity_type="prisoner",
        entity_id=prisoner.id,
        details={
            "prison": staff.prison_id,
            "prisonerNo": prisoner.prisoner_no,
            "nidVerified": prisoner.nid_verified,
            **({"ekycCheckId": check.id} if check else {}),
        },
    )
    db.commit()
    return prisoner_detail(db, prisoner)


@router.get("/prisoners/{prisoner_id}")
def get_prisoner(
    prisoner_id: int,
    db: Session = Depends(get_db),
    staff: PrisonStaff = Depends(current_prison_staff),
) -> dict[str, Any]:
    return prisoner_detail(db, own_prisoner(db, staff.prison_id, prisoner_id))


@router.patch("/prisoners/{prisoner_id}")
def update_prisoner(
    prisoner_id: int,
    body: PrisonerPatch,
    db: Session = Depends(get_db),
    staff: PrisonStaff = Depends(current_prison_staff),
) -> dict[str, Any]:
    prisoner = own_prisoner(db, staff.prison_id, prisoner_id)
    fields = sorted(body.model_fields_set)
    if body.status is not None:
        prisoner.status = body.status
    if "ward" in body.model_fields_set:
        prisoner.ward = _stripped(body.ward)
    if "released_on" in body.model_fields_set:
        prisoner.released_on = body.released_on
    if prisoner.status == PrisonerStatus.RELEASED and prisoner.released_on is None:
        prisoner.released_on = office_today()
    if prisoner.released_on and prisoner.released_on < prisoner.admitted_on:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "The release date is before the admission"
        )
    if body.cases is not None:
        wanted = {(c.court_id, c.number_key): c for c in case_links(body.cases)}
        # Keep the rows that stay, so a case kept in the list is not deleted and re-added.
        kept = [c for c in prisoner.cases if (c.court_id, c.number_key) in wanted]
        have = {(c.court_id, c.number_key) for c in kept}
        prisoner.cases = kept + [c for k, c in wanted.items() if k not in have]
    if fields:
        record_audit(
            db,
            actor=staff.actor,
            action=AuditAction.RECORD_UPDATED,
            entity_type="prisoner",
            entity_id=prisoner.id,
            details={"fields": fields},
        )
    db.commit()
    db.refresh(prisoner)
    return prisoner_detail(db, prisoner)


@router.get("/court-dates")
def court_dates(
    start: date | None = Query(None, alias="from"),
    end: date | None = Query(None, alias="to"),
    db: Session = Depends(get_db),
    staff: PrisonStaff = Depends(current_prison_staff),
) -> list[dict[str, Any]]:
    """The production list: every court's cause list entries for the jail's prisoners."""
    start, end = date_range(start, end, days=COURT_DATE_DAYS, limit=COURT_DATE_MAX_DAYS)
    held: dict[tuple[str, str], list[Prisoner]] = {}
    for link, prisoner in db.execute(
        select(PrisonerCase, Prisoner)
        .join(Prisoner, Prisoner.id == PrisonerCase.prisoner_id)
        .where(Prisoner.prison_id == staff.prison_id, Prisoner.status.in_(IN_CUSTODY))
    ):
        held.setdefault((link.court_id, link.number_key), []).append(prisoner)
    if not held:
        return []
    entries = db.scalars(
        select(CauseListEntry).where(
            CauseListEntry.number_key.in_({k for _, k in held}),
            CauseListEntry.listed_on >= start,
            CauseListEntry.listed_on <= end,
        )
    )
    out = [
        {
            "date": e.listed_on.isoformat(),
            "time": e.time,
            "serial": e.serial,
            "purpose": e.purpose,
            "court": court_ref(e.court_id),
            "caseNumber": e.case_number,
            "prisoner": {
                "id": p.id,
                "prisonerNo": p.prisoner_no,
                "name": p.name,
                "nameBn": p.name_bn,
            },
        }
        for e in entries
        for p in held.get((e.court_id, e.number_key), [])
    ]
    return sorted(out, key=lambda d: (d["date"], d["time"] or "99:99", d["serial"]))


# --- e-KYC -----------------------------------------------------------------------------


@router.post("/ekyc")
def check_identity(
    body: ekyc.EkycIn = Depends(ekyc.private_body(ekyc.EkycIn)),
    db: Session = Depends(get_db),
    staff: PrisonStaff = Depends(current_prison_staff),
) -> dict[str, Any]:
    """Someone's NID and date of birth against the NID registry (``services.ekyc``)."""
    check = ekyc.run_check(
        db, body, office_kind="prison", office_id=staff.prison_id, actor=staff.actor
    )
    db.commit()
    return ekyc.check_view(check)
