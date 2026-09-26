"""Legal aid applications a court or a jail submits for someone before them.

Each is an ordinary application: ``routers.intake.create_application`` records it, T8
triages it, T4 looks for duplicates and the audit trail has it, as for every other
channel. On top of that:

1. A verified e-KYC check (``services.ekyc``) fills in the applicant from the NID
   registry, and is then used up.
2. Nobody is sent an SMS: someone in the dock or in jail has no phone to hand, so
   staff give them the tracking number (``notices.filer`` is ``handedOver``).
3. Someone in custody is flagged ``inCustody`` and is at least high priority.
4. The court case, or the prisoner and every registered case they are held on, are
   linked to the application, so the officer and the panel lawyer see them.
5. The applicant's signature, taken only once e-KYC has verified who they are, is kept
   as a document.

A court or a jail sees only the applications it submitted (404 for any other).
"""

import base64
import binascii
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal

from fastapi import HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import as_utc, utcnow
from app.models import (
    AccessibilityFlag,
    AuditAction,
    Case,
    CaseRecordLink,
    CourtCase,
    Document,
    DocumentKind,
    EkycCheck,
    HelpNeeded,
    InstitutionApplication,
    IntakeChannel,
    Priority,
    Prisoner,
    Provenance,
    format_token,
    record_audit,
)
from app.models.case import PRIORITY_RANK
from app.routers.dlao import drop_track_for_court_cases, due_at_for, get_case_or_404
from app.routers.duplicates import cases_of, find_duplicates_for
from app.routers.intake import Identities, IntakeIn, PartyIn, apply_citizen, create_application
from app.services.case_status import stage_of
from app.services.court_progress import next_hearing
from app.services.ekyc import fill_prisoner, use_check
from app.services.nid_registry import Citizen
from app.services.records import (
    application_of,
    court_ref,
    key_of,
    lawyer_ref,
    link_record,
    own_court_case,
    own_prisoner,
    prison_ref,
    prisoner_keys,
    registered_cases,
    staff_ref,
)
from app.services.uploads import save_upload

CRIMINAL_HELP = (HelpNeeded.DEFENCE, HelpNeeded.BAIL, HelpNeeded.APPEAL)
PROVENANCE = {"court": Provenance.COURT_REFERRAL, "prison": Provenance.PRISON_REFERRAL}
# A signature is a picture of it on the staff's tablet: PNG or JPEG, and small.
SIGNATURE_TYPES = {"image/png": b"\x89PNG\r\n\x1a\n", "image/jpeg": b"\xff\xd8\xff"}
MAX_SIGNATURE_BYTES = 2 * 1024 * 1024
SIGN_AFTER_EKYC = "Verify the applicant's identity (e-KYC) before adding their signature"


@dataclass(frozen=True)
class Office:
    """The court or jail a member of staff works for."""

    kind: Literal["court", "prison"]
    id: str
    staff_id: str

    @property
    def actor(self) -> str:
        """As ``CourtStaff.actor`` and ``PrisonStaff.actor`` name them in the ledger."""
        return f"{self.kind}:{self.staff_id}"


class ApplicantIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    name_bn: str | None = Field(default=None, max_length=200)
    father_name: str | None = Field(default=None, max_length=200)
    age: int | None = Field(default=None, ge=0, le=120)
    gender: Literal["male", "female", "other"] | None = None
    village: str | None = Field(default=None, max_length=120)
    upazila: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    preferred_language: Literal["bn", "en"] = "bn"


class SignatureIn(BaseModel):
    content_type: str = Field(min_length=1, max_length=100)
    data_b64: str = Field(min_length=1)


class ApplicationIn(BaseModel):
    # The client's own ID (a UUID): sending the application again returns the same one.
    client_ref: str = Field(min_length=8, max_length=64)
    ekyc_check_id: str | None = Field(default=None, max_length=64)
    applicant: ApplicantIn
    help_needed: HelpNeeded
    # What help is needed and why, in the staff's words.
    narrative: str = Field(min_length=20, max_length=5000)
    # A court: one of its own cases, and whether the applicant is in custody.
    court_case_id: int | None = None
    in_custody: bool = False
    # A jail: one of its own prisoners (required); they are in custody.
    prisoner_id: int | None = None
    signature: SignatureIn | None = None


class CheckIdIn(BaseModel):
    check_id: str = Field(min_length=1, max_length=64)


def identity_record(verified: bool) -> dict[str, Any]:
    """``intake_data.identity``, as T5 records it for a call (see ``dlao.identity_view``)."""
    return {
        "filingFor": "self",
        "caller": "verified" if verified else "unverified",
        "callerVerifiedBy": "ekyc" if verified else None,
    }


