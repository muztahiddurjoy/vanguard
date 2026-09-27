"""The papers attached to a case, and who may add or open one.

Every front end that can hold a person's papers can now attach them: a Union Digital
Centre or a court or a jail on the application it submitted, and the officer on any
case in their office. Each upload goes through ``routers.intake.store_document``, so
T6 reads it, the case checklist is rebuilt, and the audit ledger records it — exactly
as an upload from the citizen's app does.

Evidence is only ever added. Nothing here removes or replaces a file: the ledger
records a hash of what arrived, and a later correction is another upload, not a
rewrite of the first.

A signature taken after e-KYC (``DocumentKind.APPLICANT_SIGNATURE``) and a generated
settlement draft live in the same table but are not evidence, so they cannot be
uploaded here and are listed apart.
"""

from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import as_utc
from app.models import Case, Document, DocumentKind
from app.routers.intake import store_document
from app.services.uploads import ALLOWED_TYPES, MAX_UPLOAD_BYTES

# What someone at a counter can attach. The rest of ``DocumentKind`` is produced by the
# system (a settlement draft), by a lawyer (a court order) or by e-KYC (a signature).
EVIDENCE_KINDS: tuple[DocumentKind, ...] = (
    DocumentKind.NID_COPY,
    DocumentKind.MEDICAL_CERTIFICATE,
    DocumentKind.GD_FIR_COPY,
    DocumentKind.MARRIAGE_CERTIFICATE,
    DocumentKind.BIRTH_CERTIFICATE,
    DocumentKind.LAND_RECORD,
    DocumentKind.EMPLOYMENT_PROOF,
    DocumentKind.SCREENSHOT,
    DocumentKind.PHOTO_EVIDENCE,
    DocumentKind.INCOME_PROOF,
    DocumentKind.OTHER,
)

# Not evidence, and not for anyone to upload as evidence.
NOT_EVIDENCE = (
    DocumentKind.SETTLEMENT_DRAFT,
    DocumentKind.COURT_ORDER,
    DocumentKind.APPLICANT_SIGNATURE,
)


def check_kind(kind: DocumentKind) -> DocumentKind:
    """``kind`` if a person may attach it, else 422 naming why they may not."""
    if kind in NOT_EVIDENCE:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"A {kind.replace('_', ' ')} is not evidence someone can attach",
        )
    return kind


def document_view(doc: Document, *, withhold: bool = False) -> dict[str, Any]:
    """One file as a dashboard shows it. Never its contents.

    ``withhold`` is for a sensitive case: a file's name and summary can say what it
    shows, so only its kind, size and fingerprint are given until an authorized
    officer asks (``routers.dlao.view_evidence``, which records the request).
    """
    return {
        "id": doc.id,
        "kind": doc.kind,
        "status": doc.status,
        "filename": None if withhold else doc.filename,
        "contentType": doc.content_type,
        "sizeBytes": doc.size_bytes,
        "summary": None if withhold else doc.summary,
        "withheld": withhold,
        "sha256": doc.sha256,
        "uploadedBy": doc.uploaded_by,
        "createdAt": as_utc(doc.created_at).isoformat(),
    }


def evidence_of(db: Session, case: Case) -> list[Document]:
    """The case's evidence, oldest first: what was attached, not what was generated."""
    return list(
        db.scalars(
            select(Document)
            .where(Document.case_id == case.id, Document.kind.notin_(NOT_EVIDENCE))
            .order_by(Document.id)
        )
    )


def evidence_views(db: Session, case: Case, *, withhold: bool = False) -> list[dict[str, Any]]:
    return [document_view(d, withhold=withhold) for d in evidence_of(db, case)]


def evidence_counts(db: Session, case_ids: list[int]) -> dict[int, int]:
    """How many papers each of these cases has, for the lists that show a count."""
    if not case_ids:
        return {}
    rows = db.execute(
        select(Document.case_id, func.count(Document.id))
        .where(Document.case_id.in_(case_ids), Document.kind.notin_(NOT_EVIDENCE))
        .group_by(Document.case_id)
    ).all()
    return {case_id: count for case_id, count in rows}


async def add_upload(
    db: Session, case: Case, *, file: UploadFile, kind: DocumentKind, actor: str
) -> dict[str, Any]:
    """Read, check and attach one uploaded file. Caller commits.

    Returns the stored file, the rebuilt checklist and what is still missing, so a
    dashboard can tell the person at the counter which paper to fetch next.
    """
    check_kind(kind)
    # One byte past the limit is enough to know it is too big, without holding it all.
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    result = store_document(
        db,
        case,
        data=data,
        filename=file.filename,
        content_type=file.content_type,
        kind=kind,
        actor=actor,
    )
    doc = db.get(Document, result["document"]["id"])
    assert doc is not None
    return {
        "document": document_view(doc),
        "checklist": result["checklist"],
        "missing": result["missing"],
    }


def stored_file(db: Session, case: Case, document_id: int) -> tuple[Document, Path]:
    """One of the case's files on disk, for a dashboard to show or download.

    A file belonging to another case is a 404, as is one whose bytes are gone (an
    upload directory that moved between deployments).
    """
    doc = db.get(Document, document_id)
    if doc is None or doc.case_id != case.id or not doc.storage_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such file on this case")
    path = Path(doc.storage_path)
    if not path.is_file():
        raise HTTPException(status.HTTP_410_GONE, "This file is no longer stored on the server")
    return doc, path


def upload_limits() -> dict[str, Any]:
    """What a dashboard should refuse before it sends anything, in the server's terms."""
    return {"maxBytes": MAX_UPLOAD_BYTES, "contentTypes": sorted(ALLOWED_TYPES)}
