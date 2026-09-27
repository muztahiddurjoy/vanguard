"""The papers attached to a case: storing one, reading the case's list, opening a file.

Every front end that can hold a person's papers can attach them: the citizen's app on
their own case, a Union Digital Centre or a court or a jail on the application it
submitted, and the officer on any case in their office. Every one of them ends in
``store_document`` here, so whatever the channel, T6 reads the file, the case checklist
is rebuilt from what has arrived, and the audit ledger records the hash of the bytes.

Evidence is only ever added. Nothing here removes or replaces a file: a later
correction is another upload, not a rewrite of the first.

A signature taken after e-KYC (``DocumentKind.APPLICANT_SIGNATURE``), a court order a
lawyer sent, and a generated settlement draft live in the same table but are not
evidence someone brought in, so they cannot be uploaded as such and are listed apart.
"""

import base64
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agents.state import DocumentState
from app.agents.t6_document import run_document_review
from app.database import as_utc
from app.models import (
    AuditAction,
    Case,
    ChecklistItem,
    ChecklistStatus,
    Document,
    DocumentKind,
    DocumentStatus,
    record_audit,
)
from app.services.uploads import ALLOWED_TYPES, MAX_UPLOAD_BYTES, save_upload

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

# Not evidence someone brings in, and so not for anyone to upload as evidence. Each is
# named as the refusal should read, since "a applicant signature" is not a sentence.
NOT_EVIDENCE_REASON = {
    DocumentKind.SETTLEMENT_DRAFT: "A settlement draft is written by the office, not brought in",
    DocumentKind.COURT_ORDER: "A court order reaches the case from the panel lawyer",
    DocumentKind.APPLICANT_SIGNATURE: "The applicant's signature is taken after e-KYC",
}
NOT_EVIDENCE = tuple(NOT_EVIDENCE_REASON)


def check_kind(kind: DocumentKind) -> DocumentKind:
    """``kind`` if a person may attach it, else 422 naming why they may not."""
    reason = NOT_EVIDENCE_REASON.get(kind)
    if reason is not None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, reason)
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


def refresh_checklist(db: Session, case: Case, new_doc: Document, data: bytes) -> DocumentState:
    """Run T6 on the new document and rebuild the case checklist.

    Documents already read are passed as text, so only the new one is OCR'd.
    """
    existing = db.scalars(
        select(Document).where(Document.case_id == case.id, Document.id != new_doc.id)
    ).all()
    docs: list[dict[str, Any]] = [
        {"id": d.id, "kind": d.kind, "content_type": d.content_type, "text": d.extracted_text}
        for d in existing
        if d.kind not in NOT_EVIDENCE
    ]
    docs.append(
        {
            "id": new_doc.id,
            "kind": None if new_doc.kind == DocumentKind.OTHER else new_doc.kind,
            "filename": new_doc.filename,
            "content_type": new_doc.content_type,
            "data_b64": base64.b64encode(data).decode(),
        }
    )
    out = run_document_review(case.category, docs)
    result = out["results"][str(new_doc.id)]
    new_doc.extracted_text = result["text"]
    new_doc.summary = result["summary"]
    new_doc.kind = result["kind"]
    new_doc.status = DocumentStatus(result["status"])

    current = {
        i.item_key: i
        for i in db.scalars(select(ChecklistItem).where(ChecklistItem.case_id == case.id))
    }
    for item in out["checklist"]:
        row = current.get(item["key"]) or ChecklistItem(case_id=case.id, item_key=item["key"])
        if row.status == ChecklistStatus.WAIVED:
            continue  # an officer's waiver stands
        row.label, row.label_bn, row.required = item["label"], item["label_bn"], item["required"]
        row.status = ChecklistStatus(item["status"])
        row.document_id = item["document_id"]
        db.add(row)
    return out


def store_document(
    db: Session,
    case: Case,
    *,
    data: bytes,
    filename: str | None,
    content_type: str | None,
    kind: DocumentKind,
    actor: str,
) -> dict[str, Any]:
    """Validate, store and read one document, and refresh the checklist. Caller commits."""
    doc = save_upload(
        db, case, data=data, filename=filename, content_type=content_type, kind=kind, actor=actor
    )
    digest = doc.sha256
    out = refresh_checklist(db, case, doc, data)
    record_audit(
        db,
        actor=actor,
        action=AuditAction.DOCUMENT_UPLOADED,
        entity_type="case",
        entity_id=case.id,
        details={"documentId": doc.id, "kind": doc.kind, "sha256": digest, "status": doc.status},
    )
    return {
        "document": {
            "id": doc.id,
            "kind": doc.kind,
            "status": doc.status,
            "summary": doc.summary,
            "sha256": digest,
        },
        "checklist": out["checklist"],
        "missing": out["missing"],
    }


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


def file_response(db: Session, case: Case, document_id: int) -> FileResponse:
    """One of the case's files, shown in the browser rather than downloaded blindly.

    The name is the one the person uploading gave, which the browser uses if they do
    save it. Nothing is guessed about the bytes: an unknown type is sent as binary so
    no browser renders it as a page.
    """
    doc, path = stored_file(db, case, document_id)
    return FileResponse(
        path,
        media_type=doc.content_type or "application/octet-stream",
        filename=doc.filename or f"document-{doc.id}",
        content_disposition_type="inline",
    )


def upload_limits() -> dict[str, Any]:
    """What a dashboard should refuse before it sends anything, in the server's terms."""
    return {"maxBytes": MAX_UPLOAD_BYTES, "contentTypes": sorted(ALLOWED_TYPES)}
