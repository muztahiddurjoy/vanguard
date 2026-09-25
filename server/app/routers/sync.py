"""T9 offline PWA synchronization: idempotent batches of queued operations.

A UDC tablet or officer's phone queues operations while offline, each with a
client-generated idempotency key, and sends them in order when it reconnects.
Replaying a batch (after a timeout, a crash, a flaky 2G link) is always safe:

- Each operation's effects and its receipt commit in one transaction, so an
  operation is applied exactly once.
- A key seen before returns the stored result (``replayed``) without
  re-running anything; the same key with different content is refused.
- Validation failures are deterministic, so they are stored too and replay
  identically. Unexpected server errors, and operations waiting on a case
  that has not synced yet (``deferred``), store nothing, so the device retries.

Operations in one batch may refer to a case created earlier in the same batch
(or an earlier one) by that operation's idempotency key (``case_client_ref``).
"""

import base64
import binascii
import logging
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import AwareDatetime, BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db, utcnow
from app.models import (
    AuditAction,
    Case,
    DocumentKind,
    IntakeChannel,
    Provenance,
    SyncReceipt,
    record_audit,
)
from app.routers import current_actor, require_api_token
from app.routers.dlao import case_view, get_case_or_404
from app.routers.intake import UdcIntakeIn, create_application, store_document
from app.routers.mediation import SignatureIn, apply_signature, document_view
from app.services.crypto import hash_payload

log = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["sync"], dependencies=[Depends(require_api_token)])

MAX_OPERATIONS = 100
OpName = Literal["create_intake", "attach_document", "record_signature"]


class Operation(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_\-:.]+$")
    op: OpName
    payload: dict[str, Any]
    client_created_at: AwareDatetime | None = None


class BatchIn(BaseModel):
    device_id: str = Field(min_length=1, max_length=100)
    operations: list[Operation] = Field(min_length=1, max_length=MAX_OPERATIONS)


class AttachDocumentIn(BaseModel):
    case_ref: str | None = None
    # Idempotency key of the create_intake operation that made the case.
    case_client_ref: str | None = None
    kind: DocumentKind = DocumentKind.OTHER
    filename: str | None = Field(default=None, max_length=255)
    content_type: str
    data_b64: str


class Rejected(Exception):
    """A deterministic failure: stored, and returned the same way on replay."""

    def __init__(self, code: int, detail: Any):
        self.code, self.detail = code, detail


class Deferred(Exception):
    """Not possible *yet* (e.g. the case it refers to has not synced): not stored."""


def _find_case(db: Session, data: AttachDocumentIn) -> Case:
    if data.case_client_ref:
        case = db.scalars(select(Case).where(Case.client_ref == data.case_client_ref)).first()
        if case is None:
            # Its create_intake may have failed transiently; let the device retry later.
            raise Deferred(f"No case created by operation {data.case_client_ref} yet")
        return case
    if data.case_ref:
        return get_case_or_404(db, data.case_ref)
    raise Rejected(422, "Give case_ref or case_client_ref")


def run_operation(db: Session, op: Operation, device_id: str, actor: str) -> dict[str, Any]:
    """Apply one operation without committing. Raises Rejected for bad input."""
    try:
        if op.op == "create_intake":
            data = UdcIntakeIn.model_validate({**op.payload, "client_ref": op.idempotency_key})
            case = create_application(
                db,
                data,
                channel=IntakeChannel.UDC,
                provenance=Provenance.UDC_OPERATOR,
                actor=actor,
                extra={
                    "udc_center": data.udc_center,
                    "operator_id": data.operator_id,
                    "device_id": device_id,
                    "captured_at": op.client_created_at.isoformat()
                    if op.client_created_at
                    else None,
                },
            )
            return {"case": case_view(case)}

        if op.op == "attach_document":
            doc_in = AttachDocumentIn.model_validate(op.payload)
            case = _find_case(db, doc_in)
            try:
                data_bytes = base64.b64decode(doc_in.data_b64, validate=True)
            except (binascii.Error, ValueError) as exc:
                raise Rejected(422, "data_b64 is not valid base64") from exc
            return store_document(
                db,
                case,
                data=data_bytes,
                filename=doc_in.filename,
                content_type=doc_in.content_type,
                kind=doc_in.kind,
                actor=actor,
            )

        signature = SignatureIn.model_validate(op.payload)
        return {"document": document_view(apply_signature(db, signature, actor))}
    except ValidationError as exc:
        raise Rejected(422, exc.errors(include_url=False, include_context=False)) from exc
    except HTTPException as exc:
        raise Rejected(exc.status_code, exc.detail) from exc


