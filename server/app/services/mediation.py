"""Mediation notices to both parties, attendance, and Union Digital Centres asked to help.

When the office schedules a session, each party gets an SMS notice: the case
reference, the date and time, the place, the notice's own number and the AI
helpline's number. A caller who says the notice number hears what it means
(``agents.helpline``). The applicant's goes through ``safe_contact`` (a neutral
text for a restricted, caution or shared phone); the respondent's goes to the
SIMs registered under their NID, never to a number the applicant's side uses.
Both are *held*, not sent, when the case is do-not-call or on the sensitive
track: telling anyone about a meeting could put the applicant at risk. Every
notice is kept, sent or not, so the dashboard shows what each party was told.

The officer records who came. A party absent from ``MEDIATION_NO_SHOW_LIMIT``
sessions in a row flags the case ``mediationNoShow``, and the Union Digital
Centre (UDC) of their upazila is sent the next date to tell them in person: at
once if a later session is already scheduled, else when the next one is. The
UDC's SMS names the person, their father and village, the case reference, the
date and the place, never what the case is about. A notice about an applicant
who is not at the standard safety level waits for an officer: where they live,
in a stranger's SMS, could endanger them.
"""

import secrets
from collections import defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.helpline import BN_MONTHS, bn_part_of_day
from app.agents.spoken import DAY_NAMES, DISTRICTS, EN_TO_BN_DIGITS
from app.config import get_settings
from app.database import as_utc, utcnow
from app.models import (
    Attendance,
    AuditAction,
    Case,
    MediationAttendance,
    MediationMode,
    MediationNotice,
    MediationSession,
    MediationStatus,
    Party,
    PartyRole,
    SafetyLevel,
    Track,
    UdcNotice,
    UdcNoticeStatus,
    format_token,
    new_tracking_token,
    record_audit,
)
from app.services import notices, safe_contact
from app.services.adnsms import AdnSmsClient
from app.services.udc import Udc, get_udc, udc_for_upazila

ROLES = (PartyRole.APPLICANT, PartyRole.RESPONDENT)
NO_SHOW_FLAG = "mediationNoShow"

PLACES: dict[str, tuple[str, str]] = {
    MediationMode.IN_PERSON: (
        "District Legal Aid Office, {office} (District Judge Court building)",
        "জেলা লিগ্যাল এইড অফিস, {office_bn} (জেলা জজ আদালত ভবন)",
    ),
    MediationMode.ODR_PHONE: ("By phone (the office will call)", "ফোনে (অফিস থেকে ফোন করা হবে)"),
    MediationMode.ODR_VIDEO: (
        "Online by video call (the office will send the link)",
        "অনলাইনে ভিডিও কলে (অফিস লিংক পাঠাবে)",
    ),
}

NOTICE = {
    "en": "Notice of a mediation meeting on case {ref}. When: {date}. Where: {place}. "
    "Notice number: {code}. Please bring your NID. For questions call {helpline} and say the "
    "notice number. - District Legal Aid Office, {office}",
    "bn": "মামলা {ref}-এর মধ্যস্থতা সভার নোটিশ। সময়: {date}। স্থান: {place_bn}। নোটিশ নম্বর: {code}। "
    "আপনার এনআইডি সঙ্গে আনুন। কিছু জানতে {helpline} নম্বরে ফোন করে নোটিশ নম্বরটি বলুন। "
    "- জেলা লিগ্যাল এইড অফিস, {office_bn}",
}
# For a phone someone else may read: no case, office or place. The helpline, given the
# number, tells the party the rest.
NOTICE_NEUTRAL = {
    "en": "Your appointment: {date}. Your number: {code}. Call {helpline} and say the number "
    "for details.",
    "bn": "আপনার সাক্ষাতের সময়: {date}। আপনার নম্বর: {code}। বিস্তারিত জানতে {helpline} নম্বরে ফোন করে "
    "নম্বরটি বলুন।",
}
# To the UDC entrepreneur, who reads Bangla. Who to find and when to tell them to come,
# never what the case is about.
UDC_SMS = {
    "en": "District Legal Aid Office, {office}: please tell {who} in person that the next "
    "mediation meeting on case {ref} is on {date}. Where: {place}. Please let the office know "
    "once you have told them.",
    "bn": "জেলা লিগ্যাল এইড অফিস, {office_bn}: অনুগ্রহ করে {who}-কে সরাসরি জানান, মামলা {ref}-এর পরবর্তী "
    "মধ্যস্থতা সভা {date}। স্থান: {place_bn}। জানানো হলে অফিসকে জানান।",
}
UDC_LANGUAGE = "bn"


