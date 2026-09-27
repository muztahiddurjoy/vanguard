"""A panel lawyer's bills (lawyer-dashboard): what a closed case cost, itemised and claimed.

Once a case is closed the lawyer who took it to court claims what it cost them:
one line per item under a head of the fee schedule (``services.gazette``, which
is NLASO's এল.এ. ফরম-১১ in practice). Saving replaces every line, so the draft
is whatever was last saved; submitting hands it to the court, which allows or
disallows each line and then releases it for payment (``routers.court_bills``).
A bill the court sends back can be corrected and submitted again.

Mounted on ``/lawyer`` beside ``routers.lawyer``, mounting a second router on an
existing prefix as ``routers.records`` does on ``/dlao``, and signs in the same
way: ``X-Lawyer-Id``, which must be on the panel.
"""

from collections.abc import Sequence
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db, utcnow
from app.models import (
    AuditAction,
    Bill,
    BillHead,
    BillLine,
    BillStatus,
    CaseStatus,
    next_reference,
    record_audit,
)
from app.routers import require_api_token
from app.routers.lawyer import current_lawyer, own_case
from app.services import gazette
from app.services.bills import bill_totals, bill_view, billable_cases, linked_court_id
from app.services.courts import get_court
from app.services.panel import PanelLawyer

router = APIRouter(prefix="/lawyer", tags=["lawyer"], dependencies=[Depends(require_api_token)])

# At most this many lines on one bill: a long trial, not an unbounded request.
MAX_LINES = 80

# The dashboards speak camelCase, so the bill bodies they send do too.
CAMEL = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def stripped(value: str | None) -> str | None:
    return value.strip() or None if value is not None else None


def own_bill(db: Session, number: str, lawyer: PanelLawyer) -> Bill:
    """This lawyer's bill. Another lawyer's is a 404, so its number is not confirmed."""
    bill = db.scalars(select(Bill).where(Bill.bill_number == number)).first()
    if bill is None or bill.lawyer_id != lawyer.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No bill {number}")
    return bill


def editable_or_409(bill: Bill) -> None:
    if bill.status not in (BillStatus.DRAFT, BillStatus.RETURNED):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"This bill is {bill.status}; only a draft or a returned bill can be changed",
        )


@router.get("/bills/schedule")
def fee_schedule(_: PanelLawyer = Depends(current_lawyer)) -> dict[str, Any]:
    """The ceilings a bill is checked against, and which heads need a receipt."""
    return gazette.schedule_view()


@router.get("/bills")
def my_bills(
    db: Session = Depends(get_db), lawyer: PanelLawyer = Depends(current_lawyer)
) -> dict[str, Any]:
    """This lawyer's bills, the closed cases they can still claim for, and the totals."""
    bills = db.scalars(select(Bill).where(Bill.lawyer_id == lawyer.id).order_by(Bill.id)).all()
    return {
        "bills": [bill_view(db, bill) for bill in bills],
        "billable": billable_cases(db, lawyer.id),
        "totals": bill_totals(bills),
    }


class BillStartIn(BaseModel):
    model_config = CAMEL

    # Needed only when no court record is linked to the case.
    court_id: str | None = Field(default=None, max_length=20)
    note: str | None = Field(default=None, max_length=2000)


@router.post("/cases/{ref}/bill", status_code=status.HTTP_201_CREATED)
def start_bill(
    ref: str,
    body: BillStartIn,
    db: Session = Depends(get_db),
    lawyer: PanelLawyer = Depends(current_lawyer),
) -> dict[str, Any]:
    """Start the bill for a closed case. What a case cost is claimed once, as one bill."""
    case = own_case(db, ref, lawyer)
    if case.status != CaseStatus.CLOSED:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"The case is {case.status}: a bill is claimed once the case is closed",
        )
    existing = db.scalars(select(Bill.bill_number).where(Bill.case_id == case.id)).first()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This case already has bill {existing}")

    # The court that heard it, from the linked court record; the lawyer names it otherwise.
    court_id = stripped(body.court_id) or linked_court_id(db, case)
    if court_id is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "No court record is linked to this case: say which court heard it (courtId)",
        )
    court = get_court(court_id)
    if court is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"{court_id} is not a court of this district"
        )

    bill = Bill(
        bill_number=next_reference(db, "BILL", utcnow().year),
        case_id=case.id,
        case=case,
        lawyer_id=lawyer.id,
        court_id=court.id,
        status=BillStatus.DRAFT,
        schedule_version=gazette.SCHEDULE_VERSION,
        note=stripped(body.note),
    )
    db.add(bill)
    db.flush()
    record_audit(
        db,
        actor=lawyer.id,
        action=AuditAction.BILL_DRAFTED,
        entity_type="bill",
        entity_id=bill.id,
        details={
            "bill": bill.bill_number,
            "case": case.display_id,
            "court": court.id,
            "scheduleVersion": bill.schedule_version,
        },
    )
    db.commit()
    return bill_view(db, bill)


