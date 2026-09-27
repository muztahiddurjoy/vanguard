"""The fee schedule a panel lawyer's bill is checked against.

These are the **district legal aid committee's configured ceilings, seeded for
this deployment**: the most the court may allow under each head of an
এল.এ. ফরম-১১ bill, together with which heads need a receipt and which may be
claimed more than once. They are not a transcription of gazette text, and
nothing here quotes a gazette verbatim. When a new gazette or a committee
resolution changes a rate, the numbers in this file change and
``SCHEDULE_VERSION`` goes up; a bill already decided keeps the version it was
checked against (``Bill.schedule_version``), so an old bill still reads against
the ceilings that applied to it.

Money is whole taka throughout, never a float.
"""

from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any

from app.models import BillHead, BillLine

SCHEDULE_VERSION = "2026.1"

# Shown with the schedule so a lawyer reading the ceilings knows whose they are.
REFERENCE = (
    "District Legal Aid Committee, Rangpur: fee ceilings in force for panel lawyers' "
    "bills (L.A. Form-11), schedule 2026.1"
)
REFERENCE_BN = (
    "জেলা লিগ্যাল এইড কমিটি, রংপুর: প্যানেল আইনজীবীর বিলে (এল.এ. ফরম-১১) প্রযোজ্য "
    "ফি-এর সর্বোচ্চ সীমা, তফসিল ২০২৬.১"
)

# The most one bill may claim for a single case, whatever its lines add up to.
BILL_TOTAL_CEILING_TAKA = 15000


@dataclass(frozen=True)
class HeadRule:
    head: BillHead
    label: str
    label_bn: str
    # The most the court may allow on one line under this head.
    ceiling_taka: int
    # A receipt, stamp or challan reference must be given on the line.
    voucher_required: bool
    # May appear on more than one line of the same bill (one per hearing, say).
    repeatable: bool


SCHEDULE: tuple[HeadRule, ...] = (
    HeadRule(BillHead.APPEARANCE, "Appearance at a hearing", "শুনানিতে উপস্থিতি", 1000, False, True),
    HeadRule(BillHead.DRAFTING, "Drafting", "দরখাস্ত/আরজি প্রস্তুত", 1500, False, True),
    HeadRule(BillHead.COURT_FEE, "Court fee", "কোর্ট ফি", 2000, True, False),
    HeadRule(BillHead.VAKALATNAMA, "Vakalatnama", "ওকালতনামা", 300, True, False),
    HeadRule(BillHead.CERTIFIED_COPY, "Certified copy", "জাবেদা নকল", 500, True, True),
    HeadRule(BillHead.PROCESS_FEE, "Process fee", "প্রসেস ফি", 500, True, True),
    HeadRule(BillHead.AFFIDAVIT, "Affidavit", "হলফনামা", 300, True, False),
    HeadRule(BillHead.CLERICAL, "Clerical and copying", "মুহুরি ও ফটোকপি", 400, False, True),
    HeadRule(BillHead.CONVEYANCE, "Conveyance", "যাতায়াত", 600, False, True),
    HeadRule(BillHead.MEDIATION, "Mediation session", "মধ্যস্থতা বৈঠক", 800, False, True),
    HeadRule(BillHead.OTHER, "Other, with a receipt", "অন্যান্য (রসিদসহ)", 1000, True, True),
)

_BY_HEAD = {rule.head: rule for rule in SCHEDULE}


def head_rule(head: BillHead | str) -> HeadRule:
    """The rule for one head. Raises ``ValueError`` for a head that is not in the schedule."""
    return _BY_HEAD[BillHead(head)]


def head_view(rule: HeadRule) -> dict[str, Any]:
    return {
        "head": rule.head,
        "label": rule.label,
        "labelBn": rule.label_bn,
        "ceilingTaka": rule.ceiling_taka,
        "voucherRequired": rule.voucher_required,
        "repeatable": rule.repeatable,
    }


def schedule_view() -> dict[str, Any]:
    """The whole schedule as the dashboards read it, so both show the same ceilings."""
    return {
        "version": SCHEDULE_VERSION,
        "reference": {"en": REFERENCE, "bn": REFERENCE_BN},
        "totalCeilingTaka": BILL_TOTAL_CEILING_TAKA,
        "heads": [head_view(rule) for rule in SCHEDULE],
    }


def line_problems(
    head: BillHead | str,
    claimed_taka: int,
    voucher_ref: str | None,
    description: str,
    *,
    count: int = 1,
) -> list[str]:
    """What is wrong with one claimed line, in plain words; empty means it is fine.

    ``count`` is how many lines of the bill claim this head, which is what makes a
    head that may be claimed only once a problem.
    """
    rule = head_rule(head)
    problems = []
    if not (description or "").strip():
        problems.append(f"{rule.label}: say what the line is for")
    if claimed_taka <= 0:
        problems.append(f"{rule.label}: claim an amount of at least 1 taka")
    elif claimed_taka > rule.ceiling_taka:
        problems.append(
            f"{rule.label}: {claimed_taka} taka is over the {rule.ceiling_taka} taka ceiling"
        )
    if rule.voucher_required and not (voucher_ref or "").strip():
        problems.append(f"{rule.label}: give the receipt or voucher reference")
    if not rule.repeatable and count > 1:
        problems.append(
            f"{rule.label}: may be claimed only once on a bill, and is claimed {count} times"
        )
    return problems


@dataclass(frozen=True)
class Claim:
    """One line as claimed, before it is stored: what ``line_problems`` needs."""

    head: BillHead
    claimed_taka: int
    voucher_ref: str | None
    description: str


def claim_issues(claims: Sequence[Claim]) -> list[str]:
    """Every problem with a whole claim, each said once, in the order of its lines."""
    counts = Counter(claim.head for claim in claims)
    found: list[str] = []
    for claim in claims:
        problems = line_problems(
            claim.head,
            claim.claimed_taka,
            claim.voucher_ref,
            claim.description,
            count=counts[claim.head],
        )
        found.extend(p for p in problems if p not in found)
    return found


def totals(lines: Iterable[BillLine]) -> dict[str, int]:
    """Whole taka claimed, and allowed so far: an undecided line adds nothing allowed."""
    stored = list(lines)
    return {
        "claimed": sum(line.claimed_taka for line in stored),
        "allowed": sum(line.allowed_taka or 0 for line in stored),
    }
