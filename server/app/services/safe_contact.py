"""Central interceptor for contacting parties.

Every outbound SMS or call to a party must pass through here. For someone
like Moyuri, whose husband monitors her phone, the office may only reach her
inside her safe window (Tuesdays 14:00–16:00, while he is at the market) and
only with a message that says nothing about the case, because an SMS stays on
the phone after the window closes.

Rules, by party safety level:

- standard:   any time, full message.
- caution:    any time, neutral message only.
- restricted: inside a safe window only, neutral message only; with no window
              on record, no contact at all.

A phone the party does not own (``no_own_phone``) is treated as shared: neutral
message only. Every decision, allowed or blocked, is written to the audit
ledger. Message bodies are never logged.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from enum import StrEnum

from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import utcnow
from app.models.audit import AuditAction, record_audit
from app.models.party import AccessibilityFlag, Party, SafetyLevel
from app.services.adnsms import AdnSmsClient, SmsResult


@dataclass(frozen=True)
class SafeWindow:
    """A weekly window. ``day`` follows JS Date#getDay (0 = Sunday), like the dashboard."""

    day: int
    start_hour: int
    end_hour: int

    @classmethod
    def parse(cls, raw: dict[str, int]) -> "SafeWindow":
        # Accept the dashboard's camelCase as well as snake_case.
        start = raw.get("start_hour", raw.get("startHour"))
        end = raw.get("end_hour", raw.get("endHour"))
        if start is None or end is None or "day" not in raw:
            raise ValueError(f"incomplete safe window: {raw}")
        w = cls(day=int(raw["day"]), start_hour=int(start), end_hour=int(end))
        if not (0 <= w.day <= 6 and 0 <= w.start_hour < w.end_hour <= 24):
            raise ValueError(f"invalid safe window: {raw}")
        return w


def js_weekday(d: date) -> int:
    """Python's Monday=0 to JS's Sunday=0."""
    return (d.weekday() + 1) % 7


def is_within_window(now_local: datetime, w: SafeWindow) -> bool:
    hour = now_local.hour + now_local.minute / 60
    return js_weekday(now_local) == w.day and w.start_hour <= hour < w.end_hour


def next_window_start(now_local: datetime, w: SafeWindow) -> datetime:
    """Start of the current window if we are inside it, else of the next one."""
    days_ahead = (w.day - js_weekday(now_local) + 7) % 7
    start = datetime.combine(
        now_local.date() + timedelta(days=days_ahead), time(w.start_hour), now_local.tzinfo
    )
    if start + timedelta(hours=w.end_hour - w.start_hour) <= now_local:
        start += timedelta(days=7)
    return start


def party_windows(party: Party) -> list[SafeWindow]:
    return [SafeWindow.parse(w) for w in party.safe_contact_windows or []]


class ContactChannel(StrEnum):
    SMS = "sms"
    CALL = "call"


class BlockReason(StrEnum):
    NO_PHONE = "no_phone"
    NO_SAFE_WINDOW = "no_safe_window_on_record"
    OUTSIDE_WINDOW = "outside_safe_window"
    NEUTRAL_TEXT_REQUIRED = "neutral_text_required"


@dataclass
class ContactDecision:
    allowed: bool
    reason: BlockReason | None = None
    # When the party may next be contacted (office time zone), if blocked by time.
    next_window: datetime | None = None
    # True when only a neutral message may be sent.
    neutral_only: bool = False


def evaluate(party: Party, channel: ContactChannel, now: datetime | None = None) -> ContactDecision:
    """Decide whether ``party`` may be contacted on ``channel`` at ``now``."""
    local_now = (now or utcnow()).astimezone(get_settings().tz)
    shared_phone = AccessibilityFlag.NO_OWN_PHONE in (party.accessibility_flags or [])
    level = SafetyLevel(party.safety_level)
    neutral_only = level != SafetyLevel.STANDARD or shared_phone

    if not party.phone:
        return ContactDecision(False, BlockReason.NO_PHONE, neutral_only=neutral_only)

    if level == SafetyLevel.RESTRICTED:
        windows = party_windows(party)
        if not windows:
            return ContactDecision(False, BlockReason.NO_SAFE_WINDOW, neutral_only=True)
        if not any(is_within_window(local_now, w) for w in windows):
            upcoming = min(next_window_start(local_now, w) for w in windows)
            return ContactDecision(False, BlockReason.OUTSIDE_WINDOW, upcoming, neutral_only=True)

    return ContactDecision(True, neutral_only=neutral_only)


@dataclass
class ContactOutcome:
    decision: ContactDecision
    sms: SmsResult | None = None
    # Which text was sent, never the text itself.
    variant: str | None = None


def contact_party(
    db: Session,
    party: Party,
    *,
    body: str,
    neutral_body: str | None = None,
    actor: str,
    case_ref: str | None = None,
    now: datetime | None = None,
    sms_client: AdnSmsClient | None = None,
) -> ContactOutcome:
    """Send an SMS to a party if, and only as, the safe-contact rules allow.

    ``neutral_body`` is a message that reveals nothing about the case (e.g.
    "Your appointment is confirmed. Reply 1 to call back."). Parties who need
    one get it instead of ``body``; if none is given they get nothing.
    """
    decision = evaluate(party, ContactChannel.SMS, now)
    variant: str | None = None
    if decision.allowed and decision.neutral_only:
        if neutral_body:
            variant = "neutral"
        else:
            decision = ContactDecision(False, BlockReason.NEUTRAL_TEXT_REQUIRED, neutral_only=True)
    elif decision.allowed:
        variant = "full"

    details = {
        "channel": ContactChannel.SMS.value,
        "case": case_ref,
        "safety_level": str(party.safety_level),
    }
    if not decision.allowed:
        record_audit(
            db,
            actor=actor,
            action=AuditAction.CONTACT_BLOCKED,
            entity_type="party",
            entity_id=party.id,
            details={
                **details,
                "reason": str(decision.reason),
                "next_window": decision.next_window.isoformat() if decision.next_window else None,
            },
        )
        return ContactOutcome(decision)

    text = neutral_body if variant == "neutral" else body
    assert text is not None and party.phone is not None
    result = (sms_client or AdnSmsClient()).send(party.phone, text)
    record_audit(
        db,
        actor=actor,
        action=AuditAction.CONTACT_SENT,
        entity_type="party",
        entity_id=party.id,
        details={
            **details,
            "variant": variant,
            "delivered": result.ok,
            "dry_run": result.dry_run,
            "provider_id": result.provider_id,
            "error": result.error,
        },
    )
    return ContactOutcome(decision, result, variant)
