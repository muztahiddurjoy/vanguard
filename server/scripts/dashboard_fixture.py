"""Write the dashboard's server-contract fixture from real API responses.

    cd server && .venv/bin/python -m scripts.dashboard_fixture

Runs four intakes against an in-memory database (a hostage call cut short,
a son applying for his mother with NID matches, a wife confirmed through her
husband's SIM, and a web form), sends the mother's case to another district
and back, gives it a panel lawyer who reports from court, has Rangpur Central
Jail apply for a prisoner it verified by e-KYC (with his court case and an
earlier one), and holds two missed mediation sessions on the land case, then
saves the case list, one case detail, the prisoner's records and the land
case's mediation exactly as the API returns them to
dlao-dashboard/src/api/fixtures/server-cases.json, which the dashboard's
mapping tests read. Re-run it whenever the case view changes.
"""

import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

# Rules only (no model, whatever .env says), so the fixture is the same on every run.
os.environ.update(
    {"DATABASE_URL": "sqlite://", "API_TOKEN": "", "ANTHROPIC_API_KEY": "", "OPENAI_API_KEY": "",
     "LLM_PROVIDER": "anthropic", "SMS_DRY_RUN": "true", "ADNSMS_API_KEY": "",
     "ADNSMS_API_SECRET": "", "NID_SERVER_URL": "", "HELPLINE_NUMBER": "16430",
     "OFFICE_DISTRICT": "Rangpur"}
)  # fmt: skip

from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents import t5_intake
from app.database import get_db, init_db, make_engine
from app.main import create_app
from app.services import ekyc
from tests.nid_fakes import FakeRegistry
from tests.records_helpers import JALAL, JALAL_NID

OUT = Path(__file__).resolve().parents[2] / "dlao-dashboard/src/api/fixtures/server-cases.json"
OFFICER = {"X-Officer-Id": "DLAO-RGP-0142"}
COURT = {"X-Court-Staff-Id": "CS-11"}
JAIL = {"X-Prison-Staff-Id": "JS-08"}
# A 1x1 PNG: the prisoner's signature.
SIGNATURE = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="


