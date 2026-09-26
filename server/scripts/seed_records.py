"""Put the shared demo court and jail records in the database.

    cd server && .venv/bin/python -m scripts.seed_records

Five court cases in four of Rangpur's courts, four prisoners in two jails, the cause
lists that bring them to court, and one legal aid application from Rangpur Central
Jail. The court and prison dashboards' built-in sample data show the same records.
Dates in the past are fixed; the next dates are relative to the day it runs (office
time zone), so there is always something on the cause list.

Running it again adds only what is missing: court cases are matched by court and case
number, prisoners by jail and prisoner number, cause list entries by court, date and
serial, and the application by its ``client_ref``. Records carry the staff member who
would have entered them. The application is submitted through the same service as
``POST /prison/applications`` (by JS-08, the legal aid desk), so it is triaged and
audited like any other.

The people are citizens of the NID registry (``nid-server``), so e-KYC works in a live
demo. Refuses to run with ``ENVIRONMENT=production`` unless given ``--force``.
"""

import argparse
import sys
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal, init_db, utcnow
from app.models import (
    CauseListEntry,
    CourtCase,
    CourtCaseLawyer,
    CourtCaseParty,
    CourtProceeding,
    Prisoner,
    PrisonerCase,
    case_number_key,
)
from app.models.party import hash_nid
from app.services.institution import ApplicationIn, Office, submit
from app.services.records import office_today

# Who would have entered each court's and jail's records.
COURT_STAFF = {"RNG-CJM": "CS-11", "RNG-NST": "CS-14", "RNG-DSJ": "CS-17", "RNG-FAM": "CS-21"}
PRISON_STAFF = {"RNG-CJ": "JS-03", "NIL-DJ": "JS-12"}
APPLICATION_REF = "seed-records:sohel-rana-bail"


