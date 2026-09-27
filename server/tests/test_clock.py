"""The app's clock, which the demo seed sets back to date its cases in the past."""

import time
from datetime import UTC, datetime, timedelta

from app.database import as_utc, clock_set_to, utcnow
from app.models.audit import record_audit, verify_chain

SECOND = timedelta(seconds=1)


def test_the_clock_is_the_real_one_by_default():
    assert abs(utcnow() - datetime.now(UTC)) < SECOND


def test_set_back_it_still_runs_and_comes_back():
    then = datetime.now(UTC) - timedelta(days=30)
    with clock_set_to(then):
        first = utcnow()
        assert abs(first - then) < SECOND
        time.sleep(0.01)
        assert utcnow() > first
        with clock_set_to(then - timedelta(days=1)):
            assert abs(utcnow() - (then - timedelta(days=1))) < SECOND
        assert abs(utcnow() - then) < SECOND
    assert abs(utcnow() - datetime.now(UTC)) < SECOND


def test_what_is_recorded_meanwhile_has_that_time_and_the_ledger_holds(db):
    then = datetime.now(UTC) - timedelta(days=30)
    record_audit(db, actor="test", action="case_created", entity_type="case", entity_id=1)
    with clock_set_to(then):
        entry = record_audit(
            db, actor="test", action="case_created", entity_type="case", entity_id=2
        )
    db.commit()
    assert abs(as_utc(entry.occurred_at) - then) < SECOND
    assert verify_chain(db) == (True, None)
