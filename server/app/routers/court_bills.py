"""The court's decision on panel lawyers' bills (court-dashboard).

A bill a lawyer submits (``routers.lawyer_bills``) comes to the court that heard
the case. The court reads each line against the fee schedule
(``services.gazette``) and either allows it, cuts it with a reason, sends the
whole bill back for correction, or rejects it. A verified bill is then released
for payment against a voucher number, which is what NLASO's
এল.এ. ফরম-১৮ (আইনজীবীর ফি প্রদান রেজিস্টার) records.

Mounted on ``/court`` beside ``routers.court`` and signing in the same way
(``X-Court-Staff-Id``). A court sees only the bills sent to it; another court's
bill, and any lawyer's draft, is a 404, so its number is not confirmed.
"""

from collections import Counter
from collections.abc import Sequence
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db, utcnow
from app.models import AuditAction, Bill, BillStatus, record_audit
from app.routers import require_api_token
from app.routers.court import current_court_staff
from app.routers.dlao import JustificationIn
from app.services.bills import COURT_VISIBLE, bill_totals, bill_view
from app.services.courts import CourtStaff
from app.services.gazette import totals

router = APIRouter(prefix="/court", tags=["court"], dependencies=[Depends(require_api_token)])

# How much of a reason a cut line needs: a figure changed without one is not a decision.
MIN_CUT_REASON = 10

CAMEL = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def stripped(value: str | None) -> str | None:
    return value.strip() or None if value is not None else None


def court_bill(db: Session, number: str, staff: CourtStaff) -> Bill:
    """A bill sent to this court. Another court's, or a draft, is a 404."""
    bill = db.scalars(select(Bill).where(Bill.bill_number == number)).first()
    if bill is None or bill.court_id != staff.court.id or bill.status not in COURT_VISIBLE:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No bill {number}")
    return bill


def submitted_or_409(bill: Bill) -> None:
    if bill.status != BillStatus.SUBMITTED:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"This bill is {bill.status}, not waiting for the court"
        )


@router.get("/bills")
def bills_for_this_court(
    db: Session = Depends(get_db), staff: CourtStaff = Depends(current_court_staff)
) -> dict[str, Any]:
    """The bills sent to this court, the ones waiting longest first."""
    bills = db.scalars(
        select(Bill)
        .where(Bill.court_id == staff.court.id, Bill.status.in_(COURT_VISIBLE))
        .order_by(Bill.submitted_at, Bill.id)
    ).all()
    return {"bills": [bill_view(db, bill) for bill in bills], "totals": bill_totals(bills)}


@router.get("/bills/{number}")
def get_bill(
    number: str,
    db: Session = Depends(get_db),
    staff: CourtStaff = Depends(current_court_staff),
) -> dict[str, Any]:
    return bill_view(db, court_bill(db, number, staff))


class VerifyLineIn(BaseModel):
    model_config = CAMEL

    id: int
    # Range and reason are checked against the line, and reported together.
    allowed_taka: int = Field(le=1_000_000)
    disallowed_reason: str | None = Field(default=None, max_length=2000)


class VerifyIn(BaseModel):
    model_config = CAMEL

    lines: list[VerifyLineIn] = Field(min_length=1, max_length=200)
    note: str | None = Field(default=None, max_length=2000)


def verify_issues(bill: Bill, decisions: Sequence[VerifyLineIn]) -> list[str]:
    """Why this decision cannot stand: every line decided once, in range, and cuts explained."""
    on_bill = {line.id: line for line in bill.lines}
    decided = Counter(d.id for d in decisions)
    issues = []
    for line_id, times in sorted(decided.items()):
        if line_id not in on_bill:
            issues.append(f"Line {line_id} is not on this bill")
        elif times > 1:
            issues.append(f"Line {line_id} is decided {times} times; decide each line once")
    for line_id in sorted(set(on_bill) - set(decided)):
        issues.append(f"Line {line_id} ({on_bill[line_id].description}) has no decision")
    for decision in decisions:
        line = on_bill.get(decision.id)
        if line is None:
            continue
        if decision.allowed_taka < 0 or decision.allowed_taka > line.claimed_taka:
            issues.append(
                f"Line {line.id}: allow between 0 and the {line.claimed_taka} taka claimed, "
                f"not {decision.allowed_taka}"
            )
        elif decision.allowed_taka < line.claimed_taka and (
            len((decision.disallowed_reason or "").strip()) < MIN_CUT_REASON
        ):
            issues.append(
                f"Line {line.id}: say in at least {MIN_CUT_REASON} characters why the "
                f"{line.claimed_taka} taka claimed was cut to {decision.allowed_taka}"
            )
    return issues


