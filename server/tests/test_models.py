from datetime import date

import pytest
from sqlalchemy import select, update

from app.models import (
    AuditAction,
    AuditEntry,
    Bill,
    BillHead,
    BillLine,
    BillStatus,
    Case,
    CaseParty,
    IntakeChannel,
    Party,
    PartyRole,
    next_reference,
    record_audit,
    verify_chain,
)
from app.models.audit import ImmutableRecordError
from app.models.party import hash_nid


def test_references_count_up_per_prefix_and_year(db):
    assert next_reference(db, "APP", 2026) == "APP-2026-001"
    assert next_reference(db, "APP", 2026) == "APP-2026-002"
    assert next_reference(db, "DLAS", 2026) == "DLAS-2026-001"
    assert next_reference(db, "APP", 2027) == "APP-2027-001"


def test_a_bill_carries_its_lines_and_is_one_per_case(db):
    case = Case(
        application_id="APP-2026-001", channel=IntakeChannel.WALK_IN, current_office="Rangpur"
    )
    bill = Bill(
        bill_number="BILL-2026-001",
        case=case,
        lawyer_id="LAW-21",
        court_id="RNG-CJM",
        schedule_version="2026.1",
        lines=[
            BillLine(head=BillHead.APPEARANCE, description="Two hearings",
                     incurred_on=date(2026, 6, 14), claimed_taka=600),
            BillLine(head=BillHead.COURT_FEE, description="Court fee stamps",
                     incurred_on=date(2026, 3, 2), claimed_taka=1200, voucher_ref="CF-114"),
        ],
    )  # fmt: skip
    db.add(bill)
    db.flush()
    assert bill.status == BillStatus.DRAFT
    assert [line.claimed_taka for line in bill.lines] == [600, 1200]
    # Whole taka, never a float, and nothing is allowed until the court decides.
    assert all(isinstance(line.claimed_taka, int) for line in bill.lines)
    assert [line.allowed_taka for line in bill.lines] == [None, None]
    # Saving a bill replaces its lines, so the ones it drops go with it.
    bill.lines = []
    db.flush()
    assert db.scalars(select(BillLine)).all() == []


def test_bill_statuses_and_heads_are_the_ones_the_dashboards_know(db):
    assert [str(s) for s in BillStatus] == [
        "draft", "submitted", "returned", "verified", "released", "rejected",
    ]  # fmt: skip
    assert [str(h) for h in BillHead] == [
        "appearance", "drafting", "courtFee", "vakalatnama", "certifiedCopy", "processFee",
        "affidavit", "clerical", "conveyance", "mediation", "other",
    ]  # fmt: skip
    assert [a for a in AuditAction if a.startswith("bill.")] == [
        "bill.drafted", "bill.submitted", "bill.returned",
        "bill.verified", "bill.rejected", "bill.released",
    ]  # fmt: skip


def test_nid_is_stored_only_as_keyed_hash_and_last_four(db):
    party = Party(name="Moyuri Akter")
    party.set_nid("1990 1234 5678 2741")
    db.add(party)
    db.flush()
    assert party.nid_last4 == "2741"
    assert party.nid_masked == "•••• •••• 2741"
    assert party.nid_hash == hash_nid("199012345678 2741")
    assert "2741" not in party.nid_hash


def test_case_links_parties_by_role(db):
    applicant = Party(name="Moyuri Akter")
    proxy = Party(name="Rahela Khatun")
    case = Case(
        application_id="APP-2026-001", channel=IntakeChannel.PROXY, current_office="Rangpur"
    )
    case.parties = [
        CaseParty(party=applicant, role=PartyRole.APPLICANT),
        CaseParty(party=proxy, role=PartyRole.PROXY, relation="neighbour"),
    ]
    db.add(case)
    db.flush()
    assert case.applicant is applicant
    assert case.display_id == "APP-2026-001"
    case.add_flag("proxyReported")
    case.add_flag("proxyReported")
    assert case.flags == ["proxyReported"]


def test_audit_chain_links_and_verifies(db):
    a = record_audit(
        db, actor="dlao-1", action=AuditAction.CASE_VIEWED, entity_type="case", entity_id=1
    )
    b = record_audit(
        db,
        actor="dlao-1",
        action=AuditAction.PRIORITY_OVERRIDE,
        entity_type="case",
        entity_id=1,
        details={"from": "medium", "to": "high"},
        justification="Neighbour confirmed new injuries yesterday.",
    )
    assert (a.seq, b.seq) == (1, 2)
    assert b.prev_hash == a.entry_hash
    assert verify_chain(db) == (True, None)


def test_audit_entries_cannot_be_edited_or_deleted_through_the_orm(db):
    entry = record_audit(db, actor="x", action="case.viewed", entity_type="case", entity_id=1)
    entry.actor = "someone else"
    with pytest.raises(ImmutableRecordError):
        db.flush()
    db.rollback()
    entry = db.get(AuditEntry, entry.id) or record_audit(
        db, actor="x", action="case.viewed", entity_type="case", entity_id=1
    )
    db.delete(entry)
    with pytest.raises(ImmutableRecordError):
        db.flush()


def test_tampering_below_the_orm_is_detected(db):
    for i in range(3):
        record_audit(db, actor="x", action="case.viewed", entity_type="case", entity_id=i)
    db.commit()
    # Bypass the ORM guard, as someone with raw database access could.
    db.execute(update(AuditEntry).where(AuditEntry.seq == 2).values(actor="forged"))
    db.commit()
    db.expire_all()
    assert verify_chain(db) == (False, 2)
