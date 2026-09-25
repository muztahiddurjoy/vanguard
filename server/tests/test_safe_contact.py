from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
import pytest

from app.models import AuditEntry, Party, SafetyLevel
from app.services import adnsms, safe_contact
from app.services.safe_contact import BlockReason, ContactChannel, SafeWindow

DHAKA = ZoneInfo("Asia/Dhaka")
TUE_2_TO_4 = SafeWindow(day=2, start_hour=14, end_hour=16)


def at(iso: str) -> datetime:
    # 2026-09-22 is a Tuesday. Times are Dhaka local, as in the dashboard tests.
    return datetime.fromisoformat(iso).replace(tzinfo=DHAKA)


def moyuri() -> Party:
    return Party(
        id=1,
        name="Moyuri Akter",
        phone="01712345318",
        safety_level=SafetyLevel.RESTRICTED,
        safe_contact_windows=[{"day": 2, "start_hour": 14, "end_hour": 16}],
        accessibility_flags=[],
    )


# Same cases as dlao-dashboard/src/lib/safe-contact.test.ts, so both sides agree.
@pytest.mark.parametrize(
    ("iso", "inside"),
    [
        ("2026-09-22T14:00:00", True),
        ("2026-09-22T15:59:00", True),
        ("2026-09-22T16:00:00", False),
        ("2026-09-22T13:59:00", False),
        ("2026-09-23T15:00:00", False),
    ],
)
def test_window_is_open_only_on_the_right_day_and_hours(iso, inside):
    assert safe_contact.is_within_window(at(iso), TUE_2_TO_4) is inside


@pytest.mark.parametrize(
    ("iso", "expected"),
    [
        ("2026-09-23T09:00:00", "2026-09-29T14:00:00"),
        ("2026-09-22T10:00:00", "2026-09-22T14:00:00"),
        ("2026-09-22T15:00:00", "2026-09-22T14:00:00"),
        ("2026-09-22T16:30:00", "2026-09-29T14:00:00"),
    ],
)
def test_next_window_start(iso, expected):
    assert safe_contact.next_window_start(at(iso), TUE_2_TO_4) == at(expected)


def test_window_parse_accepts_dashboard_camel_case_and_rejects_nonsense():
    assert SafeWindow.parse({"day": 2, "startHour": 14, "endHour": 16}) == TUE_2_TO_4
    with pytest.raises(ValueError):
        SafeWindow.parse({"day": 9, "start_hour": 14, "end_hour": 16})
    with pytest.raises(ValueError):
        SafeWindow.parse({"day": 2, "start_hour": 16, "end_hour": 14})


def test_restricted_party_is_blocked_outside_window_with_next_opening():
    d = safe_contact.evaluate(moyuri(), ContactChannel.CALL, at("2026-09-23T09:00:00"))
    assert not d.allowed
    assert d.reason == BlockReason.OUTSIDE_WINDOW
    assert d.next_window == at("2026-09-29T14:00:00")


def test_restricted_party_is_reachable_inside_window_but_neutral_only():
    d = safe_contact.evaluate(moyuri(), ContactChannel.CALL, at("2026-09-22T14:30:00"))
    assert d.allowed and d.neutral_only


def test_restricted_party_without_window_is_never_contacted():
    p = moyuri()
    p.safe_contact_windows = []
    d = safe_contact.evaluate(p, ContactChannel.SMS, at("2026-09-22T14:30:00"))
    assert (d.allowed, d.reason) == (False, BlockReason.NO_SAFE_WINDOW)


def test_shared_phone_forces_neutral_text_for_standard_party():
    p = Party(
        name="Karim",
        phone="01812345678",
        safety_level=SafetyLevel.STANDARD,
        accessibility_flags=["no_own_phone"],
    )
    assert safe_contact.evaluate(p, ContactChannel.SMS).neutral_only


def test_contact_party_sends_neutral_text_and_audits_without_body(db):
    party = moyuri()
    db.add(party)
    db.flush()
    sent: list[tuple[str, str]] = []

    class FakeSms(adnsms.AdnSmsClient):
        def send(self, mobile: str, message: str) -> adnsms.SmsResult:
            sent.append((mobile, message))
            return adnsms.SmsResult(ok=True, dry_run=False, provider_id="abc")

    outcome = safe_contact.contact_party(
        db,
        party,
        body="Your domestic violence case APP-2026-001 hearing is on Sunday.",
        neutral_body="Your appointment is confirmed.",
        actor="dlao-1",
        case_ref="APP-2026-001",
        now=at("2026-09-22T14:10:00"),
        sms_client=FakeSms(),
    )
    assert outcome.variant == "neutral"
    assert sent == [("01712345318", "Your appointment is confirmed.")]
    entry = db.query(AuditEntry).one()
    assert entry.action == "contact.sent"
    assert "appointment" not in str(entry.details)


def test_contact_party_blocks_without_neutral_text_and_audits(db):
    party = moyuri()
    db.add(party)
    db.flush()
    outcome = safe_contact.contact_party(
        db, party, body="Case details", actor="dlao-1", now=at("2026-09-22T14:10:00")
    )
    assert outcome.decision.reason == BlockReason.NEUTRAL_TEXT_REQUIRED
    assert outcome.sms is None
    assert db.query(AuditEntry).one().action == "contact.blocked"


@pytest.mark.parametrize(
    ("raw", "normalized"),
    [
        ("01712-345-318", "01712345318"),
        ("+8801712345318", "01712345318"),
        ("8801712345318", "01712345318"),
        ("1712345318", "01712345318"),
    ],
)
def test_normalize_bd_mobile(raw, normalized):
    assert adnsms.normalize_bd_mobile(raw) == normalized


def test_normalize_rejects_non_mobile():
    with pytest.raises(ValueError):
        adnsms.normalize_bd_mobile("01212345678")


def test_adnsms_posts_unicode_form_and_reads_uid():
    captured: dict[str, bytes] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = request.content
        return httpx.Response(200, json={"api_response_code": 200, "sms_uid": "SMS123"})

    from app.config import Settings

    settings = Settings(adnsms_api_key="k", adnsms_api_secret="s", sms_dry_run=False)
    http = httpx.Client(transport=httpx.MockTransport(handler))
    client = adnsms.AdnSmsClient(settings, http=http)
    result = client.send("01712345318", "আপনার অ্যাপয়েন্টমেন্ট নিশ্চিত")
    assert result.ok and result.provider_id == "SMS123"
    assert b"message_type=UNICODE" in captured["body"]


def test_adnsms_is_dry_run_without_credentials():
    from app.config import Settings

    result = adnsms.AdnSmsClient(Settings(sms_dry_run=False)).send("01712345318", "hi")
    assert result.dry_run and result.ok


def test_adnsms_allowlist_sends_only_to_listed_numbers():
    sent: list[bytes] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request.content)
        return httpx.Response(200, json={"api_response_code": 200, "sms_uid": "SMS9"})

    from app.config import Settings

    settings = Settings(
        adnsms_api_key="k",
        adnsms_api_secret="s",
        sms_dry_run=False,
        sms_allowlist="+8801811-223344, 01712345318",
    )
    client = adnsms.AdnSmsClient(
        settings, http=httpx.Client(transport=httpx.MockTransport(handler))
    )
    assert client.send("01712345318", "hi").dry_run is False
    assert client.send("01999888777", "hi").dry_run is True
    assert len(sent) == 1
