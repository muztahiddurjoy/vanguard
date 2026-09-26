"""Put the DLAO dashboard's demo cases in the database, as the office would have handled them.

    cd server && .venv/bin/python -m scripts.seed_cases

The applications in the dashboards' sample data (dlao-dashboard ``src/data/cases.ts`` and
``closed-cases.ts``; the panel lawyers' dashboard shows the same ones), made through the
API the way the office, its panel lawyers and a court would have made them:

- awaiting triage: a hotline call cut short (the caller seemed held: do not call back),
  a neighbour reporting a beating with a safe time to call, a son applying for his
  mother, and a dowry demand that looks like an earlier applicant's (a duplicate);
- with panel lawyers who report from court (their next dates are the hearings), two of
  them late with their reports (the officer's alerts);
- a cyber case sent to Dhaka twice and sent back twice (escalated), with its evidence;
- a court's application for an undertrial prisoner, checked by e-KYC;
- mediation: two sessions booked, and one party who missed two in a row (her Union
  Digital Centre notice waits for the officer);
- five closed cases, with their outcomes.

Each step runs on the app's clock set back to when it happened (``clock_set_to``), all
cases' steps in the order they happened, so the timelines, the alerts, the court dates
and the audit ledger read as if the office had worked on them for months. Dates are
relative to the day it runs.

Nothing is sent and no model is asked, whatever .env says: SMS are a dry run and triage
is rule-based. The court's application checks the prisoner with the NID registry
(NID_SERVER_URL) and uses the court and jail records from ``seed_records``: without
them, it is left out. Running it again adds only the cases that are missing (each is
found by its ``client_ref``; a case left half-made by a failed run is kept as it is).
Refuses to run with ``ENVIRONMENT=production`` unless given ``--force``.
"""

import os

# Rules only and no SMS, whatever .env says; the API is called in-process, without its token.
os.environ.update(
    {"API_TOKEN": "", "ANTHROPIC_API_KEY": "", "OPENAI_API_KEY": "", "LLM_PROVIDER": "anthropic",
     "SMS_DRY_RUN": "true", "ADNSMS_API_KEY": "", "ADNSMS_API_SECRET": "", "ELEVENLABS_API_KEY": ""}
)  # fmt: skip

import argparse
import base64
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal, clock_set_to, utcnow
from app.models import Case

OFFICER = {"X-Officer-Id": "DLAO-RGP-0142"}  # Farhana Yasmin, the dashboard's demo officer
COURT_STAFF = {"X-Court-Staff-Id": "CS-11"}  # Md. Abdul Hakim, Chief Judicial Magistrate Court
JAIL_STAFF = {"X-Prison-Staff-Id": "JS-08"}  # Nasima Khatun, Rangpur Central Jail
CLIENT_REF = "seed-cases:"

COURTS = {
    "family": "Family Court, Rangpur",
    "labour": "Labour Court, Rangpur",
    "jointJudge1": "Joint District Judge Court 1, Rangpur",
    "jointJudge2": "Joint District Judge Court 2, Rangpur",
    "assistantJudge": "Assistant Judge Court, Rangpur Sadar",
    "cjm": "Chief Judicial Magistrate Court, Rangpur",
}

# Small, valid files for the uploads (their content is not what the dashboards show).
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)
JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZG"
    "NywtQFdBRkxOUlNSMj5aYVpQYEpRUk//wAALCAAIAAgBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABQQAQAA"
    "AAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8ATn//2Q=="
)


def pdf(text: str) -> bytes:
    """A one-page PDF showing ``text``."""
    stream = f"BT /F1 11 Tf 40 760 Td ({text}) Tj ET".encode()
    objects = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R"
        b"/Resources<</Font<</F1 5 0 R>>>>>>",
        b"<</Length %d>>stream\n%s\nendstream" % (len(stream), stream),
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]
    out, offsets = b"%PDF-1.4\n", []
    for n, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (n, body)
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return out


class SeedError(RuntimeError):
    pass