@router.post("/bills/{number}/verify")
def verify_bill(
    number: str,
    body: VerifyIn,
    db: Session = Depends(get_db),
    staff: CourtStaff = Depends(current_court_staff),
) -> dict[str, Any]:
    """Allow or cut each line. A line cut below what was claimed needs a reason."""
    bill = court_bill(db, number, staff)
    submitted_or_409(bill)
    issues = verify_issues(bill, body.lines)
    if issues:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, {"issues": issues})
    decided = {d.id: d for d in body.lines}
    for line in bill.lines:
        decision = decided[line.id]
        line.allowed_taka = decision.allowed_taka
        # A line allowed in full carries no reason, whatever was typed.
        line.disallowed_reason = (
            stripped(decision.disallowed_reason)
            if decision.allowed_taka < line.claimed_taka
            else None
        )
    sums = totals(bill.lines)
    bill.status = BillStatus.VERIFIED
    bill.decided_at = utcnow()
    bill.decided_by = staff.actor
    bill.decision_note = stripped(body.note)
    record_audit(
        db,
        actor=staff.actor,
        action=AuditAction.BILL_VERIFIED,
        entity_type="bill",
        entity_id=bill.id,
        details={
            "bill": bill.bill_number,
            "claimedTaka": sums["claimed"],
            "allowedTaka": sums["allowed"],
        },
    )
    db.commit()
    return bill_view(db, bill)


@router.post("/bills/{number}/return")
def return_bill(
    number: str,
    body: JustificationIn,
    db: Session = Depends(get_db),
    staff: CourtStaff = Depends(current_court_staff),
) -> dict[str, Any]:
    """Send the bill back for correction; the lawyer can edit it and submit it again."""
    bill = court_bill(db, number, staff)
    submitted_or_409(bill)
    reason = body.justification.strip()
    bill.status = BillStatus.RETURNED
    # Nothing is decided on a bill going back: the lines start again from the claim.
    for line in bill.lines:
        line.allowed_taka = None
        line.disallowed_reason = None
    # Kept so the lawyer reads why it came back, not only the ledger.
    bill.decision_note = reason
    record_audit(
        db,
        actor=staff.actor,
        action=AuditAction.BILL_RETURNED,
        entity_type="bill",
        entity_id=bill.id,
        details={"bill": bill.bill_number},
        justification=reason,
    )
    db.commit()
    return bill_view(db, bill)


@router.post("/bills/{number}/reject")
def reject_bill(
    number: str,
    body: JustificationIn,
    db: Session = Depends(get_db),
    staff: CourtStaff = Depends(current_court_staff),
) -> dict[str, Any]:
    """Refuse the bill outright; nothing is paid on it."""
    bill = court_bill(db, number, staff)
    submitted_or_409(bill)
    reason = body.justification.strip()
    bill.status = BillStatus.REJECTED
    bill.decided_at = utcnow()
    bill.decided_by = staff.actor
    bill.decision_note = reason
    record_audit(
        db,
        actor=staff.actor,
        action=AuditAction.BILL_REJECTED,
        entity_type="bill",
        entity_id=bill.id,
        details={"bill": bill.bill_number, "claimedTaka": totals(bill.lines)["claimed"]},
        justification=reason,
    )
    db.commit()
    return bill_view(db, bill)


class ReleaseIn(BaseModel):
    model_config = CAMEL

    voucher_number: str = Field(min_length=1, max_length=64)


@router.post("/bills/{number}/release")
def release_bill(
    number: str,
    body: ReleaseIn,
    db: Session = Depends(get_db),
    staff: CourtStaff = Depends(current_court_staff),
) -> dict[str, Any]:
    """Release the allowed amount for payment against a voucher number (এল.এ. ফরম-১৮)."""
    bill = court_bill(db, number, staff)
    if bill.status != BillStatus.VERIFIED:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"This bill is {bill.status}: verify each line before releasing the money",
        )
    bill.voucher_number = body.voucher_number.strip()
    bill.released_at = utcnow()
    bill.released_by = staff.actor
    bill.status = BillStatus.RELEASED
    record_audit(
        db,
        actor=staff.actor,
        action=AuditAction.BILL_RELEASED,
        entity_type="bill",
        entity_id=bill.id,
        details={
            "bill": bill.bill_number,
            "voucherNumber": bill.voucher_number,
            "allowedTaka": totals(bill.lines)["allowed"],
        },
    )
    db.commit()
    return bill_view(db, bill)
