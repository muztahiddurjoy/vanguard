"""Shared by the court, jail and records tests: staff headers, registry records, requests."""

import base64
from datetime import date, timedelta
from typing import Any

import pytest

from app.services import ekyc
from app.services.records import office_today
from tests.nid_fakes import FakeRegistry, person

CJM = {"X-Court-Staff-Id": "CS-11"}  # Chief Judicial Magistrate Court, Rangpur
NST = {"X-Court-Staff-Id": "CS-14"}  # Nari o Shishu Tribunal-1
RCJ = {"X-Prison-Staff-Id": "JS-03"}  # Rangpur Central Jail
RCJ_DESK = {"X-Prison-Staff-Id": "JS-08"}  # Rangpur Central Jail, legal aid desk
NDJ = {"X-Prison-Staff-Id": "JS-12"}  # Nilphamari District Jail
OFFICER = {"X-Officer-Id": "DLAO-RNG-01"}

JALAL_NID = "2854106397"
SOHEL_NID = "5519273046"

JALAL = person(
    JALAL_NID, ("Jalal Uddin", "জালাল উদ্দিন"), father=("Abdus Sattar", "আব্দুস সাত্তার", None),
    mother=("Jamela Khatun", "জামেলা খাতুন", None), born="1990-06-05", gender="male",
    upazila=("Pirgachha", "পীরগাছা"),
)  # fmt: skip
SOHEL = person(
    SOHEL_NID, ("Sohel Rana", "সোহেল রানা"), father=("Abdul Hamid", "আব্দুল হামিদ", None),
    mother=("Nurjahan Begum", "নূরজাহান বেগম", None), born="2000-04-03", gender="male",
    district=("Dhaka", "ঢাকা"), upazila=("Savar", "সাভার"),
)  # fmt: skip

# A PNG's signature bytes are enough for the server's type check.
PNG = b"\x89PNG\r\n\x1a\n" + b"signature strokes"


def fake_registry(monkeypatch: pytest.MonkeyPatch, *, down: bool = False) -> FakeRegistry:
    registry = FakeRegistry((JALAL, SOHEL), down=down)
    monkeypatch.setattr(ekyc, "registry", lambda: registry)
    return registry


def day(offset: int = 0) -> str:
    return (office_today() + timedelta(days=offset)).isoformat()


def past(iso: str) -> date:
    return date.fromisoformat(iso)


def register_case(client, headers: dict = CJM, **fields: Any) -> dict:  # type: ignore[no-untyped-def]
    body = {
        "case_number": "G.R. 455/2026",
        "case_type": "criminal",
        "title": "State vs. Jalal Uddin",
        "sections": "Penal Code 1860, s. 379",
        "filed_on": "2026-06-14",
        "parties": [
            {"role": "accused", "name": "Jalal Uddin", "father_name": "Abdus Sattar",
             "age": 36, "nid": JALAL_NID},
            {"role": "complainant", "name": "Abdul Malek", "father_name": "Abdul Kader"},
        ],
        **fields,
    }  # fmt: skip
    r = client.post("/court/cases", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def admit(client, headers: dict = RCJ, **fields: Any) -> dict:  # type: ignore[no-untyped-def]
    body = {
        "prisoner_no": "RCJ-2026-0412",
        "name": "Jalal Uddin",
        "father_name": "Abdus Sattar",
        "gender": "male",
        "age": 36,
        "upazila": "Pirgachha",
        "district": "Rangpur",
        "admitted_on": "2026-06-15",
        "ward": "Padma-3",
        "cases": [{"court_id": "RNG-CJM", "case_number": "GR 455/2026"}],
        **fields,
    }
    r = client.post("/prison/prisoners", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def check(
    client, headers: dict, nid: str = JALAL_NID, dob: str = "1990-06-05", **extra: Any
) -> dict:  # type: ignore[no-untyped-def]
    base = "/court" if "X-Court-Staff-Id" in headers else "/prison"
    r = client.post(
        f"{base}/ekyc", json={"nid": nid, "date_of_birth": dob, **extra}, headers=headers
    )
    assert r.status_code == 200, r.text
    return r.json()


def application(**fields: Any) -> dict:
    return {
        "client_ref": "3f1c2a9e-0000-4000-8000-000000000001",
        "applicant": {"name": "Jalal Uddin", "father_name": "Abdus Sattar", "age": 36,
                      "gender": "male"},
        "help_needed": "defence",
        "narrative": "Charge framed with no defence lawyer; the accused cannot afford one.",
        **fields,
    }  # fmt: skip


def signature(data: bytes = PNG, content_type: str = "image/png") -> dict:
    return {"content_type": content_type, "data_b64": base64.b64encode(data).decode()}


def audit(db, action: str) -> list:  # type: ignore[no-untyped-def]
    from sqlalchemy import select

    from app.models import AuditEntry

    return list(db.scalars(select(AuditEntry).where(AuditEntry.action == action)))