class Api:
    """The API, called in-process; any answer but a success stops the seed."""

    def __init__(self, client: TestClient) -> None:
        self.client = client

    def call(self, method: str, path: str, headers: dict[str, str] | None = None, **kw: Any) -> Any:
        r = self.client.request(method, path, headers=OFFICER if headers is None else headers, **kw)
        if r.status_code >= 400:
            raise SeedError(f"{method} {path}: {r.status_code} {r.text[:500]}")
        return r.json()

    def get(self, path: str, headers: dict[str, str] | None = None) -> Any:
        return self.call("GET", path, headers)

    def post(self, path: str, body: Any = None, headers: dict[str, str] | None = None) -> Any:
        return self.call("POST", path, headers, json=body)


@dataclass
class Clock:
    """Moments relative to when the seed runs."""

    start: datetime

    def ago(self, days: float = 0, hours: float = 0) -> datetime:
        return self.start - timedelta(days=days, hours=hours)

    def day(self, days: int) -> date:
        """The office's date ``days`` from today (negative: in the past)."""
        return (self.start.astimezone(get_settings().tz) + timedelta(days=days)).date()

    def office(self, days: int, hour: int, minute: int = 0) -> datetime:
        """``hour:minute`` office time, ``days`` from today."""
        d = self.day(days)
        return datetime(d.year, d.month, d.day, hour, minute, tzinfo=get_settings().tz)


Step = Callable[[Api], None]


@dataclass
class Story:
    """One case's history: what was done on it, each step at the moment it happened."""

    key: str
    name: str
    steps: list[tuple[datetime, Step]] = field(default_factory=list)
    ref: str = ""  # its ID now: APP-..., then DLAS-... once it is a case
    sessions: list[int] = field(default_factory=list)
    referrals: list[int] = field(default_factory=list)
    skipped: str = ""  # why the rest of it was left out
    # Found again by this instead of its client_ref (a phone call makes its own).
    summary: str = ""

    @property
    def client_ref(self) -> str:
        return CLIENT_REF + self.key

    def at(self, when: datetime, step: Step) -> "Story":
        self.steps.append((when, step))
        return self

    def found(self, db: Session) -> bool:
        if self.summary:
            query = select(Case.id).where(
                Case.client_ref.like("conv:%"), Case.summary == self.summary
            )
        else:
            query = select(Case.id).where(Case.client_ref == self.client_ref)
        return db.scalars(query).first() is not None

    # --- What the office, the lawyers and the courts do --------------------------------

    def apply(self, when: datetime, via: str = "web", **body: Any) -> "Story":
        """An application from the web form, or a Union Digital Centre's (``via="udc"``)."""

        def step(api: Api) -> None:
            self.ref = api.post(f"/intake/{via}", {"client_ref": self.client_ref, **body})["id"]

        return self.at(when, step)

    def call(self, when: datetime, *utterances: str) -> "Story":
        """A hotline call, cut after ``utterances``."""
        self.summary = utterances[0]

        def step(api: Api) -> None:
            sid = api.post("/intake/conversations", {"channel": "hotline_16699", "language": "en"})
            for utterance in utterances:
                api.post(
                    f"/intake/conversations/{sid['sessionId']}/turns", {"utterance": utterance}
                )
            api.post(f"/intake/conversations/{sid['sessionId']}/end")
            cases = api.get("/dlao/cases")
            self.ref = next(c["id"] for c in cases if c["summary"] == self.summary)

        return self.at(when, step)

    def triage(self, when: datetime, priority: str, why: str) -> "Story":
        """The officer's review: the AI's priority accepted, or changed to ``priority``."""

        def step(api: Api) -> None:
            case = api.get(f"/dlao/cases/{self.ref}")
            if case["triage"]["priority"] == priority:
                api.post(f"/dlao/cases/{self.ref}/triage/accept")
            else:
                api.post(
                    f"/dlao/cases/{self.ref}/priority-override",
                    {"priority": priority, "justification": why},
                )

        return self.at(when, step)

    def promote(self, when: datetime) -> "Story":
        def step(api: Api) -> None:
            self.ref = api.post(f"/dlao/cases/{self.ref}/promote")["id"]

        return self.at(when, step)

    def assign(self, when: datetime, lawyer: str) -> "Story":
        return self.at(
            when, lambda api: api.post(f"/dlao/cases/{self.ref}/lawyer", {"lawyer_id": lawyer})
        )

    def report(
        self,
        when: datetime,
        lawyer: str,
        stage: str,
        summary: str,
        court: str,
        held: date | None = None,
        next_at: datetime | None = None,
    ) -> "Story":
        """The panel lawyer's report from court."""
        body: dict[str, Any] = {"stage": stage, "summary": summary, "court": court}
        if held:
            body["hearing_held_on"] = held.isoformat()
        if next_at:
            body["next_hearing_at"] = next_at.isoformat()
        return self.at(
            when,
            lambda api: api.post(
                f"/lawyer/cases/{self.ref}/updates", body, headers={"X-Lawyer-Id": lawyer}
            ),
        )

    def track(self, when: datetime, track: str, why: str) -> "Story":
        """The officer's track (``why`` is needed if it is not the AI's)."""
        return self.at(
            when,
            lambda api: api.post(
                f"/dlao/cases/{self.ref}/track", {"track": track, "justification": why}
            ),
        )

    def safety(self, when: datetime, level: str, why: str) -> "Story":
        return self.at(
            when,
            lambda api: api.post(
                f"/dlao/cases/{self.ref}/safety", {"level": level, "justification": why}
            ),
        )

    def upload(self, when: datetime, filename: str, content_type: str, data: bytes) -> "Story":
        return self.at(
            when,
            lambda api: api.call(
                "POST",
                f"/intake/cases/{self.ref}/documents",
                OFFICER,
                files={"file": (filename, data, content_type)},
            ),
        )

    def refer(self, when: datetime, to: str, reason: str) -> "Story":
        def step(api: Api) -> None:
            body = {"case_ref": self.ref, "to_office": to, "reason": reason}
            self.referrals.append(api.post("/referrals", body)["id"])

        return self.at(when, step)

    def sent_back(self, when: datetime, note: str) -> "Story":
        """The other office's answer to the last referral: not theirs."""
        return self.at(
            when,
            lambda api: api.post(
                f"/referrals/{self.referrals[-1]}/respond", {"accept": False, "note": note}
            ),
        )

    def mediation(self, when: datetime, on: datetime, notes: str | None = None) -> "Story":
        """A mediation session at the office, booked at ``when`` for ``on``."""

        def step(api: Api) -> None:
            body = {"case_ref": self.ref, "mode": "in_person", "scheduled_for": on.isoformat()}
            if notes:
                body["notes"] = notes
            self.sessions.append(api.post("/mediation/sessions", body)["id"])

        return self.at(when, step)

    def attended(self, when: datetime, applicant: str, respondent: str) -> "Story":
        """Who came to the last session booked."""
        return self.at(
            when,
            lambda api: api.post(
                f"/mediation/sessions/{self.sessions[-1]}/attendance",
                {"applicant": applicant, "respondent": respondent},
            ),
        )

    def close(self, when: datetime, outcome: str, note: str) -> "Story":
        return self.at(
            when,
            lambda api: api.post(
                f"/dlao/cases/{self.ref}/close", {"outcome": outcome, "note": note}
            ),
        )


