"""Court and jail records as each role may see them, and the queries behind the views.

- A court sees its own register, cause lists and submissions; a jail its own prisoners
  and submissions. The routers answer 404 for another office's records, so their IDs
  are not confirmed.
- An officer, or the panel lawyer assigned to the case, sees only the records linked
  to a legal aid case (``case_records``), plus the same person's earlier court cases
  that are not restricted. The routers audit every such read.

A case is matched across courts, jails and cause lists by court and number key
(``models.records.case_number_key``). "Today" is the office's date: a cause list
entry for today is upcoming until midnight in Rangpur, not in UTC.
"""

from collections import defaultdict
from collections.abc import Iterable, Sequence
from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import as_utc, utcnow
from app.models import (
    AuditAction,
    Case,
    CaseRecordLink,
    CauseListEntry,
    CourtCase,
    CourtCaseLawyer,
    CourtCaseParty,
    CourtProceeding,
    Document,
    InstitutionApplication,
    Prisoner,
    PrisonerCase,
    PrisonerStatus,
    case_number_key,
    record_audit,
)
from app.services.case_status import stage_of
from app.services.courts import COURTS_BY_ID, get_court_staff
from app.services.panel import get_lawyer
from app.services.prisons import PRISONS_BY_ID, get_prison_staff

# Held now: the jail must produce them in court on each date.
IN_CUSTODY = (PrisonerStatus.UNDERTRIAL, PrisonerStatus.CONVICTED)
SEARCH_LIMIT = 20

# (court ID, number key): how a case is named across courts, jails and cause lists.
Key = tuple[str, str]


def office_today() -> date:
    return utcnow().astimezone(get_settings().tz).date()


def date_range(start: date | None, end: date | None, *, days: int, limit: int) -> tuple[date, date]:
    """A ``from``..``to`` query: from today and ``days`` ahead unless given, ``limit`` at most."""
    start = start or office_today()
    end = end or start + timedelta(days=days)
    if end < start:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "'to' is before 'from'")
    if (end - start).days > limit:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"Ask for at most {limit} days at a time"
        )
    return start, end


def number_key_or_422(case_number: str) -> str:
    key = case_number_key(case_number)
    if not key.strip("/"):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"{case_number!r} is not a case number"
        )
    return key


def court_ref(court_id: str) -> dict[str, Any]:
    court = COURTS_BY_ID.get(court_id)
    if court is None:
        return {"id": court_id, "name": court_id, "nameBn": court_id, "kind": "other"}
    return court.ref()


def prison_ref(prison_id: str) -> dict[str, Any]:
    prison = PRISONS_BY_ID.get(prison_id)
    return prison.ref() if prison else {"id": prison_id, "name": prison_id, "nameBn": prison_id}


def office_ref(kind: str, office_id: str) -> dict[str, Any]:
    return court_ref(office_id) if kind == "court" else prison_ref(office_id)


def staff_ref(kind: str, staff_id: str) -> dict[str, Any]:
    staff = get_court_staff(staff_id) if kind == "court" else get_prison_staff(staff_id)
    if staff is None:
        return {"id": staff_id, "name": staff_id, "nameBn": staff_id}
    return {"id": staff.id, "name": staff.name, "nameBn": staff.name_bn}


def lawyer_ref(lawyer_id: str | None) -> dict[str, Any] | None:
    lawyer = get_lawyer(lawyer_id) if lawyer_id else None
    return {"id": lawyer.id, "name": lawyer.name, "nameBn": lawyer.name_bn} if lawyer else None


def submitted_by_summary(case: Case) -> dict[str, Any] | None:
    """For the DLAO's case lists: the court or jail that submitted it, from intake data."""
    info = (case.intake_data or {}).get("submittedBy")
    if not info:
        return None
    office = office_ref(info["kind"], info["officeId"])
    staff = staff_ref(info["kind"], info["staffId"])
    return {
        "kind": info["kind"],
        "officeId": office["id"],
        "officeName": office["name"],
        "officeNameBn": office["nameBn"],
        "staffName": staff["name"],
        "staffNameBn": staff["nameBn"],
    }


# --- lookups scoped to one office ----------------------------------------------