def _replay(receipt: SyncReceipt, request_hash: str) -> dict[str, Any]:
    if receipt.request_hash != request_hash:
        return {
            "status": "conflict",
            "error": {
                "code": 409,
                "detail": "Idempotency key already used for a different operation",
            },
        }
    return {"status": "replayed", "original": receipt.status, **receipt.result}


def process(db: Session, op: Operation, device_id: str, actor: str) -> dict[str, Any]:
    request_hash = hash_payload({"op": op.op, "payload": op.payload})
    existing = db.get(SyncReceipt, op.idempotency_key)
    if existing is not None:
        return _replay(existing, request_hash)

    def receipt(status_: str, result: dict[str, Any]) -> SyncReceipt:
        return SyncReceipt(
            idempotency_key=op.idempotency_key,
            device_id=device_id,
            op=op.op,
            request_hash=request_hash,
            status=status_,
            result=result,
            client_created_at=op.client_created_at,
        )

    try:
        result = {"result": run_operation(db, op, device_id, actor)}
        db.add(receipt("applied", result))
        record_audit(
            db,
            actor=actor,
            action=AuditAction.SYNC_APPLIED,
            entity_type="device",
            entity_id=device_id,
            details={"key": op.idempotency_key, "op": op.op},
        )
        db.commit()
        return {"status": "applied", **result}
    except Deferred as exc:
        db.rollback()
        return {"status": "deferred", "error": {"code": 409, "detail": str(exc)}}
    except Rejected as exc:
        db.rollback()
        rejected = {"error": {"code": exc.code, "detail": exc.detail}}
        db.add(receipt("rejected", rejected))
    except IntegrityError:
        # Another request applied the same key first; answer as a replay of it.
        db.rollback()
        winner = db.get(SyncReceipt, op.idempotency_key)
        if winner is not None:
            return _replay(winner, request_hash)
        raise
    except Exception:
        db.rollback()
        log.exception("sync operation %s failed", op.idempotency_key)
        return {"status": "error", "error": {"code": 500, "detail": "Server error; retry later"}}

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        winner = db.get(SyncReceipt, op.idempotency_key)
        if winner is not None:
            return _replay(winner, request_hash)
        raise
    return {"status": "rejected", **rejected}


@router.post("/batch")
def sync_batch(
    body: BatchIn, db: Session = Depends(get_db), actor: str = Depends(current_actor)
) -> dict[str, Any]:
    keys = [op.idempotency_key for op in body.operations]
    if len(keys) != len(set(keys)):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Duplicate idempotency keys in batch"
        )
    who = actor if actor != "anonymous" else f"device:{body.device_id}"
    results = [
        {"idempotencyKey": op.idempotency_key, "op": op.op, **process(db, op, body.device_id, who)}
        for op in body.operations
    ]
    return {"serverTime": utcnow().isoformat(), "results": results}


@router.get("/receipts/{key}")
def get_receipt(key: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Let a device check an operation's outcome without resending it."""
    receipt = db.get(SyncReceipt, key)
    if receipt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown idempotency key")
    applied_at: datetime = receipt.applied_at
    return {
        "idempotencyKey": receipt.idempotency_key,
        "op": receipt.op,
        "status": receipt.status,
        "appliedAt": applied_at.isoformat(),
        **receipt.result,
    }
