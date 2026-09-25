"""Write the dashboard's server-contract fixture from real API responses.

    cd server && .venv/bin/python -m scripts.dashboard_fixture

Runs four intakes against an in-memory database (a hostage call cut short,
a son applying for his mother with NID matches, a wife confirmed through her
husband's SIM, and a web form), then saves
the case list and one case detail exactly as the API returns them to
dlao-dashboard/src/api/fixtures/server-cases.json, which the dashboard's
mapping tests read. Re-run it whenever the case view changes.
"""

import json
import os
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
from tests.nid_fakes import FakeRegistry

OUT = Path(__file__).resolve().parents[2] / "dlao-dashboard/src/api/fixtures/server-cases.json"
OFFICER = {"X-Officer-Id": "DLAO-RGP-0142"}


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
        cases = client.get("/dlao/cases").json()
        family = next(c for c in cases if c["identity"]["filingFor"] == "mother")
        detail = client.get(f"/dlao/cases/{family['id']}", headers=OFFICER).json()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"list": cases, "detail": detail}, ensure_ascii=False, indent=2) + "\n"
    )
    print(f"wrote {OUT.relative_to(Path.cwd().parent)}: {len(cases)} cases")


if __name__ == "__main__":
    main()
