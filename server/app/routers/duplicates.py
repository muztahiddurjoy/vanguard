"""T4 duplicate detection: fuzzy matching of applicants and the officer's decision.

A pair is scored field by field over what both records have (a missing field
neither helps nor hurts). Matches above ``THRESHOLD`` are queued for review;
nothing is ever merged automatically. Two people who share a name, phone and
village but have different National IDs are different people, so merging
such a pair is blocked, as the dashboard shows.
"""

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from rapidfuzz import fuzz
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db, utcnow
from app.models import (
    AuditAction,
    Case,
    CaseParty,
    DuplicateReview,
    DuplicateStatus,
    Party,
    PartyRole,
    record_audit,
)
from app.routers import current_actor, require_api_token
from app.routers.dlao import party_view

router = APIRouter(
    prefix="/duplicates", tags=["duplicates"], dependencies=[Depends(require_api_token)]
)

THRESHOLD = 0.75
FIELD_MATCH = 0.85
WEIGHTS = {"name": 0.35, "phone": 0.25, "guardian": 0.15, "nid": 0.10, "village": 0.10, "age": 0.05}
MAX_CANDIDATES = 500


def _text_sim(a: str | None, b: str | None) -> float | None:
    if not a or not b:
        return None
    return fuzz.token_sort_ratio(a.casefold(), b.casefold()) / 100


def field_similarities(a: Party, b: Party) -> dict[str, float]:
    """Similarity in [0, 1] for each field both parties have."""
    sims: dict[str, float | None] = {
        "name": max(
            (
                s
                for s in (_text_sim(a.name, b.name), _text_sim(a.name_bn, b.name_bn))
                if s is not None
            ),
            default=None,
        ),
        "phone": float(a.phone == b.phone) if a.phone and b.phone else None,
        "guardian": _text_sim(a.guardian_name, b.guardian_name),
        "nid": float(a.nid_hash == b.nid_hash) if a.nid_hash and b.nid_hash else None,
        "village": _text_sim(a.village, b.village),
        "age": (
            max(0.0, 1 - abs(a.age - b.age) / 5)
            if a.age is not None and b.age is not None
            else None
        ),
    }
    return {k: v for k, v in sims.items() if v is not None}


def score_pair(a: Party, b: Party) -> tuple[float, list[str]]:
    sims = field_similarities(a, b)
    if "name" not in sims:
        return 0.0, []
    total = sum(WEIGHTS[k] for k in sims)
    score = sum(WEIGHTS[k] * v for k, v in sims.items()) / total
    return round(score, 2), [k for k, v in sims.items() if v >= FIELD_MATCH]


def merge_blocked_reason(a: Party, b: Party) -> str | None:
    if a.nid_hash and b.nid_hash and a.nid_hash != b.nid_hash:
        return "different_national_ids"
    return None


def find_duplicates_for(db: Session, party: Party) -> list[DuplicateReview]:
    """Score ``party`` against other applicants and queue new likely matches."""
    applicant_ids = select(CaseParty.party_id).where(CaseParty.role == PartyRole.APPLICANT)
    conditions = []
    if party.phone:
        conditions.append(Party.phone == party.phone)
    if party.nid_hash:
        conditions.append(Party.nid_hash == party.nid_hash)
    if party.upazila:
        conditions.append(Party.upazila == party.upazila)
    elif party.district:
        conditions.append(Party.district == party.district)
    if not conditions:
        return []
    candidates = db.scalars(
        select(Party)
        .where(Party.id != party.id, Party.id.in_(applicant_ids), or_(*conditions))
        .limit(MAX_CANDIDATES)
    )
    created = []
    for other in candidates:
        score, fields = score_pair(party, other)
        if score < THRESHOLD:
            continue
        a_id, b_id = sorted((party.id, other.id))
        exists = db.scalars(
            select(DuplicateReview).where(
                DuplicateReview.party_a_id == a_id, DuplicateReview.party_b_id == b_id
            )
        ).first()
        if exists:
            continue
        review = DuplicateReview(
            party_a_id=a_id, party_b_id=b_id, score=score, matching_fields=fields
        )
        db.add(review)
        created.append(review)
    db.flush()
    return created


def cases_of(db: Session, party_id: int) -> list[Case]:
    return list(
        db.scalars(select(Case).join(CaseParty).where(CaseParty.party_id == party_id).distinct())
    )