@router.get("/bills/{number}")
def my_bill(
    number: str, db: Session = Depends(get_db), lawyer: PanelLawyer = Depends(current_lawyer)
) -> dict[str, Any]:
    return bill_view(db, own_bill(db, number, lawyer))


class BillLineIn(BaseModel):
    model_config = CAMEL

    head: BillHead
    # Length only: a blank description is reported with the other line problems.
    description: str = Field(max_length=300)
    incurred_on: date
    claimed_taka: int = Field(le=1_000_000)
    voucher_ref: str | None = Field(default=None, max_length=80)


def claims_of(lines: Sequence[BillLineIn] | Sequence[BillLine]) -> list[gazette.Claim]:
    """The lines of a bill, saved or about to be, as the schedule checks them."""
    return [
        gazette.Claim(BillHead(line.head), line.claimed_taka, line.voucher_ref, line.description)
        for line in lines
    ]


class BillLinesIn(BaseModel):
    model_config = CAMEL

    note: str | None = Field(default=None, max_length=2000)
    lines: list[BillLineIn] = Field(default_factory=list, max_length=MAX_LINES)


@router.put("/bills/{number}")
def save_bill(
    number: str,
    body: BillLinesIn,
    db: Session = Depends(get_db),
    lawyer: PanelLawyer = Depends(current_lawyer),
) -> dict[str, Any]:
    """Replace every line on the bill. A bill the court sent back goes back to draft."""
    bill = own_bill(db, number, lawyer)
    editable_or_409(bill)
    issues = gazette.claim_issues(claims_of(body.lines))
    if issues:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, {"issues": issues})
    bill.lines = [
        BillLine(
            head=line.head,
            description=line.description.strip(),
            incurred_on=line.incurred_on,
            claimed_taka=line.claimed_taka,
            voucher_ref=stripped(line.voucher_ref),
        )
        for line in body.lines
    ]
    bill.note = stripped(body.note)
    # Redone from the start: the court's earlier reason no longer describes this bill.
    bill.status = BillStatus.DRAFT
    bill.decided_at = None
    bill.decided_by = None
    bill.decision_note = None
    db.commit()
    return bill_view(db, bill)


@router.post("/bills/{number}/submit")
def submit_bill(
    number: str, db: Session = Depends(get_db), lawyer: PanelLawyer = Depends(current_lawyer)
) -> dict[str, Any]:
    """Send the bill to the court that heard the case."""
    bill = own_bill(db, number, lawyer)
    editable_or_409(bill)
    issues = gazette.claim_issues(claims_of(bill.lines))
    claimed = gazette.totals(bill.lines)["claimed"]
    if not bill.lines:
        issues.append("The bill has no lines: itemise what the case cost before sending it")
    elif claimed > gazette.BILL_TOTAL_CEILING_TAKA:
        issues.append(
            f"The bill claims {claimed} taka, over the "
            f"{gazette.BILL_TOTAL_CEILING_TAKA} taka ceiling for one case"
        )
    if issues:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, {"issues": issues})
    bill.status = BillStatus.SUBMITTED
    bill.submitted_at = utcnow()
    record_audit(
        db,
        actor=lawyer.id,
        action=AuditAction.BILL_SUBMITTED,
        entity_type="bill",
        entity_id=bill.id,
        details={
            "bill": bill.bill_number,
            "court": bill.court_id,
            "lines": len(bill.lines),
            "claimedTaka": claimed,
        },
    )
    db.commit()
    return bill_view(db, bill)