def decode_signature(signature: SignatureIn) -> tuple[bytes, str]:
    ctype = signature.content_type.split(";")[0].strip().lower()
    magic = SIGNATURE_TYPES.get(ctype)
    if magic is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "The signature must be a PNG or JPEG image"
        )
    too_large = HTTPException(
        status.HTTP_413_CONTENT_TOO_LARGE, "The signature must be 2 MB or smaller"
    )
    if len(signature.data_b64) > (MAX_SIGNATURE_BYTES * 4) // 3 + 4:
        raise too_large
    try:
        data = base64.b64decode(signature.data_b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "The signature is not valid base64"
        ) from exc
    if len(data) > MAX_SIGNATURE_BYTES:
        raise too_large
    if not data.startswith(magic):
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "The signature must be a PNG or JPEG image"
        )
    return data, ctype


def store_signature(
    db: Session,
    case: Case,
    app: InstitutionApplication,
    signature: tuple[bytes, str],
    actor: str,
) -> Document:
    """Keep the signature as a document (not read by T6: it is not evidence)."""
    data, ctype = signature
    doc = save_upload(
        db,
        case,
        data=data,
        filename=f"signature-{case.application_id}{'.png' if ctype == 'image/png' else '.jpg'}",
        content_type=ctype,
        kind=DocumentKind.APPLICANT_SIGNATURE,
        actor=actor,
    )
    app.signature_document_id = doc.id
    record_audit(
        db,
        actor=actor,
        action=AuditAction.APPLICANT_SIGNATURE_UPLOADED,
        entity_type="case",
        entity_id=case.id,
        details={
            "documentId": doc.id,
            "sha256": doc.sha256,
            "ekycCheckId": app.ekyc_check.id if app.ekyc_check else None,
        },
    )
    return doc


def hold_in_custody(db: Session, case: Case, actor: str) -> None:
    """Flag the case, and make it at least high priority: someone is waiting in a cell."""
    case.add_flag("inCustody")
    rank = PRIORITY_RANK.get(Priority(case.priority), 9) if case.priority else 9
    if rank <= PRIORITY_RANK[Priority.HIGH]:
        return
    case.priority = Priority.HIGH
    case.due_at = due_at_for(Priority.HIGH, case.received_at)
    record_audit(
        db,
        actor=actor,
        action=AuditAction.TRIAGE_GENERATED,
        entity_type="case",
        entity_id=case.id,
        details={"priority": Priority.HIGH, "reason": "applicant in custody"},
    )


def check_is_for(prisoner: Prisoner, check: EkycCheck) -> None:
    if prisoner.nid_verified and prisoner.nid_hash != check.nid_hash:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This e-KYC check is for someone other than the prisoner"
        )


def verified_by(
    db: Session,
    case: Case,
    app: InstitutionApplication,
    check: EkycCheck,
    citizen: Citizen,
    prisoner: Prisoner | None,
    actor: str,
) -> None:
    """Use up the check on the application; it also verifies the prisoner's record."""
    check.used_for_case_id = case.id
    app.ekyc_check = check
    if prisoner is not None and not prisoner.nid_verified:
        fill_prisoner(prisoner, citizen)
        check.used_for_prisoner_id = prisoner.id
        record_audit(
            db,
            actor=actor,
            action=AuditAction.RECORD_UPDATED,
            entity_type="prisoner",
            entity_id=prisoner.id,
            details={"nidVerified": True, "ekycCheckId": check.id},
        )
    record_audit(
        db,
        actor=actor,
        action=AuditAction.IDENTITY_CHECKED,
        entity_type="case",
        entity_id=case.id,
        details={**identity_record(True), "ekycCheckId": check.id},
    )


def _subject(
    db: Session, office: Office, body: ApplicationIn
) -> tuple[CourtCase | None, Prisoner | None, bool]:
    """The court case or prisoner the application is about, and whether they are held."""
    if office.kind == "court":
        if body.prisoner_id is not None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "A court names a court case, not a prisoner"
            )
        found = own_court_case(db, office.id, body.court_case_id) if body.court_case_id else None
        return found, None, body.in_custody
    if body.court_case_id is not None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "A jail names the prisoner; their court cases are linked from the prisoner's record",
        )
    if body.prisoner_id is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Say which prisoner the application is for"
        )
    return None, own_prisoner(db, office.id, body.prisoner_id), True