def own_court_case(db: Session, court_id: str, court_case_id: int) -> CourtCase:
    found = db.get(CourtCase, court_case_id)
    if found is None or found.court_id != court_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No court case {court_case_id}")
    return found


def own_prisoner(db: Session, prison_id: str, prisoner_id: int) -> Prisoner:
    found = db.get(Prisoner, prisoner_id)
    if found is None or found.prison_id != prison_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No prisoner {prisoner_id}")
    return found


# --- batched queries -------------------------------------------------------------


def upcoming_entries(
    db: Session, keys: Iterable[Key], start: date, end: date | None = None
) -> dict[Key, list[CauseListEntry]]:
    """Cause list entries from ``start`` (to ``end``) for these cases, soonest first."""
    wanted = set(keys)
    if not wanted:
        return {}
    query = (
        select(CauseListEntry)
        .where(
            CauseListEntry.number_key.in_({k for _, k in wanted}),
            CauseListEntry.listed_on >= start,
        )
        .order_by(CauseListEntry.listed_on, CauseListEntry.serial)
    )
    if end is not None:
        query = query.where(CauseListEntry.listed_on <= end)
    found: dict[Key, list[CauseListEntry]] = defaultdict(list)
    for entry in db.scalars(query):
        if (entry.court_id, entry.number_key) in wanted:
            found[(entry.court_id, entry.number_key)].append(entry)
    return found


def registered_cases(db: Session, keys: Iterable[Key]) -> dict[Key, CourtCase]:
    wanted = set(keys)
    if not wanted:
        return {}
    rows = db.scalars(select(CourtCase).where(CourtCase.number_key.in_({k for _, k in wanted})))
    return {(c.court_id, c.number_key): c for c in rows if (c.court_id, c.number_key) in wanted}


def held_on(db: Session, keys: Iterable[Key]) -> dict[Key, list[Prisoner]]:
    """Prisoners in any jail held on these cases (released ones too)."""
    wanted = set(keys)
    if not wanted:
        return {}
    rows = db.execute(
        select(PrisonerCase, Prisoner)
        .join(Prisoner, Prisoner.id == PrisonerCase.prisoner_id)
        .where(PrisonerCase.number_key.in_({k for _, k in wanted}))
        .order_by(Prisoner.id)
    )
    found: dict[Key, list[Prisoner]] = defaultdict(list)
    for link, prisoner in rows:
        if (link.court_id, link.number_key) in wanted:
            found[(link.court_id, link.number_key)].append(prisoner)
    return found


def legal_aid_links(
    db: Session, *, court_case_ids: Iterable[int] = (), prisoner_ids: Iterable[int] = ()
) -> tuple[dict[int, list[dict[str, Any]]], dict[int, list[dict[str, Any]]]]:
    """Legal aid cases linked to these court cases and prisoners, by record ID."""
    cc_ids, p_ids = set(court_case_ids), set(prisoner_ids)
    by_case: dict[int, list[dict[str, Any]]] = defaultdict(list)
    by_prisoner: dict[int, list[dict[str, Any]]] = defaultdict(list)
    if not cc_ids and not p_ids:
        return by_case, by_prisoner
    rows = db.execute(
        select(CaseRecordLink, Case)
        .join(Case, Case.id == CaseRecordLink.case_id)
        .where(
            or_(
                CaseRecordLink.court_case_id.in_(cc_ids),
                CaseRecordLink.prisoner_id.in_(p_ids),
            )
        )
        .order_by(CaseRecordLink.id)
    )
    for link, case in rows:
        view = {
            "id": case.display_id,
            "stage": stage_of(case),
            "lawyer": lawyer_ref(case.lawyer_id),
        }
        if link.court_case_id in cc_ids:
            by_case[link.court_case_id].append(view)
        if link.prisoner_id in p_ids:
            by_prisoner[link.prisoner_id].append(view)
    return by_case, by_prisoner


# --- court cases -------------------------------------------------------------------


def slot_view(entry: CauseListEntry) -> dict[str, Any]:
    return {
        "date": entry.listed_on.isoformat(),
        "serial": entry.serial,
        "time": entry.time,
        "purpose": entry.purpose,
        "judge": entry.judge,
    }


