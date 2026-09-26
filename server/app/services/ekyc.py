"""e-KYC for court and jail staff: an NID and date of birth checked against the NID registry.

Staff check the person in front of them (someone in the dock, a prisoner at the legal
aid desk) before they submit an application or register a prisoner. A verified check
keeps the registry's record, so whatever it is used for takes the person's details
from the registry, never from the form. It can be used once, by the office that made
it, within ``EKYC_CHECK_VALID_MINUTES``. A check that fails never says which detail
did not match: staff could otherwise guess a date of birth one field at a time.

The full NID is never returned, logged or audited: only its keyed hash and last four
digits are kept outside the stored registry record.
"""

import re
import secrets
from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

from fastapi import Body, HTTPException, status
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.spoken import name_similarity
from app.config import get_settings
from app.database import as_utc, utcnow
from app.models import AuditAction, EkycCheck, EkycResult, Prisoner, record_audit
from app.models.party import hash_nid
from app.services.nid_registry import Citizen, NidRegistry, default_registry

# spoken.name_similarity (0-100): staff type names the registry may spell differently.
NAME_MATCH = 80
NID_LENGTHS = (10, 13, 17)
_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

UNUSABLE = "This e-KYC check has expired or was already used"


def normalize_nid(raw: str) -> str:
    """The NID's digits. Spaces, dashes and Bangla digits are fine; 10, 13 or 17 digits."""
    text = raw.translate(_BN_DIGITS).strip()
    if not re.fullmatch(r"[0-9][0-9 \-]*", text):
        raise ValueError("An NID is written in digits")
    digits = re.sub(r"\D", "", text)
    if len(digits) not in NID_LENGTHS:
        raise ValueError("An NID has 10, 13 or 17 digits")
    return digits


def private_body[M: BaseModel](model: type[M]) -> Callable[..., M]:
    """A JSON body read into ``model`` whose 422 does not echo what was sent.

    FastAPI's validation errors repeat the input, and these bodies carry an NID.
    """

    def parse(body: dict[str, Any] = Body(...)) -> M:
        try:
            return model.model_validate(body)
        except ValidationError as exc:
            errors = exc.errors(include_url=False, include_context=False, include_input=False)
            detail = [{**e, "loc": ["body", *e["loc"]]} for e in errors]
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail) from None

    return parse


class EkycIn(BaseModel):
    nid: str = Field(max_length=40)
    date_of_birth: date
    name: str | None = Field(default=None, max_length=200)

    @field_validator("nid")
    @classmethod
    def _nid(cls, value: str) -> str:
        return normalize_nid(value)


def registry() -> NidRegistry | None:
    """The registry checks go to (tests replace this with a fake)."""
    return default_registry()


def _look_up(reg: NidRegistry, nid: str) -> tuple[bool, Citizen | None]:
    """(the registry answered, the record, if it holds the NID)."""
    found = reg.lookup(nid)
    if found is None:
        return False, None
    return True, None if found == "notHeld" else found


def matches(citizen: Citizen, body: EkycIn) -> bool:
    if citizen.date_of_birth != body.date_of_birth:
        return False
    name = (body.name or "").strip()
    return not name or name_similarity(name, citizen.name.en, citizen.name.bn) >= NAME_MATCH


def run_check(
    db: Session, body: EkycIn, *, office_kind: str, office_id: str, actor: str
) -> EkycCheck:
    """Check the NID and date of birth (and name, if given); store and audit the result."""
    reg = registry()
    answered, citizen = _look_up(reg, body.nid) if reg is not None else (False, None)
    if not answered:
        result = EkycResult.UNAVAILABLE
    elif citizen is not None and matches(citizen, body):
        result = EkycResult.VERIFIED
    else:
        result = EkycResult.NOT_MATCHED
    verified = citizen if result == EkycResult.VERIFIED else None
    check = EkycCheck(
        check_id=secrets.token_hex(16),
        office_kind=office_kind,
        office_id=office_id,
        performed_by=actor,
        result=result,
        nid_hash=hash_nid(body.nid),
        nid_last4=body.nid[-4:],
        citizen=verified.model_dump(mode="json") if verified is not None else None,
    )
    db.add(check)
    db.flush()
    record_audit(
        db,
        actor=actor,
        action=AuditAction.EKYC_CHECKED,
        entity_type="ekyc",
        entity_id=check.id,
        details={"result": result, "nidLast4": check.nid_last4, "office": office_id},
    )
    return check


def person_view(citizen: Citizen) -> dict[str, Any]:
    home = citizen.present_address
    return {
        "name": citizen.name.en,
        "nameBn": citizen.name.bn,
        "fatherName": citizen.father.name.en,
        "fatherNameBn": citizen.father.name.bn,
        "motherName": citizen.mother.name.en,
        "dateOfBirth": citizen.date_of_birth.isoformat(),
        "gender": citizen.gender,
        "age": citizen.age_on(utcnow().astimezone(get_settings().tz).date()),
        "village": home.village.en,
        "upazila": home.upazila.en,
        "district": home.district.en,
        "nidLast4": citizen.nid[-4:],
    }


def check_view(check: EkycCheck) -> dict[str, Any]:
    verified = check.result == EkycResult.VERIFIED and check.citizen is not None
    return {
        # Nothing to refer to when the registry could not be asked.
        "checkId": None if check.result == EkycResult.UNAVAILABLE else check.check_id,
        "status": check.result,
        "person": person_view(Citizen.model_validate(check.citizen)) if verified else None,
    }


def use_check(
    db: Session, check_id: str, *, office_kind: str, office_id: str
) -> tuple[EkycCheck, Citizen]:
    """A verified, unused, fresh check made by this office, and its registry record.

    The caller marks it used (``used_for_case_id`` / ``used_for_prisoner_id``).
    """
    check = db.scalars(
        select(EkycCheck).where(EkycCheck.check_id == check_id.strip()).with_for_update()
    ).first()
    valid_for = timedelta(minutes=get_settings().ekyc_check_valid_minutes)
    usable = (
        check is not None
        and check.result == EkycResult.VERIFIED
        and check.citizen is not None
        and (check.office_kind, check.office_id) == (office_kind, office_id)
        and check.used_for_case_id is None
        and check.used_for_prisoner_id is None
        and as_utc(check.created_at) + valid_for > utcnow()
    )
    if not usable or check is None or check.citizen is None:
        raise HTTPException(status.HTTP_409_CONFLICT, UNUSABLE)
    return check, Citizen.model_validate(check.citizen)


def fill_prisoner(prisoner: Prisoner, citizen: Citizen) -> None:
    """Take a prisoner's identity from their NID record, as e-KYC found it."""
    home = citizen.present_address
    prisoner.name, prisoner.name_bn = citizen.name.en, citizen.name.bn
    prisoner.father_name = citizen.father.name.en
    prisoner.date_of_birth = citizen.date_of_birth
    prisoner.age = citizen.age_on(utcnow().astimezone(get_settings().tz).date())
    prisoner.gender = citizen.gender
    prisoner.village, prisoner.upazila = home.village.en, home.upazila.en
    prisoner.district = home.district.en
    prisoner.nid_hash, prisoner.nid_last4 = hash_nid(citizen.nid), citizen.nid[-4:]
    prisoner.nid_verified = True
