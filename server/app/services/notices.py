"""SMS notices sent when an application is filed.

- Whoever filed it (the applicant, or the relative who called for them) gets
  its tracking number and the number of the AI query helpline.
- The person it is filed against is asked to visit the District Legal Aid
  Office, on every SIM registered under their NID.

Both go through ``safe_contact``, so no text reaches a restricted or
do-not-contact party. The respondent notice is *held* for an officer, not
sent, whenever it could put the applicant at risk or rests on an unconfirmed
claim: the caller said not now, the case is marked sensitive or do-not-call,
it was escalated as an emergency, or nobody's identity was confirmed. Only an
officer can release a held notice, with a reason (``send_respondent_notice``).
"""

from typing import Any

from sqlalchemy.orm import Session

from app.agents.spoken import DISTRICTS
from app.config import get_settings
from app.database import utcnow
from app.models import (
    AuditAction,
    Case,
    Party,
    PartyRole,
    Track,
    format_token,
    record_audit,
)
from app.services import safe_contact

FILER = {
    "en": "Your legal aid application {ref} has been received. Tracking number: {token}. "
    "Call {helpline} to follow its progress. - District Legal Aid Office, {office}",
    "bn": "আপনার আইনি সহায়তার আবেদন {ref} গ্রহণ করা হয়েছে। ট্র্যাকিং নম্বর: {token}। "
    "অগ্রগতি জানতে {helpline} নম্বরে ফোন করুন। - জেলা লিগ্যাল এইড অফিস, {office_bn}",
}
# For a phone someone else may read: nothing about a case or the legal aid office.
FILER_NEUTRAL = {
    "en": "Your service number is {token}. Call {helpline} for information.",
    "bn": "আপনার সেবা নম্বর {token}। তথ্যের জন্য {helpline} নম্বরে ফোন করুন।",
}
RESPONDENT = {
    "en": "A case has been filed against you (ref {ref}). You are requested to visit the "
    "District Legal Aid Office, {office}. For queries call {helpline}.",
    "bn": "আপনার বিরুদ্ধে একটি অভিযোগ দায়ের করা হয়েছে (সূত্র {ref})। অনুগ্রহ করে জেলা লিগ্যাল এইড "
    "অফিস, {office_bn}-এ উপস্থিত হোন। তথ্যের জন্য {helpline} নম্বরে ফোন করুন।",
}


def _fields(case: Case) -> dict[str, str]:
    settings = get_settings()
    office = settings.office_district
    return {
        "ref": case.display_id,
        "token": format_token(case.tracking_token or ""),
        "helpline": settings.helpline_number,
        "office": office,
        "office_bn": DISTRICTS.get(office, office),
    }


def filer_of(case: Case) -> Party | None:
    """Who filed: the relative or neighbour who called for the applicant, else the applicant."""
    return case.party_with_role(PartyRole.PROXY) or case.applicant


def _set_notice(case: Case, key: str, notice: dict[str, Any]) -> None:
    # Reassign so SQLAlchemy sees the JSON column change.
    case.notices = {**(case.notices or {}), key: {**notice, "at": utcnow().isoformat()}}


def send_filer_receipt(db: Session, case: Case, actor: str) -> dict[str, Any]:
    filer = filer_of(case)
    if filer is None or not case.tracking_token:
        notice: dict[str, Any] = {"status": "blocked", "reason": "no_filer"}
        _set_notice(case, "filer", notice)
        return notice
    lang = filer.preferred_language if filer.preferred_language in FILER else "bn"
    fields = _fields(case)
    outcome = safe_contact.contact_party(
        db,
        filer,
        body=FILER[lang].format(**fields),
        neutral_body=FILER_NEUTRAL[lang].format(**fields),
        actor=actor,
        case_ref=case.display_id,
        phone=filer.phone or next(iter(filer.registered_phones or []), None),
    )
    if outcome.sms is None:
        notice = {"status": "blocked", "reason": str(outcome.decision.reason)}
    else:
        notice = {
            "status": "sent" if outcome.sms.ok else "failed",
            "variant": outcome.variant,
            "dryRun": outcome.sms.dry_run,
        }
    _set_notice(case, "filer", notice)
    return notice


def hold_reasons(case: Case) -> list[str]:
    """Why the respondent notice must wait for an officer (empty: send it)."""
    identity = (case.intake_data or {}).get("identity") or {}
    reasons = []
    if (case.intake_data or {}).get("notify_respondent") is not True:
        reasons.append("callerDidNotAgree")
    if case.do_not_call_reason:
        reasons.append("doNotCall")
    if case.track == Track.SENSITIVE:
        reasons.append("sensitive")
    if "escalated" in (case.flags or []):
        reasons.append("emergency")
    if identity.get("caller") != "verified":
        reasons.append("identityNotVerified")
    return reasons


def respondent_numbers(case: Case) -> list[str]:
    """The respondent's registered SIMs, minus any number the applicant's side uses.

    Families often register a wife's or child's SIM under the husband's NID; a
    notice must never land on the applicant's own phone.
    """
    respondent = case.party_with_role(PartyRole.RESPONDENT)
    if respondent is None:
        return []
    ours: set[str] = set()
    for link in case.parties:
        if link.role != PartyRole.RESPONDENT:
            ours.update(p for p in (link.party.phone, *link.party.registered_phones) if p)
    numbers = respondent.registered_phones or ([respondent.phone] if respondent.phone else [])
    return [n for n in dict.fromkeys(numbers) if n not in ours]


def send_respondent_notice(
    db: Session, case: Case, actor: str, *, released_by_officer: bool = False
) -> dict[str, Any]:
    """Notify the respondent unless the notice must be held (see module docstring)."""
    respondent = case.party_with_role(PartyRole.RESPONDENT)
    numbers = respondent_numbers(case)
    if respondent is None or not numbers:
        notice: dict[str, Any] = {"status": "notFound"}
        _set_notice(case, "respondent", notice)
        return notice
    if not released_by_officer and (reasons := hold_reasons(case)):
        notice = {"status": "held", "reasons": reasons}
        record_audit(
            db,
            actor=actor,
            action=AuditAction.NOTICE_HELD,
            entity_type="case",
            entity_id=case.id,
            details={"notice": "respondent", "reasons": reasons},
        )
        _set_notice(case, "respondent", notice)
        return notice

    lang = respondent.preferred_language if respondent.preferred_language in RESPONDENT else "bn"
    text = RESPONDENT[lang].format(**_fields(case))
    results = [
        safe_contact.contact_party(
            db, respondent, body=text, actor=actor, case_ref=case.display_id, phone=number
        )
        for number in numbers
    ]
    delivered = [r.sms for r in results if r.sms is not None and r.sms.ok]
    notice = {
        "status": "sent" if delivered else "failed",
        "sentTo": len(delivered),
        "dryRun": all(s.dry_run for s in delivered) if delivered else None,
        "releasedByOfficer": released_by_officer,
    }
    _set_notice(case, "respondent", notice)
    return notice


def send_intake_notices(db: Session, case: Case, actor: str) -> None:
    """Both notices for a newly filed application. Caller commits."""
    send_filer_receipt(db, case, actor)
    send_respondent_notice(db, case, actor)
