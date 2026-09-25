"""T3 group incidents: link cases that come from the same event.

When twenty workers from one factory report the same unpaid wages, or several
families report the same land grab, one incident record lets the office act
once, keep evidence together and keep the applicants' accounts consistent.
Suggestions are only suggestions: an officer confirms every link.
"""

from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from rapidfuzz import fuzz
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import as_utc, get_db, utcnow
from app.models import AuditAction, Case, Incident, PartyRole, next_reference, record_audit
from app.routers import current_actor, require_api_token
from app.routers.dlao import OPEN_STATUSES, case_view, get_case_or_404

router = APIRouter(
    prefix="/incidents", tags=["incidents"], dependencies=[Depends(require_api_token)]
)

SUGGESTION_WINDOW_DAYS = 30
SUMMARY_SIMILARITY = 60
RESPONDENT_SIMILARITY = 85


def incident_view(incident: Incident, *, with_cases: bool = True) -> dict[str, Any]:
    view: dict[str, Any] = {
        "id": incident.reference,
        "title": incident.title,
        "description": incident.description,
        "location": incident.location,
        "respondent": incident.respondent,
        "occurredOn": incident.occurred_on.date().isoformat() if incident.occurred_on else None,
        "createdBy": incident.created_by,
        "caseCount": len(incident.cases),
    }
    if with_cases:
        view["cases"] = [case_view(c) for c in incident.cases]
    return view


def get_incident_or_404(db: Session, ref: str) -> Incident:
    incident = db.scalars(select(Incident).where(Incident.reference == ref)).first()
    if incident is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No incident {ref}")
    return incident


def link_cases(db: Session, incident: Incident, refs: list[str], actor: str) -> None:
    for ref in refs:
        case = get_case_or_404(db, ref)
        if case.incident_id not in (None, incident.id):
            raise HTTPException(
                status.HTTP_409_CONFLICT, f"{case.display_id} is linked to another incident"
            )
        if case.incident_id == incident.id:
            continue
        case.incident = incident
        record_audit(
            db,
            actor=actor,
            action=AuditAction.INCIDENT_LINKED,
            entity_type="case",
            entity_id=case.id,
            details={"incident": incident.reference, "linked": True},
        )


class IncidentIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=5000)
    location: str | None = Field(default=None, max_length=200)
    respondent: str | None = Field(default=None, max_length=200)
    occurred_on: date | None = None
    case_refs: list[str] = []


class LinkIn(BaseModel):
    case_refs: list[str] = Field(min_length=1)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_incident(
    body: IncidentIn, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    incident = Incident(
        reference=next_reference(db, "INC", utcnow().year),
        title=body.title.strip(),
        description=body.description.strip(),
        location=body.location,
        respondent=body.respondent,
        occurred_on=datetime.combine(body.occurred_on, datetime.min.time())
        if body.occurred_on
        else None,
        created_by=actor,
    )
    db.add(incident)
    db.flush()
    link_cases(db, incident, body.case_refs, actor)
    db.commit()
    db.refresh(incident)
    return incident_view(incident)


@router.get("/suggestions")
def suggestions(case_ref: str, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    """Open cases that look like the same event as ``case_ref``, best match first."""
    case = get_case_or_404(db, case_ref)
    received = as_utc(case.received_at)
    window = timedelta(days=SUGGESTION_WINDOW_DAYS)
    respondent = case.party_with_role(PartyRole.RESPONDENT)
    query = select(Case).where(Case.id != case.id, Case.status.in_(OPEN_STATUSES))
    if case.category:
        query = query.where(Case.category == case.category)
    out = []
    for other in db.scalars(query):
        if abs(as_utc(other.received_at) - received) > window:
            continue
        same_place = bool(
            (case.upazila and case.upazila == other.upazila)
            or (not case.upazila and case.district and case.district == other.district)
        )
        text = fuzz.token_set_ratio(case.summary.casefold(), other.summary.casefold())
        other_resp = other.party_with_role(PartyRole.RESPONDENT)
        resp = (
            fuzz.token_sort_ratio(respondent.name.casefold(), other_resp.name.casefold())
            if respondent and other_resp
            else 0
        )
        reasons = []
        if same_place:
            reasons.append("same area")
        if text >= SUMMARY_SIMILARITY:
            reasons.append("similar account")
        if resp >= RESPONDENT_SIMILARITY:
            reasons.append("same respondent")
        # One weak signal is not enough to suggest a link.
        if len(reasons) < 2 and "same respondent" not in reasons:
            continue
        out.append(
            {
                "caseId": other.display_id,
                "reasons": reasons,
                "summarySimilarity": round(text / 100, 2),
                "incidentId": other.incident.reference if other.incident else None,
            }
        )
    return sorted(out, key=lambda s: (-len(s["reasons"]), -s["summarySimilarity"]))


@router.get("/{ref}")
def get_incident(ref: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    return incident_view(get_incident_or_404(db, ref))


@router.get("")
def list_incidents(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.scalars(select(Incident).order_by(Incident.id.desc()))
    return [incident_view(i, with_cases=False) for i in rows]


@router.post("/{ref}/cases")
def add_cases(
    ref: str, body: LinkIn, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    incident = get_incident_or_404(db, ref)
    link_cases(db, incident, body.case_refs, actor)
    db.commit()
    db.refresh(incident)
    return incident_view(incident)


@router.delete("/{ref}/cases/{case_ref}")
def remove_case(
    ref: str, case_ref: str, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    incident = get_incident_or_404(db, ref)
    case = get_case_or_404(db, case_ref)
    if case.incident_id != incident.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{case.display_id} is not in {ref}")
    case.incident = None
    record_audit(
        db,
        actor=actor,
        action=AuditAction.INCIDENT_LINKED,
        entity_type="case",
        entity_id=case.id,
        details={"incident": incident.reference, "linked": False},
    )
    db.commit()
    db.refresh(incident)
    return incident_view(incident)