def court_cases(d: date) -> list[dict[str, Any]]:
    """The courts' registers. ``at(n)`` is n days from ``d``, the day the script runs."""

    def at(days: int) -> date:
        return d + timedelta(days=days)

    return [
        {
            "court": "RNG-CJM",
            "number": "G.R. 455/2026",
            "type": "criminal",
            "title": "State vs. Jalal Uddin",
            "sections": "Penal Code 1860, s. 379",
            "filed": date(2026, 6, 14),
            "status": "pending",
            "parties": [
                {"role": "accused", "name": "Jalal Uddin", "name_bn": "জালাল উদ্দিন",
                 "father": "Abdus Sattar", "nid": "2854106397", "born": date(1990, 6, 5)},
                {"role": "complainant", "name": "Abdul Malek", "father": "Abdul Kader"},
            ],
            "proceedings": [
                (date(2026, 6, 15), "order",
                 "Accused produced by police; bail rejected; sent to jail custody.",
                 date(2026, 7, 20), "For police report"),
                (date(2026, 7, 20), "hearing", "Charge sheet received from police.",
                 date(2026, 8, 24), "For charge hearing"),
                (date(2026, 8, 24), "chargeFraming",
                 "Charge framed under s. 379; accused pleaded not guilty. "
                 "No defence lawyer present.", at(3), "For evidence"),
            ],
            "lawyers": [("Adv. Kamrul Hasan", "defence", date(2026, 6, 15), date(2026, 8, 10))],
            "cause_list": [(at(3), 7, "10:30", "For evidence")],
        },
        {
            "court": "RNG-CJM",
            "number": "G.R. 1021/2024",
            "type": "criminal",
            "title": "State vs. Jalal Uddin",
            "sections": "Penal Code 1860, s. 380",
            "filed": date(2024, 9, 2),
            "status": "disposed",
            "parties": [
                {"role": "accused", "name": "Jalal Uddin", "name_bn": "জালাল উদ্দিন",
                 "father": "Abdus Sattar", "nid": "2854106397", "born": date(1990, 6, 5)},
            ],
            "proceedings": [
                (date(2025, 3, 18), "judgment",
                 "Judgment delivered: the accused is acquitted of the charge under s. 380.",
                 None, None),
            ],
            "lawyers": [("Adv. Sultana Kabir", "defence", date(2024, 9, 10), date(2025, 3, 18))],
            "cause_list": [],
        },
        {
            "court": "RNG-NST",
            "number": "Nari-Shishu 112/2026",
            "type": "womenChildren",
            "title": "State vs. Sohel Rana",
            "sections": "Nari o Shishu Nirjatan Daman Ain 2000, s. 11(c)",
            "filed": date(2026, 5, 2),
            "status": "pending",
            "parties": [
                {"role": "accused", "name": "Sohel Rana", "name_bn": "সোহেল রানা",
                 "father": "Abdul Hamid", "nid": "5519273046", "born": date(2000, 4, 3)},
                {"role": "complainant", "name": "Rohima Begum", "father": "Mokbul Hossain"},
            ],
            "proceedings": [
                (date(2026, 5, 3), "order", "Accused sent to jail custody.",
                 date(2026, 6, 10), "For bail hearing"),
                (date(2026, 6, 10), "bail", "Bail petition rejected.",
                 at(1), "For hearing of fresh bail petition"),
            ],
            "lawyers": [],
            "cause_list": [(at(1), 2, "11:00", "For hearing of fresh bail petition")],
        },
        {
            "court": "RNG-CJM",
            "number": "C.R. 88/2026",
            "type": "criminal",
            "title": "Abdul Jalil vs. Kamal Hossain",
            "sections": "Penal Code 1860, ss. 323, 506",
            "filed": date(2026, 7, 1),
            "status": "pending",
            "parties": [
                {"role": "accused", "name": "Kamal Hossain", "name_bn": "কামাল হোসেন",
                 "father": "Nurul Islam", "nid": "5068247712", "born": date(1990, 3, 12)},
                {"role": "complainant", "name": "Abdul Jalil", "father": "Abdul Gafur"},
            ],
            "proceedings": [],
            "lawyers": [],
            "cause_list": [(at(0), 3, "10:00", "For hearing")],
        },
        {
            "court": "RNG-FAM",
            "number": "Family Suit 23/2026",
            "type": "family",
            "title": "Rahima Begum vs. Abdul Karim",
            "sections": "Muslim Family Laws Ordinance 1961 (maintenance and dower)",
            "filed": date(2026, 4, 20),
            "status": "pending",
            "parties": [
                {"role": "plaintiff", "name": "Rahima Begum", "name_bn": "রহিমা বেগম",
                 "father": "Abdul Hakim", "nid": "6390284417", "born": date(1992, 2, 11)},
                {"role": "defendant", "name": "Abdul Karim", "father": "Abdul Jabbar"},
            ],
            "proceedings": [],
            "lawyers": [],
            "cause_list": [(at(5), 4, "10:00", "For hearing")],
        },
    ]  # fmt: skip


PRISONERS: list[dict[str, Any]] = [
    # Not yet NID-verified: the demo verifies him (NID 2854106397, born 1990-06-05).
    {"prison": "RNG-CJ", "no": "RCJ-2026-0412", "name": "Jalal Uddin", "name_bn": "জালাল উদ্দিন",
     "father": "Abdus Sattar", "age": 36, "upazila": "Pirgachha", "district": "Rangpur",
     "admitted": date(2026, 6, 15), "ward": "Padma-3",
     "cases": [("RNG-CJM", "G.R. 455/2026")]},
    {"prison": "RNG-CJ", "no": "RCJ-2026-0388", "name": "Sohel Rana", "name_bn": "সোহেল রানা",
     "father": "Abdul Hamid", "age": 26, "admitted": date(2026, 5, 3), "ward": "Jamuna-1",
     "cases": [("RNG-NST", "Nari-Shishu 112/2026")]},
    # Held on a sessions case the court has not registered yet.
    {"prison": "RNG-CJ", "no": "RCJ-2026-0450", "name": "Mofiz Uddin", "name_bn": "মফিজ উদ্দিন",
     "father": "Kofil Uddin", "nid": "8347261590", "born": date(1963, 6, 14),
     "village": "Chakirpashar", "upazila": "Rajarhat", "district": "Kurigram",
     "admitted": date(2026, 8, 2), "ward": "Teesta-2",
     "cases": [("RNG-DSJ", "Sessions 76/2026")]},
    {"prison": "NIL-DJ", "no": "NDJ-2026-0091", "name": "Harun Mia", "name_bn": "হারুন মিয়া",
     "father": "Soleman Mia", "nid": "9460318572", "born": date(1983, 4, 4),
     "village": "Hamidpur", "upazila": "Parbatipur", "district": "Dinajpur",
     "admitted": date(2026, 7, 11), "cases": [("RNG-CJM", "G.R. 612/2026")]},
]  # fmt: skip