def next_date(
    court_case: CourtCase, entries: Sequence[CauseListEntry], today: date
) -> tuple[date, str | None] | None:
    """The soonest upcoming cause list entry, else the date the last proceeding fixed."""
    upcoming = [e for e in entries if e.listed_on >= today]
    if upcoming:
        return upcoming[0].listed_on, upcoming[0].purpose
    last = court_case.proceedings[-1] if court_case.proceedings else None
    if last is not None and last.next_date is not None and last.next_date >= today:
        return last.next_date, last.next_purpose
    return None


def key_of(court_case: CourtCase) -> Key:
    return (court_case.court_id, court_case.number_key)


def party_view(party: CourtCaseParty) -> dict[str, Any]:
    # A party's NID never leaves the court's register, not even its last digits.
    return {
        "name": party.name,
        "nameBn": party.name_bn,
        "role": party.role,
        "fatherName": party.father_name,
        "age": party.age,
    }


def court_case_summary(
    court_case: CourtCase, entries: Sequence[CauseListEntry], today: date
) -> dict[str, Any]:
    nxt = next_date(court_case, entries, today)
    return {
        "id": court_case.id,
        "court": court_ref(court_case.court_id),
        "caseNumber": court_case.case_number,
        "caseType": court_case.case_type,
        "title": court_case.title,
        "sections": court_case.sections,
        "filedOn": court_case.filed_on.isoformat() if court_case.filed_on else None,
        "status": court_case.status,
        "restricted": court_case.restricted,
        "nextDate": nxt[0].isoformat() if nxt else None,
        "nextPurpose": nxt[1] if nxt else None,
        "parties": [party_view(p) for p in court_case.parties],
    }


def court_case_summaries(
    db: Session, cases: Sequence[CourtCase], today: date | None = None
) -> list[dict[str, Any]]:
    today = today or office_today()
    entries = upcoming_entries(db, (key_of(c) for c in cases), today)
    return [court_case_summary(c, entries.get(key_of(c), []), today) for c in cases]


def proceeding_view(p: CourtProceeding) -> dict[str, Any]:
    return {
        "id": p.id,
        "heldOn": p.held_on.isoformat(),
        "kind": p.kind,
        "summary": p.summary,
        "nextDate": p.next_date.isoformat() if p.next_date else None,
        "nextPurpose": p.next_purpose,
        "recordedBy": p.recorded_by,
        "recordedAt": as_utc(p.recorded_at).isoformat(),
    }


def court_lawyer_view(lawyer: CourtCaseLawyer) -> dict[str, Any]:
    return {
        "id": lawyer.id,
        "name": lawyer.name,
        "nameBn": lawyer.name_bn,
        "side": lawyer.side,
        "enrolment": lawyer.enrolment,
        "panelLawyerId": lawyer.panel_lawyer_id,
        "from": lawyer.appeared_from.isoformat() if lawyer.appeared_from else None,
        "until": lawyer.appeared_until.isoformat() if lawyer.appeared_until else None,
        "current": lawyer.appeared_until is None,
    }


def court_case_details(
    db: Session, cases: Sequence[CourtCase], today: date | None = None
) -> list[dict[str, Any]]:
    today = today or office_today()
    keys = [key_of(c) for c in cases]
    entries = upcoming_entries(db, keys, today)
    custody = held_on(db, keys)
    legal_aid, _ = legal_aid_links(db, court_case_ids=(c.id for c in cases))
    views = []
    for c in cases:
        slots = entries.get(key_of(c), [])
        views.append(
            {
                **court_case_summary(c, slots, today),
                "proceedings": [proceeding_view(p) for p in c.proceedings],
                "lawyers": [court_lawyer_view(lawyer) for lawyer in c.lawyers],
                "causeList": [slot_view(e) for e in slots],
                # The court needs to know who to ask the jail to produce.
                "custody": [
                    {
                        "prison": prison_ref(p.prison_id),
                        "prisonerNo": p.prisoner_no,
                        "status": p.status,
                    }
                    for p in custody.get(key_of(c), [])
                ],
                "legalAid": legal_aid.get(c.id, []),
            }
        )
    return views


