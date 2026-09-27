"""Union Digital Centres (udc-dashboard): the applications a centre files for its
neighbours, and the mediation notices it is asked to pass on in person.

A centre reaches people no other channel does. Someone who cannot read a form, has no
smartphone, or shares one phone with a household can walk into the centre in their own
union, and the entrepreneur files for them: identity checked against the NID registry
(``services.ekyc``), the papers they brought scanned in (``services.evidence``), their
signature taken, and the tracking number read out or sent by SMS. See
``services.institution``, which courts and jails use the same way.

The same centre is also sent the next mediation date to pass on when a party keeps
missing it and may not be reading the SMS (``services.mediation``).

A centre sees only its own notices and its own applications. One an officer is holding
back, or one belonging to another centre, is a 404, as if it did not exist.
"""

from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DocumentKind, UdcNotice, UdcNoticeStatus
from app.routers import require_api_token
from app.services import ekyc, evidence, institution, mediation
from app.services.udc import UDCS, Udc, get_udc

router = APIRouter(prefix="/udc", tags=["udc"], dependencies=[Depends(require_api_token)])


def current_udc(x_udc_id: str | None = Header(default=None)) -> Udc:
    """The centre acting. Sign-in is owned by the UDC's app, as for officers."""
    udc = get_udc(x_udc_id or "")
    if udc is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in with a UDC ID (X-Udc-Id)")
    return udc


def office_of(udc: Udc = Depends(current_udc)) -> institution.Office:
    """The centre as an office that files applications. It acts as its entrepreneur."""
    return institution.Office(kind="udc", id=udc.id, staff_id=udc.id)


@router.get("/me")
def me(udc: Udc = Depends(current_udc)) -> dict[str, Any]:
    return udc.view()


@router.get("/centres")
def centres() -> list[dict[str, Any]]:
    """Every centre in the district, so a dashboard can name the one a person should visit."""
    return [u.view() for u in UDCS]


# --- mediation notices -----------------------------------------------------------------


@router.get("/notices")
def notices(db: Session = Depends(get_db), udc: Udc = Depends(current_udc)) -> list[dict[str, Any]]:
    """The centre's notices, newest first."""
    rows = db.scalars(
        select(UdcNotice)
        .where(UdcNotice.udc_id == udc.id, UdcNotice.status != UdcNoticeStatus.HELD)
        .order_by(UdcNotice.created_at.desc(), UdcNotice.id.desc())
    )
    return [mediation.udc_notice_view(db, n) for n in rows]


class InformedIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


@router.post("/notices/{notice_id}/informed")
def informed(
    notice_id: int,
    body: InformedIn,
    db: Session = Depends(get_db),
    udc: Udc = Depends(current_udc),
) -> dict[str, Any]:
    """The centre told the person in person."""
    notice = db.get(UdcNotice, notice_id)
    if notice is None or notice.udc_id != udc.id or notice.status == UdcNoticeStatus.HELD:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such notice")
    if notice.status == UdcNoticeStatus.INFORMED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This notice is already marked as informed")
    mediation.mark_informed(db, notice, udc, body.note)
    db.commit()
    return mediation.udc_notice_view(db, notice)


# --- e-KYC -----------------------------------------------------------------------------


@router.post("/ekyc")
def check_identity(
    body: ekyc.EkycIn = Depends(ekyc.private_body(ekyc.EkycIn)),
    db: Session = Depends(get_db),
    udc: Udc = Depends(current_udc),
) -> dict[str, Any]:
    """The NID and date of birth of the person at the counter (``services.ekyc``)."""
    check = ekyc.run_check(db, body, office_kind="udc", office_id=udc.id, actor=udc.actor)
    db.commit()
    return ekyc.check_view(check)


# --- applications ----------------------------------------------------------------------


@router.get("/applications")
def list_applications(
    db: Session = Depends(get_db), office: institution.Office = Depends(office_of)
) -> list[dict[str, Any]]:
    return institution.list_for(db, office)


@router.post("/applications", status_code=status.HTTP_201_CREATED)
def submit_application(
    body: institution.ApplicationIn,
    response: Response,
    db: Session = Depends(get_db),
    office: institution.Office = Depends(office_of),
) -> dict[str, Any]:
    case, created = institution.submit(db, office, body)
    db.commit()
    if not created:
        response.status_code = status.HTTP_200_OK
    return institution.status_of(db, office, case)


@router.get("/applications/{ref}")
def get_application(
    ref: str, db: Session = Depends(get_db), office: institution.Office = Depends(office_of)
) -> dict[str, Any]:
    return institution.status_of(db, office, institution.own_application(db, office, ref))


@router.post("/applications/{ref}/ekyc")
def verify_applicant(
    ref: str,
    body: institution.CheckIdIn,
    db: Session = Depends(get_db),
    office: institution.Office = Depends(office_of),
) -> dict[str, Any]:
    case = institution.apply_later_check(db, office, ref, body.check_id)
    db.commit()
    return institution.status_of(db, office, case)


@router.post("/applications/{ref}/signature")
def add_signature(
    ref: str,
    body: institution.SignatureIn,
    db: Session = Depends(get_db),
    office: institution.Office = Depends(office_of),
) -> dict[str, Any]:
    case = institution.add_signature(db, office, ref, body)
    db.commit()
    return institution.status_of(db, office, case)


# --- the papers the person brought -----------------------------------------------------


@router.get("/applications/{ref}/documents")
def list_documents(
    ref: str, db: Session = Depends(get_db), office: institution.Office = Depends(office_of)
) -> dict[str, Any]:
    """What has been attached so far, and what the server will accept."""
    case = institution.own_application(db, office, ref)
    return {"documents": evidence.evidence_views(db, case), "limits": evidence.upload_limits()}


@router.post("/applications/{ref}/documents", status_code=status.HTTP_201_CREATED)
async def add_document(
    ref: str,
    file: UploadFile = File(...),
    kind: DocumentKind = Form(DocumentKind.OTHER),
    db: Session = Depends(get_db),
    office: institution.Office = Depends(office_of),
) -> dict[str, Any]:
    """Attach one paper the person brought in. T6 reads it and the checklist follows."""
    case = institution.own_application(db, office, ref)
    result = await evidence.add_upload(db, case, file=file, kind=kind, actor=office.actor)
    db.commit()
    return result


@router.get("/applications/{ref}/documents/{document_id}/file")
def open_document(
    ref: str,
    document_id: int,
    db: Session = Depends(get_db),
    office: institution.Office = Depends(office_of),
) -> FileResponse:
    """The file itself, so the entrepreneur can check the scan is readable."""
    case = institution.own_application(db, office, ref)
    return evidence.file_response(db, case, document_id)