def person(name: str, phone: str | None, village: str, upazila: str, **more: Any) -> dict[str, Any]:
    return {
        "name": name,
        "phone": phone,
        "village": village,
        "upazila": upazila,
        "district": "Rangpur",
        **more,
    }


def closed_cases(t: Clock) -> list[Story]:
    """closed-cases.ts: what became of five earlier applicants."""
    mofiz = (
        Story("mofiz-uddin", "Mofiz Uddin")
        .apply(
            t.ago(210),
            applicant=person("Mofiz Uddin", "01738450197", "Chakirpashar", "Kaunia", age=63),
            narrative="My brothers-in-law are grabbing my share of our father's land with a false deed. "
            "They have put up a fence on the plot.",
            respondent={"name": "Kofil Uddin", "relation": "brother-in-law"},
        )
        .triage(t.ago(209), "medium", "His livelihood depends on the land.")
        .promote(t.ago(208))
        .assign(t.ago(208), "LAW-07")
    )
    mofiz.report(
        t.ago(200),
        "LAW-07",
        "plaintFiled",
        "Title suit filed for his share of the land; summons issued to the defendants.",
        COURTS["jointJudge1"],
    )
    mofiz.report(
        t.ago(35),
        "LAW-07",
        "judgment",
        "Judgment delivered: the court decreed the suit and confirmed his share of the land.",
        COURTS["jointJudge1"],
        held=t.day(-35),
    )
    mofiz.close(
        t.ago(35),
        "resolved",
        "The court decided in the applicant's favour; his share of the land was confirmed.",
    )

    rokeya = (
        Story("rokeya-khatun", "Rokeya Khatun")
        .apply(
            t.ago(160),
            applicant=person("Rokeya Khatun", "01952604318", "Saptibari", "Rangpur Sadar", age=37),
            narrative="My husband's family demands more dowry and keeps my jewellery. They say "
            "they will send me back to my father's house unless we pay 60,000 taka.",
            respondent={"name": "Mokbul Hossain", "relation": "father-in-law"},
        )
        .triage(t.ago(159), "medium", "Dowry demand without violence; mediation first.")
        .track(
            t.ago(159),
            "mediation",
            "Both families asked to settle the dowry dispute through mediation.",
        )
        .mediation(t.ago(150), t.office(-140, 11))
        .attended(t.office(-140, 12), "present", "present")
        .close(
            t.ago(21),
            "settled",
            "Settled in mediation. The in-laws returned BDT 60,000 and signed an undertaking.",
        )
    )

    razia = (
        Story("sultana-razia", "Sultana Razia")
        .apply(
            t.ago(140),
            applicant=person("Sultana Razia", "01670432815", "Darshana", "Rangpur Sadar", age=32),
            narrative="My husband divorced me and pays no maintenance for me or our son. "
            "I have no income of my own.",
            respondent={"name": "Abul Kalam", "relation": "former husband"},
        )
        .triage(t.ago(139), "medium", "A mother and child with no income.")
        .promote(t.ago(137))
        .assign(t.ago(137), "LAW-12")
    )
    razia.report(
        t.ago(130),
        "LAW-12",
        "plaintFiled",
        "Maintenance suit filed at the Family Court for her and her son.",
        COURTS["family"],
    )
    razia.report(
        t.ago(12),
        "LAW-12",
        "judgment",
        "Judgment: the Family Court ordered BDT 4,000 a month for her and her son.",
        COURTS["family"],
        held=t.day(-12),
    )
    razia.close(
        t.ago(12), "resolved", "The Family Court ordered BDT 4,000 a month for her and her son."
    )

    harun = (
        Story("harun-mia", "Harun Mia")
        .apply(
            t.ago(90),
            applicant=person("Harun Mia", "01842671093", "Hamidpur", "Taraganj", age=43),
            narrative="The rice mill owner dismissed me and has not paid three months of my wages.",
            respondent={"name": "Abdus Salam", "relation": "employer"},
        )
        .triage(t.ago(89), "medium", "Unpaid wages; a family without income.")
        .close(
            t.ago(40),
            "withdrawn",
            "Withdrawn by the applicant after the employer paid the wages owed.",
        )
    )

    parul = (
        Story("parul-begum", "Parul Begum")
        .apply(
            t.ago(60),
            applicant=person("Parul Begum", "01557208436", "Kismat", "Mithapukur", age=30),
            narrative="My husband beats me and last week injured my arm. I need a safe place and treatment.",
            respondent={"name": "Rashed Mia", "relation": "husband"},
        )
        .triage(t.ago(60), "high", "Recent injuries from her husband.")
        .close(
            t.ago(55),
            "referred",
            "Referred to the One-Stop Crisis Centre for medical care, shelter and police support.",
        )
    )
    return [mofiz, rokeya, razia, harun, parul]