def court_case_detail(db: Session, court_case: CourtCase) -> dict[str, Any]:
    return court_case_details(db, [court_case])[0]


def matching_court_cases(q: str) -> Any:
    """A filter on court cases: number key, title or a party's name, ignoring case."""
    needle = q.strip()
    parties = select(CourtCaseParty.court_case_id).where(
        or_(
            CourtCaseParty.name.icontains(needle, autoescape=True),
            CourtCaseParty.name_bn.contains(needle, autoescape=True),
        )
    )
    conditions = [
        CourtCase.title.icontains(needle, autoescape=True),
        CourtCase.id.in_(parties),
    ]
    if key := case_number_key(needle):
        conditions.append(CourtCase.number_key.contains(key, autoescape=True))
    return or_(*conditions)


NEWEST_FILED = (CourtCase.filed_on.desc().nulls_last(), CourtCase.id.desc())


# --- cause lists -----------------------------------------------------------------


def cause_list_view(db: Session, court_id: str, day: date) -> dict[str, Any]:
    entries = db.scalars(
        select(CauseListEntry)
        .where(CauseListEntry.court_id == court_id, CauseListEntry.listed_on == day)
        .order_by(CauseListEntry.serial)
    ).all()
    keys = [(court_id, e.number_key) for e in entries]
    registered = registered_cases(db, keys)
    custody = held_on(db, keys)
    rows = []
    for e in entries:
        # Linked as soon as the court registers the case, whichever came first.
        found = registered.get((court_id, e.number_key))
        held = custody.get((court_id, e.number_key), [])
        rows.append(
            {
                "serial": e.serial,
                "time": e.time,
                "caseNumber": e.case_number,
                "purpose": e.purpose,
                "courtCaseId": found.id if found else None,
                "title": found.title if found else None,
                "inCustody": any(p.status in IN_CUSTODY for p in held),
            }
        )
    first = entries[0] if entries else None
    return {
        "court": court_ref(court_id),
        "date": day.isoformat(),
        "judge": first.judge if first else None,
        "publishedAt": as_utc(first.published_at).isoformat() if first else None,
        "publishedBy": first.published_by if first else None,
        "entries": rows,
    }


# --- prisoners ---------------------------------------------------------------------


def prisoner_keys(prisoner: Prisoner) -> list[Key]:
    return [(pc.court_id, pc.number_key) for pc in prisoner.cases]


def prisoner_summary(
    prisoner: Prisoner,
    entries: dict[Key, list[CauseListEntry]],
    registered: dict[Key, CourtCase],
    today: date,
) -> dict[str, Any]:
    keys = prisoner_keys(prisoner)
    listed = [e.listed_on for k in keys for e in entries.get(k, [])]
    fixed = [
        nxt[0]
        for k in keys
        if (c := registered.get(k)) is not None and (nxt := next_date(c, [], today))
    ]
    soonest = min(listed or fixed, default=None)
    return {
        "id": prisoner.id,
        "prison": prison_ref(prisoner.prison_id),
        "prisonerNo": prisoner.prisoner_no,
        "name": prisoner.name,
        "nameBn": prisoner.name_bn,
        "fatherName": prisoner.father_name,
        "age": prisoner.age,
        "gender": prisoner.gender,
        "nidLast4": prisoner.nid_last4,
        "nidVerified": prisoner.nid_verified,
        "village": prisoner.village,
        "upazila": prisoner.upazila,
        "district": prisoner.district,
        "admittedOn": prisoner.admitted_on.isoformat(),
        "status": prisoner.status,
        "ward": prisoner.ward,
        "releasedOn": prisoner.released_on.isoformat() if prisoner.released_on else None,
        "nextCourtDate": soonest.isoformat() if soonest else None,
    }


def _prisoner_context(
    db: Session, prisoners: Sequence[Prisoner], today: date
) -> tuple[dict[Key, list[CauseListEntry]], dict[Key, CourtCase]]:
    keys = [k for p in prisoners for k in prisoner_keys(p)]
    return upcoming_entries(db, keys, today), registered_cases(db, keys)


