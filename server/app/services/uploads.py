"""Files attached to a case: checked, stored under UPLOAD_DIR by content hash, recorded."""

from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Case, Document, DocumentKind
from app.services.crypto import sha256_hex

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "text/plain": ".txt",
}


def save_upload(
    db: Session,
    case: Case,
    *,
    data: bytes,
    filename: str | None,
    content_type: str | None,
    kind: DocumentKind,
    actor: str,
) -> Document:
    """Validate and store one file on the case, without reading it. Caller audits and commits."""
    ctype = (content_type or "").split(";")[0].strip()
    if ctype not in ALLOWED_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a PDF, JPEG, PNG or text file"
        )
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Files must be 10 MB or smaller")
    if not data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The file is empty")

    digest = sha256_hex(data)
    folder = Path(get_settings().upload_dir) / str(case.id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{digest}{ALLOWED_TYPES[ctype]}"
    path.write_bytes(data)

    doc = Document(
        case_id=case.id,
        kind=kind,
        filename=(filename or "upload")[:255],
        content_type=ctype,
        storage_path=str(path),
        size_bytes=len(data),
        sha256=digest,
        uploaded_by=actor,
    )
    db.add(doc)
    db.flush()
    return doc
