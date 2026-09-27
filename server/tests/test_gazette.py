"""The fee schedule a bill is checked against: ceilings, vouchers and totals."""

from datetime import date

import pytest

from app.models import BillHead, BillLine
from app.services import gazette


def line(head: str, claimed: int, allowed: int | None = None) -> BillLine:
    return BillLine(
        head=head,
        description="Attended the hearing",
        incurred_on=date(2026, 6, 14),
        claimed_taka=claimed,
        allowed_taka=allowed,
    )


def problems(head: str, claimed: int, voucher: str | None = None, description: str = "Hearing",
             count: int = 1) -> list[str]:  # fmt: skip
    return gazette.line_problems(head, claimed, voucher, description, count=count)


def test_every_head_has_a_rule_with_a_bangla_label():
    assert len(gazette.SCHEDULE) == len(BillHead)
    for head in BillHead:
        rule = gazette.head_rule(head)
        assert rule.head == head
        assert rule.label and rule.label_bn and rule.label_bn != rule.label
        assert rule.ceiling_taka > 0 and isinstance(rule.ceiling_taka, int)


def test_the_schedule_the_dashboards_read_names_its_version_and_source():
    view = gazette.schedule_view()
    assert view["version"] == gazette.SCHEDULE_VERSION == "2026.1"
    assert "District Legal Aid Committee" in view["reference"]["en"]
    assert "লিগ্যাল এইড" in view["reference"]["bn"]
    assert view["totalCeilingTaka"] == gazette.BILL_TOTAL_CEILING_TAKA == 15000
    appearance = next(h for h in view["heads"] if h["head"] == "appearance")
    assert appearance == {
        "head": "appearance", "label": "Appearance at a hearing", "labelBn": "শুনানিতে উপস্থিতি",
        "ceilingTaka": 1000, "voucherRequired": False, "repeatable": True,
    }  # fmt: skip
    court_fee = next(h for h in view["heads"] if h["head"] == "courtFee")
    assert court_fee["ceilingTaka"] == 2000
    assert court_fee["voucherRequired"] is True and court_fee["repeatable"] is False


def test_the_ceilings_are_the_ones_the_dashboards_were_given():
    assert {r.head: r.ceiling_taka for r in gazette.SCHEDULE} == {
        BillHead.APPEARANCE: 1000, BillHead.DRAFTING: 1500, BillHead.COURT_FEE: 2000,
        BillHead.VAKALATNAMA: 300, BillHead.CERTIFIED_COPY: 500, BillHead.PROCESS_FEE: 500,
        BillHead.AFFIDAVIT: 300, BillHead.CLERICAL: 400, BillHead.CONVEYANCE: 600,
        BillHead.MEDIATION: 800, BillHead.OTHER: 1000,
    }  # fmt: skip
    assert {r.head for r in gazette.SCHEDULE if r.voucher_required} == {
        BillHead.COURT_FEE, BillHead.VAKALATNAMA, BillHead.CERTIFIED_COPY,
        BillHead.PROCESS_FEE, BillHead.AFFIDAVIT, BillHead.OTHER,
    }  # fmt: skip
    assert {r.head for r in gazette.SCHEDULE if not r.repeatable} == {
        BillHead.COURT_FEE, BillHead.VAKALATNAMA, BillHead.AFFIDAVIT,
    }  # fmt: skip


def test_a_line_within_its_ceiling_with_what_it_needs_has_no_problem():
    assert problems("appearance", 1000) == []
    assert problems("courtFee", 2000, voucher="CF-2026-114") == []


def test_a_line_over_its_ceiling_says_both_numbers():
    [over] = problems("appearance", 1200)
    assert over == "Appearance at a hearing: 1200 taka is over the 1000 taka ceiling"


def test_a_head_that_needs_a_receipt_says_so():
    assert problems("courtFee", 1500) == [
        "Court fee: give the receipt or voucher reference",
    ]
    assert problems("courtFee", 1500, voucher="   ")


def test_a_blank_description_or_nothing_claimed_is_a_problem():
    assert problems("clerical", 100, description="   ") == [
        "Clerical and copying: say what the line is for",
    ]
    assert problems("clerical", 0) == ["Clerical and copying: claim an amount of at least 1 taka"]
    assert problems("clerical", -50) == ["Clerical and copying: claim an amount of at least 1 taka"]
    # Nothing claimed is reported instead of the ceiling, not as well.
    assert len(problems("clerical", 0, description=" ")) == 2


def test_a_head_claimed_twice_that_may_be_claimed_once_is_a_problem():
    assert problems("vakalatnama", 300, voucher="V-1", count=1) == []
    [twice] = problems("vakalatnama", 300, voucher="V-1", count=2)
    assert twice == "Vakalatnama: may be claimed only once on a bill, and is claimed 2 times"
    # Attending three hearings is three lines, which is what appearance is for.
    assert problems("appearance", 900, count=3) == []


def test_an_unknown_head_is_not_in_the_schedule():
    with pytest.raises(ValueError):
        gazette.head_rule("dinner")


def test_a_whole_claim_reports_each_problem_once_in_line_order():
    claims = [
        gazette.Claim(BillHead.APPEARANCE, 1200, None, "Hearing"),
        gazette.Claim(BillHead.VAKALATNAMA, 300, "V-1", "Vakalatnama"),
        gazette.Claim(BillHead.VAKALATNAMA, 300, "V-2", "Vakalatnama again"),
    ]
    assert gazette.claim_issues(claims) == [
        "Appearance at a hearing: 1200 taka is over the 1000 taka ceiling",
        "Vakalatnama: may be claimed only once on a bill, and is claimed 2 times",
    ]
    assert gazette.claim_issues([]) == []


def test_totals_count_allowed_only_where_the_court_decided():
    lines = [line("appearance", 900, 900), line("drafting", 1500, 1200), line("clerical", 400)]
    assert gazette.totals(lines) == {"claimed": 2800, "allowed": 2100}
    assert gazette.totals([line("appearance", 900)]) == {"claimed": 900, "allowed": 0}
    assert gazette.totals([]) == {"claimed": 0, "allowed": 0}
