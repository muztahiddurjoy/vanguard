"""Court progress: what a case's panel lawyer has reported, and when the next report is due.

A panel lawyer reports at least every ``LAWYER_INACTIVITY_DAYS`` (14) days, and within
``HEARING_REPORT_HOURS`` (72) of every hearing the court fixed. Missing either raises
the case's ``lawyerInactivity`` alert (T1) on the DLAO dashboard, and the lawyer sees
the same due date on their own dashboard.
"""

from datetime import datetime, timedelta
from typing import Any

from app.config import get_settings
from app.database import as_utc
from app.models import Case, CourtStage, LawyerUpdate


def update_view(update: LawyerUpdate) -> dict[str, Any]:
    doc = update.document
    return {
        "id": update.id,
        "at": as_utc(update.submitted_at).isoformat(),
        "lawyerId": update.lawyer_id,
        "stage": update.stage,
        "summary": update.summary,
        "court": update.court,
        "hearingHeldOn": update.hearing_held_on.isoformat() if update.hearing_held_on else None,
        "nextHearingAt": (
            as_utc(update.next_hearing_at).isoformat() if update.next_hearing_at else None
        ),
        "attachment": {"id": doc.id, "filename": doc.filename} if doc else None,
    }


def latest_stage(case: Case) -> CourtStage | None:
    return case.lawyer_updates[-1].stage if case.lawyer_updates else None


def next_hearing(case: Case) -> tuple[datetime, str | None] | None:
    """The hearing date the court fixed last, and where, until an update reports on it.

    A note without a date keeps the date given before it. A judgment ends the dates.
    A date that has passed stays until the lawyer reports on that hearing.
    """
    if not case.lawyer_updates:
        return None
    newest = as_utc(case.lawyer_updates[-1].submitted_at)
    for update in reversed(case.lawyer_updates):
        if update.stage == CourtStage.JUDGMENT:
            return None
        if update.next_hearing_at is not None:
            at = as_utc(update.next_hearing_at)
            return None if at <= newest else (at, update.court)
    return None


def next_hearing_view(case: Case) -> dict[str, Any] | None:
    found = next_hearing(case)
    return {"at": found[0].isoformat(), "court": found[1]} if found else None


def _last_report(case: Case) -> datetime:
    # A lawyer's clock starts when the case is assigned (assignment sets this).
    return as_utc(case.lawyer_last_update_at or case.received_at)


def hearing_report_due(case: Case) -> datetime | None:
    """When the report on a hearing that has already been fixed is due."""
    found = next_hearing(case)
    if found is None:
        return None
    return found[0] + timedelta(hours=get_settings().hearing_report_hours)


def update_due_at(case: Case) -> datetime | None:
    """The next progress report the lawyer owes: fortnightly, or after the next hearing."""
    if not case.lawyer_id:
        return None
    due = _last_report(case) + timedelta(days=get_settings().lawyer_inactivity_days)
    after_hearing = hearing_report_due(case)
    return min(due, after_hearing) if after_hearing else due


def missed_updates(case: Case, now: datetime) -> int:
    """Fortnightly reports missed since the last one; a missed hearing report counts too."""
    if not case.lawyer_id:
        return 0
    period = timedelta(days=get_settings().lawyer_inactivity_days)
    missed = (now - _last_report(case)) // period
    after_hearing = hearing_report_due(case)
    if after_hearing is not None and now > after_hearing:
        missed = max(missed, 1)
    return missed