SOHEL_APPLICATION = {
    "help_needed": "bail",
    "narrative": (
        "Undertrial prisoner since May 2026 with no lawyer. His family cannot afford one. "
        "He asks for legal aid for his bail petition, listed for hearing tomorrow."
    ),
    "applicant": {"name": "Sohel Rana", "name_bn": "সোহেল রানা", "father_name": "Abdul Hamid",
                  "age": 26, "gender": "male"},
}  # fmt: skip


def age_on(born: date, day: date) -> int:
    return day.year - born.year - ((day.month, day.day) < (born.month, born.day))


PLURAL = {"entry": "entries"}


@dataclass
class Summary:
    added: dict[str, int] = field(default_factory=dict)
    application: str = ""

    def add(self, what: str, n: int = 1) -> None:
        self.added[what] = self.added.get(what, 0) + n

    def __str__(self) -> str:
        def counted(what: str, n: int) -> str:
            *rest, last = what.split(" ")
            plural = " ".join([*rest, PLURAL.get(last, f"{last}s")])
            return f"{n} {what if n == 1 else plural}"

        added = ", ".join(counted(what, n) for what, n in self.added.items() if n)
        return f"Demo records: added {added or 'nothing new'}. Application: {self.application}."


def seed_court_case(db: Session, spec: dict[str, Any], today: date, summary: Summary) -> None:
    actor = f"court:{COURT_STAFF[spec['court']]}"
    key = case_number_key(spec["number"])
    found = db.scalars(
        select(CourtCase).where(CourtCase.court_id == spec["court"], CourtCase.number_key == key)
    ).first()
    if found is None:
        found = CourtCase(
            court_id=spec["court"],
            case_number=spec["number"],
            number_key=key,
            case_type=spec["type"],
            title=spec["title"],
            sections=spec["sections"],
            filed_on=spec["filed"],
            status=spec["status"],
            created_by=actor,
            parties=[
                CourtCaseParty(
                    role=p["role"],
                    name=p["name"],
                    name_bn=p.get("name_bn"),
                    father_name=p.get("father"),
                    age=age_on(p["born"], today) if p.get("born") else None,
                    nid_hash=hash_nid(p["nid"]) if p.get("nid") else None,
                    nid_last4=p["nid"][-4:] if p.get("nid") else None,
                )
                for p in spec["parties"]
            ],
        )
        db.add(found)
        db.flush()
        summary.add("court case")
    held = {(p.held_on, p.kind): p for p in found.proceedings}
    for held_on, kind, text, next_date, purpose in spec["proceedings"]:
        if (held_on, kind) in held:
            # The next date is relative to today: keep it ahead on a later run.
            held[(held_on, kind)].next_date = next_date
            continue
        found.proceedings.append(
            CourtProceeding(
                held_on=held_on,
                kind=kind,
                summary=text,
                next_date=next_date,
                next_purpose=purpose,
                recorded_by=actor,
                recorded_at=utcnow(),
            )
        )
        summary.add("proceeding")
    named = {lawyer.name for lawyer in found.lawyers}
    for name, side, since, until in spec["lawyers"]:
        if name not in named:
            found.lawyers.append(
                CourtCaseLawyer(
                    name=name,
                    side=side,
                    appeared_from=since,
                    appeared_until=until,
                    recorded_by=actor,
                    recorded_at=utcnow(),
                )
            )
            summary.add("lawyer")
    for listed_on, serial, time, purpose in spec["cause_list"]:
        taken = db.scalars(
            select(CauseListEntry.id).where(
                CauseListEntry.court_id == spec["court"],
                CauseListEntry.listed_on == listed_on,
                CauseListEntry.serial == serial,
            )
        ).first()
        if taken is None:
            db.add(
                CauseListEntry(
                    court_id=spec["court"],
                    listed_on=listed_on,
                    serial=serial,
                    time=time,
                    case_number=spec["number"],
                    number_key=key,
                    purpose=purpose,
                    published_by=actor,
                    published_at=utcnow(),
                )
            )
            summary.add("cause list entry")
    db.flush()