# --- what the SMS say ---------------------------------------------------------------


def place_of(mode: str) -> tuple[str, str]:
    """Where a session is, in English and Bangla."""
    office = get_settings().office_district
    en, bn = PLACES[MediationMode(mode)]
    return en.format(office=office), bn.format(office_bn=DISTRICTS.get(office, office))


def written_date(at: datetime, lang: str) -> str:
    """For an SMS, in office time: "Tuesday 29 September 2026, 2:30 pm", or in Bangla."""
    local = as_utc(at).astimezone(get_settings().tz)
    hour12 = local.hour % 12 or 12
    if lang == "en":
        noon = "am" if local.hour < 12 else "pm"
        return f"{local:%A} {local.day} {local:%B} {local.year}, {hour12}:{local:%M} {noon}"
    weekday = DAY_NAMES[safe_contact.js_weekday(local)][1]
    text = (
        f"{weekday}, {local.day} {BN_MONTHS[local.month - 1]} {local.year}, "
        f"{bn_part_of_day(local.hour)} {hour12}:{local:%M}"
    )
    return text.translate(EN_TO_BN_DIGITS)


def _fields(case: Case, session: MediationSession, lang: str) -> dict[str, str]:
    settings = get_settings()
    office = settings.office_district
    place, place_bn = place_of(session.mode)
    return {
        "ref": case.display_id,
        "date": written_date(session.scheduled_for, lang),
        "place": place,
        "place_bn": place_bn,
        "helpline": settings.helpline_number,
        "office": office,
        "office_bn": DISTRICTS.get(office, office),
    }


def notice_texts(case: Case, session: MediationSession, code: str, lang: str) -> tuple[str, str]:
    """The full notice and the neutral one, in ``lang``."""
    fields = {**_fields(case, session, lang), "code": format_token(code)}
    return NOTICE[lang].format(**fields), NOTICE_NEUTRAL[lang].format(**fields)


def _who(party: Party, lang: str) -> str:
    """ "Jalal Uddin (father Abdus Sattar, village Kandi)": enough for a UDC to find them."""
    name = (party.name_bn or party.name) if lang == "bn" else party.name
    details = []
    if party.guardian_name:
        details.append(("পিতা " if lang == "bn" else "father ") + party.guardian_name)
    if party.village:
        details.append(("গ্রাম " if lang == "bn" else "village ") + party.village)
    return f"{name} ({', '.join(details)})" if details else name


def udc_text(case: Case, party: Party, session: MediationSession, lang: str = UDC_LANGUAGE) -> str:
    return UDC_SMS[lang].format(**_fields(case, session, lang), who=_who(party, lang))


# --- notices to the parties ---------------------------------------------------------


def hold_reasons(case: Case) -> list[str]:
    """Why nobody may be told about a session yet (empty: tell them)."""
    applicant = case.applicant
    reasons = []
    if case.do_not_call_reason or (
        applicant is not None and applicant.safety_level == SafetyLevel.NO_CONTACT
    ):
        reasons.append("doNotCall")
    if case.track == Track.SENSITIVE:
        reasons.append("sensitive")
    return reasons


def _no_number(db: Session) -> str:
    # The column is required, but a held notice has no number to give out. It gets a
    # placeholder that no spoken number can match (not eight digits), never shown.
    while True:
        code = f"h{secrets.token_hex(3)}"
        if (
            db.scalars(select(MediationNotice.id).where(MediationNotice.code == code)).first()
            is None
        ):
            return code


def _numbers(case: Case, party: Party, role: PartyRole) -> list[str]:
    if role == PartyRole.RESPONDENT:
        return notices.respondent_numbers(case)
    number = party.phone or next(iter(party.registered_phones or []), None)
    return [number] if number else []


def _send_notice(
    db: Session,
    case: Case,
    session: MediationSession,
    party: Party,
    role: PartyRole,
    code: str,
    actor: str,
) -> tuple[str, dict[str, Any]]:
    numbers = _numbers(case, party, role)
    if not numbers:
        return "notFound", {"reasons": [], "sentTo": 0, "dryRun": None}
    lang = party.preferred_language if party.preferred_language in NOTICE else "bn"
    body, neutral = notice_texts(case, session, code, lang)
    results = [
        safe_contact.contact_party(
            db,
            party,
            body=body,
            neutral_body=neutral,
            actor=actor,
            case_ref=case.display_id,
            phone=number,
        )
        for number in numbers
    ]
    delivered = [r for r in results if r.sms is not None and r.sms.ok]
    if delivered:
        status = "sent"
    elif any(r.sms is not None for r in results):
        status = "failed"
    else:
        status = "blocked"
    blocked = [str(r.decision.reason) for r in results if r.sms is None and r.decision.reason]
    return status, {
        "reasons": list(dict.fromkeys(blocked)) if status == "blocked" else [],
        "sentTo": len(delivered),
        "dryRun": all(r.sms.dry_run for r in delivered if r.sms) if delivered else None,
        "variant": delivered[0].variant if delivered else None,
    }