def main() -> None:
    engine = make_engine("sqlite://", poolclass=StaticPool)
    init_db(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def db():  # type: ignore[no-untyped-def]
        with factory() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = db
    t5_intake._conversations = t5_intake.IntakeConversation(
        use_default_llm=False, registry=FakeRegistry()
    )
    ekyc.registry = lambda: FakeRegistry((JALAL,))
    with TestClient(app) as client:

        def call(*utterances: str, end: bool = False, caller: str | None = None) -> None:
            sid = client.post("/intake/conversations", json={"language": "en"}).json()["sessionId"]
            if caller:
                t5_intake.conversations().start(
                    sid, channel="hotline_16699", language="en", caller_phone=caller
                )
            for u in utterances:
                client.post(f"/intake/conversations/{sid}/turns", json={"utterance": u})
            if end:
                client.post(f"/intake/conversations/{sid}/end")

        call("My husband has locked me in the room", "for myself", "My name is Parvin", end=True)
        call("My mother's former husband Kamal Hossain has not paid her maintenance",
             "for my mother", "Rafiqul Islam", "Md Abdul Karim", "Rangpur", "2 June 1994",
             "Rahima Khatun", "Kamal Hossain", "Abdul Hamid", "Gaibandha", "no, not now",
             "01811223344", "any time", caller="01811223344")  # fmt: skip
        # On her husband's phone; she cannot answer the security questions.
        call("My husband beats me every day", "for myself", "My name is Moyuri Akter",
             "I don't know", "My husband Jalal", "I don't know", "Rangpur", "no",
             "01733000444", "weekday mornings", caller="01722000333")  # fmt: skip
        client.post(
            "/intake/web",
            headers=OFFICER,
            json={
                "applicant": {"name": "Abdul Malek", "phone": "01819000560", "district": "Rangpur"},
                "narrative": "My cousins have occupied 22 decimals of my inherited farmland.",
                "respondent": {"name": "Abdul Jalil", "relation": "cousin"},
            },
        )
        family = next(
            c for c in client.get("/dlao/cases").json() if c["identity"]["filingFor"] == "mother"
        )
        # The family case goes to a panel lawyer, who reports from court, after a
        # transfer to the respondent's district that came back.
        ref = family["id"]
        referral = client.post(
            "/referrals",
            headers=OFFICER,
            json={"case_ref": ref, "to_office": "Gaibandha",
                  "reason": "The former husband lives in Gaibandha."},
        ).json()  # fmt: skip
        client.post(
            f"/referrals/{referral['id']}/respond",
            json={"accept": False, "note": "The applicant lives in Rangpur, so Rangpur acts."},
        )
        client.post(f"/dlao/cases/{ref}/lawyer", headers=OFFICER, json={"lawyer_id": "LAW-12"})
        client.post(
            f"/lawyer/cases/{ref}/updates",
            headers={"X-Lawyer-Id": "LAW-12"},
            json={
                "stage": "plaintFiled",
                "summary": "Maintenance suit filed at the Family Court; summons issued to "
                "Kamal Hossain.",
                "court": "Family Court, Rangpur",
                "next_hearing_at": (datetime.now(UTC) + timedelta(days=10)).isoformat(),
            },
        )
        # The court registers Jalal Uddin's case and an earlier one; the jail holds him on
        # it, checks who he is and applies for him, with his signature.
        today = datetime.now(UTC).date()
        for number, status, filed in (("G.R. 1021/2024", "disposed", "2024-09-02"),
                                      ("G.R. 455/2026", "pending", "2026-06-14")):  # fmt: skip
            court_case = client.post(
                "/court/cases",
                headers=COURT,
                json={"case_number": number, "case_type": "criminal", "status": status,
                      "title": "State vs. Jalal Uddin", "filed_on": filed,
                      "sections": "Penal Code 1860, s. 379",
                      "parties": [{"role": "accused", "name": "Jalal Uddin",
                                   "father_name": "Kashem Ali", "nid": JALAL_NID}]},
            ).json()  # fmt: skip
        client.post(
            f"/court/cases/{court_case['id']}/proceedings",
            headers=COURT,
            json={"held_on": (today - timedelta(days=30)).isoformat(), "kind": "chargeFraming",
                  "summary": "Charge framed; the accused pleaded not guilty.",
                  "next_date": (today + timedelta(days=3)).isoformat(),
                  "next_purpose": "For evidence"},
        )  # fmt: skip
        client.post(
            f"/court/cases/{court_case['id']}/lawyers",
            headers=COURT,
            json={"name": "Adv. Kamrul Hasan", "side": "defence", "from": "2026-06-15"},
        )
        prisoner = client.post(
            "/prison/prisoners",
            headers=JAIL,
            json={"prisoner_no": "RCJ-2026-0412", "name": "Jalal Uddin",
                  "father_name": "Kashem Ali", "gender": "male", "age": 36,
                  "admitted_on": "2026-06-15", "ward": "Padma-3",
                  "cases": [{"court_id": "RNG-CJM", "case_number": "G.R. 455/2026"}]},
        ).json()  # fmt: skip
        check = client.post(
            "/prison/ekyc",
            headers=JAIL,
            json={"nid": JALAL_NID, "date_of_birth": JALAL.date_of_birth.isoformat()},
        ).json()
        jailed = client.post(
            "/prison/applications",
            headers=JAIL,
            json={"client_ref": "fixture-jail-0412", "ekyc_check_id": check["checkId"],
                  "applicant": {"name": "Jalal Uddin"}, "help_needed": "defence",
                  "narrative": "Undertrial since June with no lawyer since his lawyer withdrew.",
                  "prisoner_id": prisoner["id"],
                  "signature": {"content_type": "image/png", "data_b64": SIGNATURE}},
        ).json()  # fmt: skip
        records = client.get(f"/dlao/cases/{jailed['id']}/records", headers=OFFICER).json()

        # The land case goes to mediation; the respondent misses two sessions.
        land = next(c for c in client.get("/dlao/cases").json() if "farmland" in c["summary"])
        now = datetime.now(UTC)
        for days_ago in (14, 7):
            session = client.post(
                "/mediation/sessions",
                headers=OFFICER,
                json={"case_ref": land["id"], "mode": "in_person",
                      "scheduled_for": (now - timedelta(days=days_ago)).isoformat()},
            ).json()  # fmt: skip
            client.post(
                f"/mediation/sessions/{session['id']}/attendance",
                headers=OFFICER,
                json={"applicant": "present", "respondent": "absent"},
            )
        client.post(
            "/mediation/sessions",
            headers=OFFICER,
            json={"case_ref": land["id"], "mode": "in_person",
                  "scheduled_for": (now + timedelta(days=7)).isoformat()},
        )  # fmt: skip
        mediation = client.get(f"/mediation/cases/{land['id']}", headers=OFFICER).json()

        cases = client.get("/dlao/cases").json()
        detail = client.get(f"/dlao/cases/{ref}", headers=OFFICER).json()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    fixture = {"list": cases, "detail": detail, "records": records, "mediation": mediation}
    OUT.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {OUT.relative_to(Path.cwd().parent)}: {len(cases)} cases")


if __name__ == "__main__":
    main()