def submit(db: Session, office: Office, body: ApplicationIn) -> tuple[Case, bool]:
    """Create the application, or return the one this ``client_ref`` already made.

    Returns (case, created). Caller commits.
    """
    existing = db.scalars(select(Case).where(Case.client_ref == body.client_ref)).first()
    if existing is not None:
        app = application_of(db, existing)
        if app is None or (app.office_kind, app.office_id) != (office.kind, office.id):
            raise HTTPException(
                status.HTTP_409_CONFLICT, "This client_ref belongs to another application"
            )
        return existing, False

    court_case, prisoner, in_custody = _subject(db, office, body)
    check = citizen = None
    if body.ekyc_check_id:
        check, citizen = use_check(
            db, body.ekyc_check_id, office_kind=office.kind, office_id=office.id
        )
        if prisoner is not None:
            check_is_for(prisoner, check)
    signature = None
    if body.signature is not None:
        if check is None:
            raise HTTPException(status.HTTP_409_CONFLICT, SIGN_AFTER_EKYC)
        signature = decode_signature(body.signature)

    a = body.applicant
    data = IntakeIn(
        applicant=PartyIn(
            name=a.name.strip(),
            name_bn=a.name_bn,
            guardian_name=a.father_name,
            village=a.village,
            upazila=a.upazila,
            district=a.district,
            age=a.age,
            preferred_language=a.preferred_language,
            accessibility_flags=[AccessibilityFlag.NO_OWN_PHONE] if in_custody else [],
        ),
        narrative=body.narrative,
        client_ref=body.client_ref,
    )
    case = create_application(
        db,
        data,
        channel=IntakeChannel(office.kind),
        provenance=PROVENANCE[office.kind],
        actor=office.actor,
        extra={
            "submittedBy": {"kind": office.kind, "officeId": office.id, "staffId": office.staff_id},
            "helpNeeded": body.help_needed.value,
            "inCustody": in_custody,
            "applicantGender": a.gender,
            "identity": identity_record(check is not None),
        },
        identities=Identities(applicant=citizen),
        notify=False,
    )
    if body.help_needed in CRIMINAL_HELP:
        # T8 has no such category; it keeps one that is already set when it runs again.
        case.category = "criminalDefence"
        drop_track_for_court_cases(case)
    if in_custody:
        hold_in_custody(db, case, office.actor)
    case.notices = {
        **(case.notices or {}),
        "filer": {"status": "handedOver", "via": office.kind, "at": utcnow().isoformat()},
    }
    app = InstitutionApplication(
        case_id=case.id,
        office_kind=office.kind,
        office_id=office.id,
        staff_id=office.staff_id,
        help_needed=body.help_needed,
        in_custody=in_custody,
        submitted_at=case.received_at,
    )
    db.add(app)
    db.flush()
    if check is not None and citizen is not None:
        verified_by(db, case, app, check, citizen, prisoner, office.actor)
    if court_case is not None:
        link_record(db, case, actor=office.actor, court_case=court_case)
    if prisoner is not None:
        link_record(db, case, actor=office.actor, prisoner=prisoner)
        registered = registered_cases(db, prisoner_keys(prisoner))
        for key in prisoner_keys(prisoner):
            if key in registered:
                link_record(db, case, actor=office.actor, court_case=registered[key])
    if signature is not None:
        store_signature(db, case, app, signature, office.actor)
    return case, True


def own_application(db: Session, office: Office, ref: str) -> Case:
    case = get_case_or_404(db, ref)
    app = application_of(db, case)
    if app is None or (app.office_kind, app.office_id) != (office.kind, office.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No application {ref}")
    return case


def _linked_prisoner(db: Session, office: Office, case: Case) -> Prisoner | None:
    if office.kind != "prison":
        return None
    return db.scalars(
        select(Prisoner)
        .join(CaseRecordLink, CaseRecordLink.prisoner_id == Prisoner.id)
        .where(CaseRecordLink.case_id == case.id, Prisoner.prison_id == office.id)
        .order_by(CaseRecordLink.id)
    ).first()


def apply_later_check(db: Session, office: Office, ref: str, check_id: str) -> Case:
    """Verify the applicant of an application submitted before their e-KYC. Caller commits."""
    case = own_application(db, office, ref)
    app = application_of(db, case)
    applicant = case.applicant
    if app is None or applicant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No application {ref}")
    if app.ekyc_check_id is not None or applicant.nid_verified:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "The applicant's identity has already been verified"
        )
    check, citizen = use_check(db, check_id, office_kind=office.kind, office_id=office.id)
    prisoner = _linked_prisoner(db, office, case)
    if prisoner is not None:
        check_is_for(prisoner, check)
    apply_citizen(applicant, citizen)
    case.district, case.upazila = applicant.district, applicant.upazila
    case.intake_data = {**(case.intake_data or {}), "identity": identity_record(True)}
    verified_by(db, case, app, check, citizen, prisoner, office.actor)
    # With an NID hash, T4 may now find the same person's other applications.
    db.flush()
    for review in find_duplicates_for(db, applicant):
        for linked in cases_of(db, review.party_a_id) + cases_of(db, review.party_b_id):
            linked.add_flag("possibleDuplicate")
    return case