def send_session_notices(
    db: Session, case: Case, session: MediationSession, actor: str
) -> list[MediationNotice]:
    """One notice per party, kept whether it was sent, held, blocked or had nowhere to go.

    Caller commits.
    """
    reasons = hold_reasons(case)
    sent: list[MediationNotice] = []
    for role in ROLES:
        party = case.party_with_role(role)
        if party is None:
            continue
        if reasons:
            code, status, details = _no_number(db), "held", {"reasons": reasons}
        else:
            code = new_tracking_token(db)  # also never an existing notice's number
            status, details = _send_notice(db, case, session, party, role, code, actor)
        notice = MediationNotice(
            session_id=session.id, case_id=case.id, party_id=party.id, role=role,
            code=code, status=status, details=details,
        )  # fmt: skip
        db.add(notice)
        db.flush()  # the next party's number must not repeat this one
        record_audit(
            db,
            actor=actor,
            action=AuditAction.MEDIATION_NOTICE,
            entity_type="case",
            entity_id=case.id,
            details={
                "sessionId": session.id,
                "role": role,
                "status": status,
                "reasons": details.get("reasons", []),
            },
        )
        sent.append(notice)
    return sent


def notice_view(notice: MediationNotice) -> dict[str, Any]:
    details = notice.details or {}
    return {
        "role": notice.role,
        "status": notice.status,
        # A held notice has no number (see _no_number).
        "code": format_token(notice.code) if notice.code.isdigit() else None,
        "reasons": details.get("reasons", []),
        "dryRun": details.get("dryRun"),
        "sentTo": details.get("sentTo", 0),
        "at": as_utc(notice.created_at).isoformat(),
    }


def public_notice(db: Session, notice: MediationNotice) -> dict[str, Any]:
    """What a notice number may reveal to anyone who says it: what the SMS itself said."""
    session = db.get(MediationSession, notice.session_id)
    case = db.get(Case, notice.case_id)
    assert session is not None and case is not None
    place, place_bn = place_of(session.mode)
    return {
        "reference": case.display_id,
        "role": notice.role,
        "scheduledFor": as_utc(session.scheduled_for).isoformat(),
        "place": place,
        "placeBn": place_bn,
        "mode": session.mode,
        "status": session.status,
    }


def lookup_notice(db: Session, code: str) -> dict[str, Any] | None:
    if len(code) != 8 or not code.isdigit():
        return None
    notice = db.scalars(select(MediationNotice).where(MediationNotice.code == code)).first()
    return public_notice(db, notice) if notice else None


# --- attendance -------------------------------------------------------------------


def missed_in_a_row(db: Session, case: Case) -> dict[str, int]:
    """Each party's absences since they last came, over sessions with attendance recorded."""
    rows = db.execute(
        select(MediationAttendance.role, MediationAttendance.attendance)
        .join(MediationSession, MediationSession.id == MediationAttendance.session_id)
        .where(
            MediationSession.case_id == case.id,
            MediationSession.status != MediationStatus.CANCELLED,
        )
        .order_by(MediationSession.scheduled_for.desc(), MediationSession.id.desc())
    )
    missed = {str(role): 0 for role in ROLES}
    counting = set(missed)
    for role, attendance in rows:
        if role not in counting:
            continue
        if attendance == Attendance.ABSENT:
            missed[role] += 1
        else:
            counting.discard(role)
    return missed


def refresh_no_show(db: Session, case: Case) -> dict[str, int]:
    """Flag the case while anyone is at the no-show limit; returns the counts."""
    missed = missed_in_a_row(db, case)
    if max(missed.values()) >= get_settings().mediation_no_show_limit:
        case.add_flag(NO_SHOW_FLAG)
    else:
        case.remove_flag(NO_SHOW_FLAG)
    return missed


def next_session(db: Session, case: Case, after: datetime) -> MediationSession | None:
    """The soonest scheduled session after ``after`` that is still ahead."""
    start = max(as_utc(after), utcnow())
    sessions = db.scalars(
        select(MediationSession)
        .where(
            MediationSession.case_id == case.id,
            MediationSession.status == MediationStatus.SCHEDULED,
        )
        .order_by(MediationSession.scheduled_for, MediationSession.id)
    )
    return next((s for s in sessions if as_utc(s.scheduled_for) > start), None)