def seed_prisoner(db: Session, spec: dict[str, Any], today: date, summary: Summary) -> Prisoner:
    found = db.scalars(
        select(Prisoner).where(
            Prisoner.prison_id == spec["prison"], Prisoner.prisoner_no == spec["no"]
        )
    ).first()
    if found is None:
        nid = spec.get("nid")
        found = Prisoner(
            prison_id=spec["prison"],
            prisoner_no=spec["no"],
            name=spec["name"],
            name_bn=spec.get("name_bn"),
            father_name=spec["father"],
            gender="male",
            age=age_on(spec["born"], today) if spec.get("born") else spec.get("age"),
            date_of_birth=spec.get("born"),
            nid_hash=hash_nid(nid) if nid else None,
            nid_last4=nid[-4:] if nid else None,
            nid_verified=bool(nid),
            village=spec.get("village"),
            upazila=spec.get("upazila"),
            district=spec.get("district"),
            admitted_on=spec["admitted"],
            ward=spec.get("ward"),
            created_by=f"prison:{PRISON_STAFF[spec['prison']]}",
        )
        db.add(found)
        summary.add("prisoner")
    held = {(c.court_id, c.number_key) for c in found.cases}
    for court_id, number in spec["cases"]:
        key = case_number_key(number)
        if (court_id, key) not in held:
            found.cases.append(PrisonerCase(court_id=court_id, case_number=number, number_key=key))
    db.flush()
    return found


def seed(db: Session, today: date | None = None) -> Summary:
    """Add whatever of the demo dataset is missing, and commit."""
    today = today or office_today()
    summary = Summary()
    for spec in court_cases(today):
        seed_court_case(db, spec, today, summary)
    prisoners = {spec["no"]: seed_prisoner(db, spec, today, summary) for spec in PRISONERS}
    body = ApplicationIn.model_validate(
        {
            **SOHEL_APPLICATION,
            "client_ref": APPLICATION_REF,
            "prisoner_id": prisoners["RCJ-2026-0388"].id,
        }
    )
    case, created = submit(db, Office(kind="prison", id="RNG-CJ", staff_id="JS-08"), body)
    summary.add("application", int(created))
    summary.application = f"{case.display_id} ({'new' if created else 'already there'})"
    db.commit()
    return summary


def main(argv: list[str] | None = None, db: Session | None = None) -> int:
    parser = argparse.ArgumentParser(description="Add the demo court and jail records.")
    parser.add_argument("--force", action="store_true", help="run even with ENVIRONMENT=production")
    args = parser.parse_args(argv)
    if get_settings().environment == "production" and not args.force:
        print(
            "ENVIRONMENT is production: not adding demo records (use --force to add them).",
            file=sys.stderr,
        )
        return 1
    if db is not None:
        print(seed(db))
        return 0
    init_db()
    with SessionLocal() as session:
        print(seed(session))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