def open_cases(t: Clock) -> list[Story]:
    """cases.ts: the office's open applications and cases."""
    motaleb = (
        Story("motaleb-mia", "Motaleb Mia")
        .apply(
            t.ago(120),
            applicant=person(
                "Motaleb Mia",
                "01911524730",
                "Lalbag",
                "Kaunia",
                age=63,
                guardian_name="Late Kader Mia (father)",
            ),
            narrative="Partition of my late father's land among five brothers. My four brothers "
            "will not agree to divide the plot.",
            respondent={"name": "Abdul Motin", "relation": "brother"},
        )
        .triage(t.ago(119), "low", "A family dispute over land with no safety risk.")
        .track(t.ago(119), "mediation", "A family dispute over land and no sign of violence.")
        .promote(t.ago(115))
        .assign(t.ago(115), "LAW-07")
    )
    motaleb.report(
        t.ago(110),
        "LAW-07",
        "plaintFiled",
        "Partition suit filed; notices served on the four brothers.",
        COURTS["jointJudge1"],
    )
    motaleb.report(
        t.ago(6),
        "LAW-07",
        "hearingAdjourned",
        "All four brothers have filed written statements. The court fixed the next "
        "date for hearing on the issues.",
        COURTS["jointJudge1"],
        held=t.day(-6),
        next_at=t.office(21, 10),
    )

    malek = (
        Story("abdul-malek", "Abdul Malek")
        .apply(
            t.ago(96),
            applicant=person(
                "Abdul Malek",
                "01819442560",
                "Ramnathpur",
                "Badarganj",
                age=58,
                nid="3712580936",
                guardian_name="Late Abdul Kader (father)",
            ),
            narrative="My cousins have occupied 22 decimals of my inherited farmland. The land "
            "is all my family lives on and they will not leave the plot.",
            respondent={"name": "Abdul Jalil", "relation": "cousin"},
        )
        .upload(
            t.ago(96),
            "Khatian (record of rights).pdf",
            "application/pdf",
            pdf("Khatian (record of rights) - Ramnathpur mouza"),
        )
        .upload(t.ago(96), "Inheritance certificate.jpg", "image/jpeg", JPEG)
        .triage(
            t.ago(95),
            "medium",
            "Livelihood depends on the disputed land, but there is no indication of violence.",
        )
        .track(t.ago(95), "mediation", "A dispute with cousins and no sign of violence.")
        .promote(t.ago(94))
        .assign(t.ago(94), "LAW-07")
    )
    malek.report(
        t.ago(90),
        "LAW-07",
        "plaintFiled",
        "Title suit filed against the three cousins; summons issued.",
        COURTS["jointJudge2"],
    )
    # His last report: nothing since, though a date was fixed (the officer's alert).
    malek.report(
        t.ago(34),
        "LAW-07",
        "hearingAdjourned",
        "The cousins filed their written statement. The court fixed a date to frame the issues.",
        COURTS["jointJudge2"],
        held=t.day(-34),
        next_at=t.office(9, 10, 30),
    )

    anwara = (
        Story("anwara-begum", "Anwara Begum")
        .apply(
            t.ago(58),
            via="udc",
            udc_center="Mominpur Union Digital Centre",
            operator_id="UDC-RSD-01",
            applicant=person(
                "Anwara Begum",
                "01722480615",
                "Paglapir",
                "Rangpur Sadar",
                age=52,
                guardian_name="Late Abdul Latif (husband)",
            ),
            narrative="I am a widow. My husband's brothers are trying to grab my homestead land "
            "with a forged deed.",
            respondent={"name": "Abdul Hamid", "relation": "brother-in-law"},
        )
        .triage(t.ago(57), "medium", "Risk of losing her only home, but no report of violence.")
        .promote(t.ago(55))
        .assign(t.ago(55), "LAW-07")
    )
    # The injunction hearing four days ago has no report yet (the officer's alert).
    anwara.report(
        t.ago(17),
        "LAW-07",
        "plaintFiled",
        "Suit for a permanent injunction filed. The court will hear the temporary "
        "injunction on the next date.",
        COURTS["assistantJudge"],
        next_at=t.office(-4, 10),
    )

    kamal = (
        Story("kamal-hossain", "Kamal Hossain")
        .apply(
            t.ago(41),
            applicant=person(
                "Kamal Hossain",
                "01731208045",
                "Durgapur",
                "Mithapukur",
                age=36,
                nid="5068247712",
                guardian_name="Nurul Islam (father)",
            ),
            narrative="The brick kiln owner has not paid four months of wages to me and ten "
            "other seasonal workers.",
            respondent={"name": "Abdur Rob", "relation": "employer"},
        )
        .triage(t.ago(40), "medium", "Eleven workers without four months' wages.")
        .promote(t.ago(39))
        .assign(t.ago(39), "LAW-15")
    )
    kamal.report(
        t.ago(35),
        "LAW-15",
        "plaintFiled",
        "Wage claim for the 11 workers filed at the Labour Court.",
        COURTS["labour"],
    )
    kamal.report(
        t.ago(9),
        "LAW-15",
        "hearingAdjourned",
        "The kiln owner asked for time to file his reply. The court gave him until the next date.",
        COURTS["labour"],
        held=t.day(-9),
        next_at=t.office(3, 11),
    )

    shahana = (
        Story("shahana-begum", "Shahana Begum")
        .apply(
            t.ago(40),
            via="udc",
            udc_center="Alampur Union Digital Centre",
            operator_id="UDC-TRG-01",
            applicant=person(
                "Shahana Begum",
                "01744208563",
                "Alampur",
                "Taraganj",
                age=32,
                guardian_name="Abdul Latif (husband)",
            ),
            narrative="My husband left for Dhaka two years ago and stopped sending maintenance "
            "for me and our son.",
            respondent={"name": "Abdul Latif", "relation": "husband"},
        )
        .triage(t.ago(39), "medium", "Maintenance for a mother and child; no violence reported.")
        .track(t.ago(39), "mediation", "Both families agreed to mediation on her maintenance.")
        .safety(
            t.ago(39), "caution", "She shares a phone with her mother-in-law: neutral SMS only."
        )
        .promote(t.ago(39))
    )
    # She misses two sessions in a row; her Union Digital Centre is to tell her of the next.
    shahana.mediation(t.ago(35), t.office(-28, 11)).attended(t.office(-28, 13), "absent", "present")
    shahana.mediation(t.ago(27), t.office(-14, 11)).attended(t.office(-14, 13), "absent", "present")
    shahana.mediation(t.ago(13), t.office(5, 11))

    rahima = (
        Story("rahima-begum", "Rahima Begum")
        .apply(
            t.ago(12),
            applicant=person(
                "Rahima Begum",
                "01713554482",
                "Balarhat",
                "Mithapukur",
                age=34,
                nid="6390284417",
                guardian_name="Abdur Rashid (husband)",
            ),
            narrative="My husband stopped paying maintenance for me and our two children "
            "eight months ago.",
            respondent={"name": "Abdur Rashid", "relation": "husband"},
        )
        .triage(
            t.ago(11), "medium", "Financial hardship affecting children; no safety risk reported."
        )
        .assign(t.ago(10), "LAW-12")
    )
    rahima.report(
        t.ago(9),
        "LAW-12",
        "plaintFiled",
        "Maintenance suit filed at the Family Court; summons served on Abdur Rashid.",
        COURTS["family"],
        next_at=t.office(0, 15, 30),
    )
    rahima.report(
        t.ago(3),
        "LAW-12",
        "other",
        "Met Rahima Begum to prepare her evidence for the first hearing. Abdur Rashid "
        "has hired a lawyer.",
        COURTS["family"],
        next_at=t.office(0, 15, 30),
    )

    shirin = (
        Story("shirin-sultana", "Shirin Sultana")
        .apply(
            t.ago(3),
            applicant=person(
                "Shirin Sultana",
                "01609385771",
                "Shyampur",
                "Badarganj",
                age=31,
                nid="1682945528",
                guardian_name="Abul Hashem (father)",
            ),
            narrative="I want guardianship and custody of my 4-year-old daughter after our "
            "separation. Both families have agreed to mediation first.",
            respondent={"name": "Mamun Hossain", "relation": "former husband"},
        )
        .triage(t.ago(2), "low", "Amicable dispute with mediation agreed; no safety concerns.")
        .track(t.ago(2), "mediation", "Both families agreed to mediation first.")
        .mediation(t.ago(2), t.office(6, 14), "Mediation between the two families on guardianship")
    )

    nabila = (
        Story("nabila", "Nabila")
        .apply(
            t.ago(2),
            applicant=person(
                "Nabila", "01914386207", "Tepamadhupur", "Kaunia", age=22, nid="7741038265"
            ),
            narrative="A former acquaintance is spreading edited private photos of me on Facebook "
            "and threatens to post more unless I pay. This is blackmail. He lives in Dhaka.",
        )
        .upload(t.ago(2), "Facebook post screenshots.png", "image/png", PNG)
        .upload(
            t.ago(2),
            "Blackmail messages (chat log).pdf",
            "application/pdf",
            pdf("Messenger chat log, 12 messages"),
        )
        .upload(
            t.ago(2),
            "Police general diary (GD) copy.pdf",
            "application/pdf",
            pdf("Kaunia Police Station, General Diary"),
        )
        .triage(t.ago(1, 20), "high", "Ongoing image-based abuse with extortion.")
    )
    # Sent to Dhaka and sent back twice: the officer's jurisdiction alert.
    nabila.refer(t.ago(hours=44), "Dhaka", "The accused lives in Dhaka.")
    nabila.sent_back(
        t.ago(hours=38), "The applicant lives in Rangpur, so the Rangpur office must support her."
    )
    nabila.refer(t.ago(hours=30), "Dhaka", "Only the Cyber Tribunal in Dhaka can try this offence.")
    nabila.sent_back(
        t.ago(hours=20),
        "Sent back again: Dhaka will act only on an order from the national office.",
    )

    # On the same shared household phone as Rahima Begum, from the same village.
    rohima = Story("rohima-begum", "Rohima Begum").apply(
        t.ago(hours=26),
        applicant=person(
            "Rohima Begum",
            "01713554482",
            "Balarhat",
            "Mithapukur",
            age=27,
            nid="8524179052",
            guardian_name="Abdul Karim (husband)",
        ),
        narrative="My in-laws are demanding 80,000 taka more dowry and have threatened to send "
        "me back to my parents.",
        respondent={"name": "Abdul Karim", "relation": "husband"},
    )

    moyuri = Story("moyuri-akter", "Moyuri Akter").apply(
        t.ago(hours=20),
        applicant=person(
            "Moyuri Akter",
            "01712345318",
            "Shyampur",
            "Pirgachha",
            age=29,
            guardian_name="Jalal Uddin (husband)",
        ),
        proxy={"name": "Ripon", "relation": "neighbour", "phone": "01748211208"},
        respondent={"name": "Jalal Uddin", "relation": "husband"},
        safe_contact_windows=[{"day": 2, "start_hour": 14, "end_hour": 16}],
        phone_monitored=True,
        narrative="My neighbour's husband beats her again and again. Two days ago she had bruises "
        "all over her arms. He checks her phone; she can only talk on Tuesdays from 2 to 4 "
        "while he is at the market. Two children live in the home.",
    )

    jahanara = (
        Story("jahanara-parvin", "Jahanara Parvin")
        .apply(
            t.ago(hours=9),
            applicant=person(
                "Jahanara Parvin",
                "01556721914",
                "Kholeya",
                "Gangachara",
                age=41,
                nid="2396153380",
                guardian_name="Mofizul Haque (father)",
            ),
            proxy={"name": "Arif Hossain", "relation": "son", "phone": "01856220417"},
            respondent={"name": "Sohrab Ali", "relation": "former husband"},
            narrative="My father divorced my mother last year. The Union Parishad arbitration "
            "council ordered him to pay her denmohor and my little sister's maintenance, "
            "but he has paid nothing.",
        )
        .mediation(
            t.ago(hours=8),
            t.office(12, 11, 30),
            "Mediation on unpaid denmohor and child maintenance",
        )
    )

    parvin = Story("parvin-akter", "Parvin Akter").call(
        t.ago(hours=1),
        "My husband has kept me locked in a room since yesterday and will not let me leave. He beats me.",
        "for myself",
        "My name is Parvin",
    )
    return [
        motaleb,
        malek,
        anwara,
        kamal,
        shahana,
        rahima,
        jalal_uddin(t),
        shirin,
        nabila,
        rohima,
        moyuri,
        jahanara,
        parvin,
    ]