def review_view(db: Session, review: DuplicateReview) -> dict[str, Any]:
    a, b = db.get(Party, review.party_a_id), db.get(Party, review.party_b_id)
    assert a is not None and b is not None
    return {
        "id": review.id,
        "score": review.score,
        "matchingFields": review.matching_fields,
        "status": review.status,
        "mergeBlocked": merge_blocked_reason(a, b),
        "records": [
            {**party_view(p, full_phone=False), "cases": [c.display_id for c in cases_of(db, p.id)]}
            for p in (a, b)
        ],
    }


def _clear_duplicate_flags(db: Session, party_ids: tuple[int, ...]) -> None:
    for pid in party_ids:
        still_pending = db.scalars(
            select(DuplicateReview).where(
                DuplicateReview.status == DuplicateStatus.PENDING,
                or_(DuplicateReview.party_a_id == pid, DuplicateReview.party_b_id == pid),
            )
        ).first()
        if still_pending is None:
            for case in cases_of(db, pid):
                case.remove_flag("possibleDuplicate")


@router.get("")
def list_reviews(
    status_filter: DuplicateStatus = DuplicateStatus.PENDING, db: Session = Depends(get_db)
) -> list[dict[str, Any]]:
    reviews = db.scalars(
        select(DuplicateReview)
        .where(DuplicateReview.status == status_filter)
        .order_by(DuplicateReview.score.desc())
    )
    return [review_view(db, r) for r in reviews]


class EvaluateIn(BaseModel):
    party_id: int


@router.post("/evaluate")
def evaluate(body: EvaluateIn, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    """Re-run matching for one party (e.g. after its details were corrected)."""
    party = db.get(Party, body.party_id)
    if party is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such party")
    created = find_duplicates_for(db, party)
    for review in created:
        for case in cases_of(db, review.party_a_id) + cases_of(db, review.party_b_id):
            case.add_flag("possibleDuplicate")
    db.commit()
    return [review_view(db, r) for r in created]


@router.get("/score")
def score(a: int, b: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Score two parties without recording anything (for tuning and spot checks)."""
    pa, pb = db.get(Party, a), db.get(Party, b)
    if pa is None or pb is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such party")
    value, fields = score_pair(pa, pb)
    return {
        "score": value,
        "matchingFields": fields,
        "fields": field_similarities(pa, pb),
        "aboveThreshold": value >= THRESHOLD,
        "mergeBlocked": merge_blocked_reason(pa, pb),
    }


class ResolveIn(BaseModel):
    decision: Literal["distinct", "merge"]
    note: str | None = Field(default=None, max_length=1000)


@router.post("/{review_id}/resolve")
def resolve(
    review_id: int,
    body: ResolveIn,
    db: Session = Depends(get_db),
    actor: str = Depends(current_actor),
) -> dict[str, Any]:
    review = db.get(DuplicateReview, review_id)
    if review is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such review")
    if review.status != DuplicateStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already {review.status}")
    a, b = db.get(Party, review.party_a_id), db.get(Party, review.party_b_id)
    assert a is not None and b is not None

    if body.decision == "merge":
        if reason := merge_blocked_reason(a, b):
            raise HTTPException(status.HTTP_409_CONFLICT, f"Merge blocked: {reason}")
        # Keep the older record; move the newer one's case links onto it. The
        # newer party row stays for history and is no longer linked to cases.
        for link in db.scalars(select(CaseParty).where(CaseParty.party_id == b.id)):
            link.party_id = a.id
        review.status = DuplicateStatus.MERGED
    else:
        review.status = DuplicateStatus.DISTINCT
    review.resolved_by = actor
    review.resolved_at = utcnow()
    db.flush()
    _clear_duplicate_flags(db, (a.id, b.id))
    record_audit(
        db,
        actor=actor,
        action=AuditAction.DUPLICATE_RESOLVED,
        entity_type="duplicate",
        entity_id=review.id,
        details={
            "decision": body.decision,
            "parties": [a.id, b.id],
            "score": review.score,
            "cases": [c.display_id for c in cases_of(db, a.id)],
        },
        justification=body.note,
    )
    # After a merge every case sits on `a`; after "distinct" each record keeps its own.
    affected = {c.id: c for c in cases_of(db, a.id) + cases_of(db, b.id)}
    for case in affected.values():
        record_audit(
            db,
            actor=actor,
            action=AuditAction.DUPLICATE_RESOLVED,
            entity_type="case",
            entity_id=case.id,
            details={"decision": body.decision, "reviewId": review.id},
        )
    db.commit()
    return review_view(db, review)