def add_signature(db: Session, office: Office, ref: str, body: SignatureIn) -> Case:
    case = own_application(db, office, ref)
    app = application_of(db, case)
    if app is None or app.ekyc_check_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, SIGN_AFTER_EKYC)
    if app.signature_document_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "The applicant has already signed")
    store_signature(db, case, app, decode_signature(body), office.actor)
    return case


# --- what the office sees ------------------------------------------------------------


def status_views(
    db: Session, office: Office, pairs: Sequence[tuple[Case, InstitutionApplication]]
) -> list[dict[str, Any]]:
    """``LegalAidStatus`` for each application, with only this office's own records."""
    links = db.scalars(
        select(CaseRecordLink)
        .where(CaseRecordLink.case_id.in_([c.id for c, _ in pairs]))
        .order_by(CaseRecordLink.id)
    ).all()
    cc_ids = {link.court_case_id for link in links if link.court_case_id}
    p_ids = {link.prisoner_id for link in links if link.prisoner_id}
    doc_ids = {a.signature_document_id for _, a in pairs if a.signature_document_id}
    court_cases = {c.id: c for c in db.scalars(select(CourtCase).where(CourtCase.id.in_(cc_ids)))}
    prisoners = {p.id: p for p in db.scalars(select(Prisoner).where(Prisoner.id.in_(p_ids)))}
    docs = {d.id: d for d in db.scalars(select(Document).where(Document.id.in_(doc_ids)))}

    views = []
    for case, app in pairs:
        own = [link for link in links if link.case_id == case.id]
        prisoner = next(
            (
                p
                for link in own
                if (p := prisoners.get(link.prisoner_id or 0)) and p.prison_id == office.id
            ),
            None,
        )
        # The court's own case; for a jail, a case its prisoner is held on.
        known = set(prisoner_keys(prisoner)) if prisoner else set()
        court_case = next(
            (
                c
                for link in own
                if (c := court_cases.get(link.court_case_id or 0))
                and (c.court_id == office.id if office.kind == "court" else key_of(c) in known)
            ),
            None,
        )
        check = app.ekyc_check
        doc = docs.get(app.signature_document_id or 0)
        hearing = next_hearing(case)
        applicant = case.applicant
        views.append(
            {
                "id": case.display_id,
                "applicationId": case.application_id,
                "trackingToken": format_token(case.tracking_token) if case.tracking_token else None,
                "submittedAt": as_utc(app.submitted_at).isoformat(),
                "submittedBy": staff_ref(app.office_kind, app.staff_id),
                "applicant": {
                    "name": applicant.name if applicant else None,
                    "nameBn": applicant.name_bn if applicant else None,
                },
                "helpNeeded": app.help_needed,
                "inCustody": app.in_custody,
                "identity": {
                    "verified": check is not None,
                    "method": "ekyc" if check else None,
                    "verifiedAt": as_utc(check.created_at).isoformat() if check else None,
                    "nidLast4": check.nid_last4 if check else None,
                },
                "signature": (
                    {"uploadedAt": as_utc(doc.created_at).isoformat(), "by": doc.uploaded_by}
                    if doc
                    else None
                ),
                "stage": stage_of(case),
                "lawyer": lawyer_ref(case.lawyer_id),
                "nextHearing": hearing[0].isoformat() if hearing else None,
                "courtCase": (
                    {
                        "id": court_case.id,
                        "caseNumber": court_case.case_number,
                        "court": court_ref(court_case.court_id),
                    }
                    if court_case
                    else None
                ),
                "prisoner": (
                    {
                        "id": prisoner.id,
                        "prisonerNo": prisoner.prisoner_no,
                        "prison": prison_ref(prisoner.prison_id),
                    }
                    if prisoner
                    else None
                ),
            }
        )
    return views


def status_of(db: Session, office: Office, case: Case) -> dict[str, Any]:
    app = application_of(db, case)
    if app is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No application {case.display_id}")
    return status_views(db, office, [(case, app)])[0]


def list_for(db: Session, office: Office) -> list[dict[str, Any]]:
    """The office's applications, newest first."""
    rows = db.execute(
        select(Case, InstitutionApplication)
        .join(InstitutionApplication, InstitutionApplication.case_id == Case.id)
        .where(
            InstitutionApplication.office_kind == office.kind,
            InstitutionApplication.office_id == office.id,
        )
        .order_by(InstitutionApplication.submitted_at.desc(), InstitutionApplication.id.desc())
    ).all()
    return status_views(db, office, [(case, app) for case, app in rows])