def jalal_uddin(t: Clock) -> Story:
    """The magistrate's court applies for an undertrial prisoner it verified by e-KYC.

    His court case and his jail record come from seed_records; his NID from the registry.
    """
    story = Story("jalal-uddin", "Jalal Uddin")

    def apply(api: Api) -> None:
        court_case = next(
            (c for c in api.get("/court/cases", COURT_STAFF) if c["caseNumber"] == "G.R. 455/2026"),
            None,
        )
        prisoner = next(
            (
                p
                for p in api.get("/prison/prisoners", JAIL_STAFF)
                if p["prisonerNo"] == "RCJ-2026-0412"
            ),
            None,
        )
        if court_case is None or prisoner is None:
            story.skipped = "his court and jail records are missing (run seed_records first)"
            return
        if not get_settings().nid_server_url:
            story.skipped = "no NID registry to check him with (NID_SERVER_URL)"
            return
        check = api.post(
            "/court/ekyc",
            {"nid": "2854106397", "date_of_birth": "1990-06-05", "name": "Jalal Uddin"},
            COURT_STAFF,
        )
        if check["status"] != "verified":
            story.skipped = f"the NID registry did not confirm him ({check['status']})"
            return
        story.ref = api.post(
            "/court/applications",
            {
                "client_ref": story.client_ref,
                "ekyc_check_id": check["checkId"],
                "applicant": {
                    "name": "Jalal Uddin",
                    "name_bn": "জালাল উদ্দিন",
                    "father_name": "Abdus Sattar",
                    "age": 36,
                    "gender": "male",
                },
                "help_needed": "defence",
                "court_case_id": court_case["id"],
                "in_custody": True,
                "narrative": "Undertrial prisoner in Rangpur Central Jail since June, accused of theft. "
                "His lawyer withdrew in August, and nobody defended him when the charge "
                "was framed. Witness evidence starts on the next date.",
                "signature": {
                    "content_type": "image/png",
                    "data_b64": base64.b64encode(PNG).decode(),
                },
            },
            COURT_STAFF,
        )["id"]
        api.post(f"/dlao/cases/{story.ref}/records", {"prisoner_id": prisoner["id"]})

    story.at(t.ago(6), apply)
    story.triage(t.ago(6), "high", "In custody with no defence lawyer and a hearing soon.")
    story.promote(t.ago(5)).assign(t.ago(5), "LAW-24")
    story.report(
        t.ago(2),
        "LAW-24",
        "other",
        "Met Jalal Uddin at Rangpur Central Jail and signed the vakalatnama. Applied for "
        "certified copies of the charge sheet and the witness statements.",
        COURTS["cjm"],
        next_at=t.office(3, 10, 30),
    )
    return story