def prisoner_summaries(
    db: Session, prisoners: Sequence[Prisoner], today: date | None = None
) -> list[dict[str, Any]]:
    today = today or office_today()
    entries, registered = _prisoner_context(db, prisoners, today)
    return [prisoner_summary(p, entries, registered, today) for p in prisoners]


def prison_case_view(
    link: PrisonerCase, found: CourtCase | None, entries: list[CauseListEntry], today: date
) -> dict[str, Any]:
    """What a jail sees of a case its prisoner is held on: enough to produce them."""
    if found is not None:
        nxt = next_date(found, entries, today)
    else:
        nxt = (entries[0].listed_on, entries[0].purpose) if entries else None
    return {
        "court": court_ref(link.court_id),
        "caseNumber": found.case_number if found else link.case_number,
        "found": found is not None,
        "caseType": found.case_type if found else None,
        "sections": found.sections if found else None,
        "status": found.status if found else None,
        "nextDate": nxt[0].isoformat() if nxt else None,
        "nextPurpose": nxt[1] if nxt else None,
        "causeList": [slot_view(e) for e in entries],
    }


def prisoner_details(
    db: Session,
    prisoners: Sequence[Prisoner],
    today: date | None = None,
    *,
    with_legal_aid: bool = True,
) -> list[dict[str, Any]]:
    today = today or office_today()
    entries, registered = _prisoner_context(db, prisoners, today)
    legal_aid: dict[int, list[dict[str, Any]]] = {}
    if with_legal_aid:
        _, legal_aid = legal_aid_links(db, prisoner_ids=(p.id for p in prisoners))
    views = []
    for p in prisoners:
        cases = [
            prison_case_view(
                link,
                registered.get((link.court_id, link.number_key)),
                entries.get((link.court_id, link.number_key), []),
                today,
            )
            for link in p.cases
        ]
        views.append(
            {
                **prisoner_summary(p, entries, registered, today),
                "cases": cases,
                "legalAid": legal_aid.get(p.id, []),
            }
        )
    return views


def prisoner_detail(db: Session, prisoner: Prisoner) -> dict[str, Any]:
    return prisoner_details(db, [prisoner])[0]


def matching_prisoners(q: str) -> Any:
    needle = q.strip()
    return or_(
        Prisoner.prisoner_no.icontains(needle, autoescape=True),
        Prisoner.name.icontains(needle, autoescape=True),
        Prisoner.name_bn.contains(needle, autoescape=True),
        Prisoner.father_name.icontains(needle, autoescape=True),
    )


# --- a legal aid case's records (DLAO and panel lawyer) ------------------------------


def links_of(db: Session, case: Case) -> list[CaseRecordLink]:
    return list(
        db.scalars(
            select(CaseRecordLink)
            .where(CaseRecordLink.case_id == case.id)
            .order_by(CaseRecordLink.id)
        )
    )


def application_of(db: Session, case: Case) -> InstitutionApplication | None:
    return db.scalars(
        select(InstitutionApplication).where(InstitutionApplication.case_id == case.id)
    ).first()


def previous_records(
    db: Session, case: Case, prisoner: Prisoner | None, linked: Iterable[int]
) -> list[CourtCase]:
    """The same person's other court cases, never restricted ones or those already linked.

    The same person: a party with the applicant's (or the linked prisoner's) NID hash,
    or with exactly their name and father's name, ignoring case.
    """
    applicant = case.applicant
    people = [
        (applicant.nid_hash, applicant.name, applicant.guardian_name) if applicant else None,
        (prisoner.nid_hash, prisoner.name, prisoner.father_name) if prisoner else None,
    ]
    hashes = {p[0] for p in people if p and p[0]}
    names = {(p[1].casefold(), p[2].casefold()) for p in people if p and p[1] and p[2]}
    conditions = []
    if hashes:
        conditions.append(CourtCaseParty.nid_hash.in_(hashes))
    if names:
        conditions.append(func.lower(CourtCaseParty.name).in_({n for n, _ in names}))
    if not conditions:
        return []
    ids = {
        party.court_case_id
        for party in db.scalars(select(CourtCaseParty).where(or_(*conditions)))
        if party.nid_hash in hashes
        or (party.name.casefold(), (party.father_name or "").casefold()) in names
    } - set(linked)
    if not ids:
        return []
    return list(
        db.scalars(
            select(CourtCase)
            .where(CourtCase.id.in_(ids), CourtCase.restricted.is_(False))
            .order_by(*NEWEST_FILED)
        )
    )


