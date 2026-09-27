"""One bill as both dashboards read it, and the queries behind the lists.

``bill_view`` is shared by the lawyer's router and the court's, so a bill reads
the same on lawyer-dashboard and court-dashboard: the same lines, the same
ceilings, the same totals. Money is whole taka throughout.

A case keeps no closing timestamp, so when it closed is read from the ledger
(the ``case.closed`` entry), which is where that fact actually lives.
"""

from collections.abc import Iterable, Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import as_utc
from app.models import (
    AuditAction,
    AuditEntry,
    Bill,
    BillLine,
    BillStatus,
    Case,
    CaseRecordLink,
    CaseStatus,
    CourtCase,
)
from app.services.courts import get_court
from app.services.gazette import head_rule, totals
from app.services.panel import get_lawyer

# A bill the court has finished with: its allowed total is a decision, not a running sum.
DECIDED = (BillStatus.VERIFIED, BillStatus.RELEASED, BillStatus.REJECTED)
# A draft is the lawyer's own working paper and is not shown to the court at all.
COURT_VISIBLE = tuple(s for s in BillStatus if s != BillStatus.DRAFT)


def iso(value: Any) -> str | None:
    return as_utc(value).isoformat() if value is not None else None


def court_view(court_id: str) -> dict[str, Any]:
    """The court a bill was sent to. An ID off the roster still names itself."""
    court = get_court(court_id)
    if court is None:
        return {"id": court_id, "name": court_id, "nameBn": court_id}
    return {"id": court.id, "name": court.name, "nameBn": court.name_bn}


def lawyer_view(lawyer_id: str) -> dict[str, Any]:
    lawyer = get_lawyer(lawyer_id)
    if lawyer is None:
        return {"id": lawyer_id, "name": lawyer_id, "nameBn": lawyer_id, "enrolment": None}
    return {
        "id": lawyer.id,
        "name": lawyer.name,
        "nameBn": lawyer.name_bn,
        "enrolment": lawyer.enrolment,
    }


def category_of(case: Case) -> str:
    """The case's category, never empty.

    ``Case.category`` is nullable: a case closed before triage ever named one has
    none. The court dashboard reads these views without a mapping layer, so an
    absent category would show as a blank label there; "other" is a category both
    dashboards already know.
    """
    return case.category or "other"


def client_view(case: Case) -> dict[str, Any] | None:
    applicant = case.applicant
    return {"name": applicant.name, "nameBn": applicant.name_bn} if applicant else None


def closed_at_map(db: Session, case_ids: Sequence[int]) -> dict[int, str]:
    """When each case was closed, from the ledger; the latest closing if it closed twice."""
    if not case_ids:
        return {}
    found: dict[int, str] = {}
    for entity_id, occurred_at in db.execute(
        select(AuditEntry.entity_id, AuditEntry.occurred_at)
        .where(
            AuditEntry.entity_type == "case",
            AuditEntry.action == AuditAction.CASE_CLOSED,
            AuditEntry.entity_id.in_([str(i) for i in case_ids]),
        )
        .order_by(AuditEntry.seq)
    ):
        found[int(entity_id)] = as_utc(occurred_at).isoformat()
    return found


def closed_at(db: Session, case: Case) -> str | None:
    return closed_at_map(db, [case.id]).get(case.id)


def linked_court_id(db: Session, case: Case) -> str | None:
    """The court of the case's linked court record, which is the court that heard it."""
    return db.scalars(
        select(CourtCase.court_id)
        .join(CaseRecordLink, CaseRecordLink.court_case_id == CourtCase.id)
        .where(CaseRecordLink.case_id == case.id)
        .order_by(CaseRecordLink.id)
    ).first()


def line_view(line: BillLine) -> dict[str, Any]:
    rule = head_rule(line.head)
    return {
        "id": line.id,
        "head": line.head,
        "description": line.description,
        "incurredOn": line.incurred_on.isoformat(),
        "claimedTaka": line.claimed_taka,
        "allowedTaka": line.allowed_taka,
        "disallowedReason": line.disallowed_reason,
        "voucherRef": line.voucher_ref,
        "ceilingTaka": rule.ceiling_taka,
        "overCeiling": line.claimed_taka > rule.ceiling_taka,
    }


def bill_view(db: Session, bill: Bill) -> dict[str, Any]:
    """One bill for either dashboard: the case, the lines, and where the bill stands."""
    case = bill.case
    sums = totals(bill.lines)
    return {
        "number": bill.bill_number,
        "status": bill.status,
        "case": {
            "ref": case.display_id,
            "category": category_of(case),
            "outcome": case.outcome,
            "closedAt": closed_at(db, case),
            "client": client_view(case),
        },
        "lawyer": lawyer_view(bill.lawyer_id),
        "court": court_view(bill.court_id),
        "lines": [line_view(line) for line in bill.lines],
        "claimedTotal": sums["claimed"],
        # Nothing is allowed until the court has decided the bill.
        "allowedTotal": sums["allowed"] if bill.status in DECIDED else None,
        "note": bill.note,
        "submittedAt": iso(bill.submitted_at),
        "decidedAt": iso(bill.decided_at),
        "decisionNote": bill.decision_note,
        "voucherNumber": bill.voucher_number,
        "releasedAt": iso(bill.released_at),
        "scheduleVersion": bill.schedule_version,
    }


def bill_totals(bills: Iterable[Bill]) -> dict[str, int]:
    """Whole taka across a list of bills: claimed, allowed, released, and still with the court."""
    listed = list(bills)
    return {
        "claimed": sum(totals(b.lines)["claimed"] for b in listed),
        "allowed": sum(totals(b.lines)["allowed"] for b in listed if b.status in DECIDED),
        "released": sum(
            totals(b.lines)["allowed"] for b in listed if b.status == BillStatus.RELEASED
        ),
        "awaitingCourt": sum(
            totals(b.lines)["claimed"] for b in listed if b.status == BillStatus.SUBMITTED
        ),
    }


def billable_cases(db: Session, lawyer_id: str) -> list[dict[str, Any]]:
    """This lawyer's closed cases with no bill yet: what they may still claim for."""
    cases = db.scalars(
        select(Case)
        .where(
            Case.lawyer_id == lawyer_id,
            Case.status == CaseStatus.CLOSED,
            Case.id.not_in(select(Bill.case_id)),
        )
        .order_by(Case.id)
    ).all()
    closed = closed_at_map(db, [case.id for case in cases])
    return [
        {
            "ref": case.display_id,
            "category": category_of(case),
            "outcome": case.outcome,
            "closedAt": closed.get(case.id),
            "client": client_view(case),
            "court": (court_view(court_id) if (court_id := linked_court_id(db, case)) else None),
            # How many times this lawyer reported from court on the case.
            "hearings": sum(1 for u in case.lawyer_updates if u.lawyer_id == lawyer_id),
        }
        for case in cases
    ]
