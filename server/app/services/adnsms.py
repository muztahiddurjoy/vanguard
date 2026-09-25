"""Outbound SMS through the ADN SMS gateway (Bangladesh).

Do not call ``AdnSmsClient.send`` directly for applicants or other parties:
go through ``services.safe_contact.contact_party`` so the safe-contact rules
are applied and the attempt is audited.
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.config import Settings, get_settings

log = logging.getLogger(__name__)

_BD_MOBILE = re.compile(r"^01[3-9]\d{8}$")


def normalize_bd_mobile(phone: str) -> str:
    """Return a Bangladeshi mobile number as 01XXXXXXXXX, or raise ValueError."""
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("880"):
        digits = digits[2:]
    elif digits.startswith("1") and len(digits) == 10:
        digits = "0" + digits
    if not _BD_MOBILE.match(digits):
        raise ValueError(f"not a Bangladeshi mobile number: {phone!r}")
    return digits


def needs_unicode(text: str) -> bool:
    """Bangla (or any non-ASCII) text must be sent as a UNICODE SMS."""
    return any(ord(ch) > 127 for ch in text)


@dataclass
class SmsResult:
    ok: bool
    dry_run: bool
    provider_id: str | None = None
    error: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


class AdnSmsClient:
    SEND_PATH = "/api/v1/secure/send-sms"

    def __init__(self, settings: Settings | None = None, http: httpx.Client | None = None):
        self.settings = settings or get_settings()
        self._http = http

    @property
    def dry_run(self) -> bool:
        s = self.settings
        return s.sms_dry_run or not (s.adnsms_api_key and s.adnsms_api_secret)

    def send(self, mobile: str, message: str) -> SmsResult:
        mobile = normalize_bd_mobile(mobile)
        allowlist = self.settings.sms_allowlist_numbers
        if self.dry_run or (allowlist and mobile not in allowlist):
            log.info("SMS dry run to %s (%d chars)", mobile[:5] + "******", len(message))
            return SmsResult(ok=True, dry_run=True)

        form = {
            "api_key": self.settings.adnsms_api_key,
            "api_secret": self.settings.adnsms_api_secret,
            "request_type": "SINGLE_SMS",
            "message_type": "UNICODE" if needs_unicode(message) else "TEXT",
            "mobile": mobile,
            "message_body": message,
        }
        url = self.settings.adnsms_base_url.rstrip("/") + self.SEND_PATH
        try:
            if self._http is not None:
                resp = self._http.post(url, data=form, timeout=10)
            else:
                with httpx.Client(timeout=10) as client:
                    resp = client.post(url, data=form)
            data: dict[str, Any] = resp.json() if resp.content else {}
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("ADN SMS request failed: %s", exc)
            return SmsResult(ok=False, dry_run=False, error=str(exc))

        code = str(data.get("api_response_code", resp.status_code))
        if resp.is_success and code == "200":
            return SmsResult(ok=True, dry_run=False, provider_id=data.get("sms_uid"), raw=data)
        return SmsResult(
            ok=False,
            dry_run=False,
            error=str(data.get("api_response_message") or f"HTTP {resp.status_code}"),
            raw=data,
        )