def record_attendance(
    db: Session, case: Case, session: MediationSession, came: dict[str, Attendance], actor: str
) -> dict[str, int]:
    """Who came to ``session`` (recording it again replaces it). Caller commits.

    Returns how many sessions in a row each party has now missed; a party at the
    limit is looked for through their UDC if a later session is already scheduled.
    """
    recorded = {
        row.role: row
        for row in db.scalars(
            select(MediationAttendance).where(MediationAttendance.session_id == session.id)
        )
    }
    for role in ROLES:
        party = case.party_with_role(role)
        if party is None:
            continue
        row = recorded.get(role)
        if row is None:
            row = MediationAttendance(session_id=session.id, role=role)
            db.add(row)
        row.party_id = party.id
        row.attendance = came[role]
        row.recorded_by = actor
        row.recorded_at = utcnow()
    both = all(came[role] == Attendance.PRESENT for role in ROLES)
    session.status = MediationStatus.HELD if both else MediationStatus.MISSED
    db.flush()
    record_audit(
        db,
        actor=actor,
        action=AuditAction.MEDIATION_ATTENDANCE,
        entity_type="case",
        entity_id=case.id,
        details={
            "sessionId": session.id,
            **{str(role): came[role] for role in ROLES},
            "status": session.status,
        },
    )
    missed = refresh_no_show(db, case)
    later = next_session(db, case, after=session.scheduled_for)
    if later is not None:
        ask_udcs(db, case, later, missed, actor)
    return missed


# --- UDC notices -------------------------------------------------------------------


def udc_hold_reasons(case: Case, party: Party, role: str) -> list[str]:
    """Why telling a UDC about this party must wait for an officer (empty: tell them)."""
    reasons = []
    if role == PartyRole.APPLICANT and party.safety_level != SafetyLevel.STANDARD:
        reasons.append("applicantSafety")
    # As for the parties' own notices: reaching anyone on such a case could endanger the applicant.
    return reasons + hold_reasons(case)


def ask_udcs(
    db: Session, case: Case, session: MediationSession, missed: dict[str, int], actor: str
) -> list[UdcNotice]:
    """Ask the UDC of each party at the no-show limit to tell them about ``session``.

    Once per session and party. Caller commits.
    """
    if as_utc(session.scheduled_for) <= utcnow():
        return []
    limit = get_settings().mediation_no_show_limit
    asked = []
    for role in ROLES:
        party = case.party_with_role(role)
        if party is None or missed.get(role, 0) < limit:
            continue
        exists = db.scalars(
            select(UdcNotice.id).where(
                UdcNotice.session_id == session.id, UdcNotice.party_id == party.id
            )
        ).first()
        if exists is not None:
            continue
        udc = udc_for_upazila(party.upazila)
        reasons = udc_hold_reasons(case, party, role)
        if udc is None:
            status = UdcNoticeStatus.NO_UDC
            reasons = [] if party.upazila else ["noUpazila"]
        elif reasons:
            status = UdcNoticeStatus.HELD
        else:
            status = UdcNoticeStatus.SENT  # set from the SMS result below
        notice = UdcNotice(
            case_id=case.id, party_id=party.id, role=role, session_id=session.id,
            udc_id=udc.id if udc else None, missed_in_a_row=missed[role],
            status=status, reasons=reasons,
        )  # fmt: skip
        db.add(notice)
        db.flush()
        if status == UdcNoticeStatus.HELD:
            record_audit(
                db,
                actor=actor,
                action=AuditAction.NOTICE_HELD,
                entity_type="case",
                entity_id=case.id,
                details={
                    "notice": "udc",
                    "noticeId": notice.id,
                    "role": role,
                    "sessionId": session.id,
                    "reasons": reasons,
                },
            )
        elif udc is not None:
            _send_to_udc(db, notice, case, party, session, udc, actor)
        asked.append(notice)
    return asked


def _send_to_udc(
    db: Session,
    notice: UdcNotice,
    case: Case,
    party: Party,
    session: MediationSession,
    udc: Udc,
    actor: str,
) -> None:
    # Not a party, so not safe_contact; the same client, so the same dry run and allowlist.
    result = AdnSmsClient().send(udc.phone, udc_text(case, party, session))
    notice.status = UdcNoticeStatus.SENT if result.ok else UdcNoticeStatus.FAILED
    notice.reasons = [] if result.ok else ["smsFailed"]
    notice.sms = {"dryRun": result.dry_run}
    record_audit(
        db,
        actor=actor,
        action=AuditAction.UDC_NOTIFIED,
        entity_type="case",
        entity_id=case.id,
        # Never the message: it names the person and where they live.
        details={
            "noticeId": notice.id,
            "udcId": udc.id,
            "role": notice.role,
            "sessionId": session.id,
            "to": f"{udc.phone[:5]}******",
            "delivered": result.ok,
            "dryRun": result.dry_run,
            "providerId": result.provider_id,
            "error": result.error,
        },
    )