def case_records(db: Session, case: Case, *, for_lawyer: bool = False) -> dict[str, Any]:
    """Everything linked to a legal aid case, for the DLAO or (``for_lawyer``) its lawyer.

    The lawyer's view leaves out even the last digits of the NID.
    """
    today = office_today()
    links = links_of(db, case)
    cc_ids = list(dict.fromkeys(link.court_case_id for link in links if link.court_case_id))
    p_ids = [link.prisoner_id for link in links if link.prisoner_id]
    by_id = {c.id: c for c in db.scalars(select(CourtCase).where(CourtCase.id.in_(cc_ids)))}
    court_cases = [by_id[i] for i in cc_ids if i in by_id]
    prisoner = db.get(Prisoner, p_ids[0]) if p_ids else None
    prisoner_view = None
    if prisoner is not None:
        prisoner_view = prisoner_details(db, [prisoner], today, with_legal_aid=False)[0]
        if for_lawyer:
            prisoner_view["nidLast4"] = None

    app = application_of(db, case)
    submitted = None
    ekyc = signature = None
    if app is not None:
        submitted = {
            "kind": app.office_kind,
            "office": office_ref(app.office_kind, app.office_id),
            "staff": staff_ref(app.office_kind, app.staff_id),
            "submittedAt": as_utc(app.submitted_at).isoformat(),
            "helpNeeded": app.help_needed,
            "inCustody": app.in_custody,
        }
        if (check := app.ekyc_check) is not None:
            ekyc = {
                "status": check.result,
                "at": as_utc(check.created_at).isoformat(),
                "by": check.performed_by,
                "nidLast4": None if for_lawyer else check.nid_last4,
            }
        doc = db.get(Document, app.signature_document_id) if app.signature_document_id else None
        if doc is not None:
            signature = {
                "uploadedAt": as_utc(doc.created_at).isoformat(),
                "by": doc.uploaded_by,
                "documentId": doc.id,
                "sha256": doc.sha256,
            }
    previous = previous_records(db, case, prisoner, cc_ids)
    return {
        "submittedBy": submitted,
        "identity": {"ekyc": ekyc, "signature": signature},
        "courtCases": court_case_details(db, court_cases, today),
        "prisoner": prisoner_view,
        "previousRecords": court_case_summaries(db, previous, today),
    }


def audit_records_viewed(db: Session, case: Case, view: dict[str, Any], actor: str) -> None:
    record_audit(
        db,
        actor=actor,
        action=AuditAction.RECORDS_VIEWED,
        entity_type="case",
        entity_id=case.id,
        details={
            "courtCases": [c["id"] for c in view["courtCases"]],
            "prisoner": (view["prisoner"] or {}).get("id"),
            "previousRecords": [c["id"] for c in view["previousRecords"]],
        },
    )


def link_record(
    db: Session,
    case: Case,
    *,
    actor: str,
    court_case: CourtCase | None = None,
    prisoner: Prisoner | None = None,
) -> bool:
    """Link one record to the case (audited); False if it already was."""
    query = select(CaseRecordLink.id).where(CaseRecordLink.case_id == case.id)
    if court_case is not None:
        query = query.where(CaseRecordLink.court_case_id == court_case.id)
    elif prisoner is not None:
        query = query.where(CaseRecordLink.prisoner_id == prisoner.id)
    else:
        raise ValueError("link a court case or a prisoner")
    if db.scalars(query).first() is not None:
        return False
    link = CaseRecordLink(
        case_id=case.id,
        court_case_id=court_case.id if court_case else None,
        prisoner_id=prisoner.id if prisoner else None,
        linked_by=actor,
        linked_at=utcnow(),
    )
    db.add(link)
    db.flush()
    record_audit(
        db,
        actor=actor,
        action=AuditAction.RECORD_LINKED,
        entity_type="case",
        entity_id=case.id,
        details=(
            {"courtCaseId": court_case.id} if court_case else {"prisonerId": link.prisoner_id}
        ),
    )
    return True