@dataclass
class Summary:
    added: list[Story] = field(default_factory=list)
    kept: list[Story] = field(default_factory=list)
    skipped: list[Story] = field(default_factory=list)
    cases: dict[str, dict[str, Any]] = field(default_factory=dict)

    def __str__(self) -> str:
        lines = [
            f"Demo cases: added {len(self.added)}, {len(self.kept)} already there"
            + (f", {len(self.skipped)} left out" if self.skipped else "")
            + "."
        ]
        for story in self.added:
            case = self.cases.get(story.ref, {})
            token = case.get("trackingToken") or "—"
            queues = ", ".join(case.get("queues") or []) or case.get("status", "")
            lines.append(f"  {story.ref:<14} {story.name:<16} tracking {token:<10} {queues}")
        lines += [f"  left out: {s.name}: {s.skipped}" for s in self.skipped]
        return "\n".join(lines)


def seed(api: Api, db: Session, start: datetime | None = None) -> Summary:
    """Add whichever demo cases are missing, every case's steps in the order they happened."""
    clock = Clock(start or datetime.now(UTC))
    summary = Summary()
    todo = []
    for story in closed_cases(clock) + open_cases(clock):
        (summary.kept if story.found(db) else todo).append(story)
    steps = sorted(
        (
            (when, i, j, story, step)
            for i, story in enumerate(todo)
            for j, (when, step) in enumerate(story.steps)
        ),
        key=lambda s: s[:3],
    )
    # Steps at the same moment follow each other, so the ledger stays in time order.
    done = datetime.min.replace(tzinfo=UTC)
    for when, _, _, story, step in steps:
        if story.skipped:
            continue
        with clock_set_to(max(when, done)):
            try:
                step(api)
            except SeedError as err:
                raise SeedError(f"{story.name} ({story.ref or 'new'}): {err}") from err
            done = utcnow()
    for story in todo:
        (summary.skipped if story.skipped else summary.added).append(story)
        if not story.skipped:
            summary.cases[story.ref] = api.get(f"/dlao/cases/{story.ref}")
    return summary


def main(argv: list[str] | None = None, api: Api | None = None, db: Session | None = None) -> int:
    parser = argparse.ArgumentParser(description="Add the DLAO dashboard's demo cases.")
    parser.add_argument("--force", action="store_true", help="run even with ENVIRONMENT=production")
    args = parser.parse_args(argv)
    if get_settings().environment == "production" and not args.force:
        print(
            "ENVIRONMENT is production: not adding demo cases (use --force to add them).",
            file=sys.stderr,
        )
        return 1
    try:
        if api is not None and db is not None:
            print(seed(api, db))
            return 0
        from app.main import create_app

        with TestClient(create_app()) as client, SessionLocal() as session:
            print(seed(Api(client), session))
    except SeedError as err:
        print(f"The demo cases could not all be added: {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