def release_udc_notice(db: Session, notice: UdcNotice, actor: str, justification: str) -> None:
    """Send a held UDC notice on an officer's judgement. Caller commits."""
    record_audit(
        db,
        actor=actor,
        action=AuditAction.UDC_NOTICE_RELEASED,
        entity_type="case",
        entity_id=notice.case_id,
        details={"noticeId": notice.id, "role": notice.role, "reasons": notice.reasons},
        justification=justification.strip(),
    )
    notice.released_by = actor
    case = db.get(Case, notice.case_id)
    party = db.get(Party, notice.party_id)
    session = db.get(MediationSession, notice.session_id)
    udc = get_udc(notice.udc_id) if notice.udc_id else None
    assert case is not None and party is not None and session is not None
    if udc is None:
        notice.status, notice.reasons = UdcNoticeStatus.NO_UDC, []
        return
    _send_to_udc(db, notice, case, party, session, udc, actor)


def mark_informed(db: Session, notice: UdcNotice, udc: Udc, note: str | None) -> None:
    """The UDC reports that it told the person. Caller commits."""
    notice.status = UdcNoticeStatus.INFORMED
    notice.informed_at = utcnow()
    notice.informed_note = (note or "").strip() or None
    record_audit(
        db,
        actor=udc.actor,
        action=AuditAction.UDC_INFORMED,
        entity_type="case",
        entity_id=notice.case_id,
        details={
            "noticeId": notice.id,
            "udcId": udc.id,
            "role": notice.role,
            "sessionId": notice.session_id,
            "withNote": notice.informed_note is not None,
        },
    )


def udc_notice_view(db: Session, notice: UdcNotice) -> dict[str, Any]:
    case = db.get(Case, notice.case_id)
    party = db.get(Party, notice.party_id)
    session = db.get(MediationSession, notice.session_id)
    assert case is not None and party is not None and session is not None
    udc = get_udc(notice.udc_id) if notice.udc_id else None
    place, place_bn = place_of(session.mode)
    return {
        "id": notice.id,
        "caseRef": case.display_id,
        "role": notice.role,
        "party": {
            "name": party.name,
            "nameBn": party.name_bn,
            "fatherName": party.guardian_name,
            "village": party.village,
            "upazila": party.upazila,
        },
        "udc": udc.view() if udc else None,
        "session": {
            "id": session.id,
            "scheduledFor": as_utc(session.scheduled_for).isoformat(),
            "place": place,
            "placeBn": place_bn,
        },
        "missedInARow": notice.missed_in_a_row,
        "status": notice.status,
        "reasons": notice.reasons or [],
        "createdAt": as_utc(notice.created_at).isoformat(),
        "informedAt": as_utc(notice.informed_at).isoformat() if notice.informed_at else None,
        "informedNote": notice.informed_note,
    }


# --- sessions as the dashboard sees them ------------------------------------------------


def session_views(db: Session, sessions: list[MediationSession]) -> list[dict[str, Any]]:
    ids = [s.id for s in sessions]
    came: dict[int, dict[str, str]] = defaultdict(dict)
    for row in db.scalars(
        select(MediationAttendance).where(MediationAttendance.session_id.in_(ids))
    ):
        came[row.session_id][row.role] = row.attendance
    told: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for notice in db.scalars(
        select(MediationNotice)
        .where(MediationNotice.session_id.in_(ids))
        .order_by(MediationNotice.id)
    ):
        told[notice.session_id].append(notice_view(notice))
    views = []
    for s in sessions:
        place, place_bn = place_of(s.mode)
        views.append(
            {
                "id": s.id,
                "caseId": s.case_id,
                "scheduledFor": as_utc(s.scheduled_for).isoformat(),
                "durationMinutes": s.duration_minutes,
                "mode": s.mode,
                "status": s.status,
                "meetingUrl": s.meeting_url,
                "notes": s.notes,
                "settlementDocumentId": s.settlement_document_id,
                "place": place,
                "placeBn": place_bn,
                "attendance": {str(r): came[s.id].get(r) for r in ROLES},
                "notices": told[s.id],
            }
        )
    return views


def session_view(db: Session, session: MediationSession) -> dict[str, Any]:
    return session_views(db, [session])[0]
