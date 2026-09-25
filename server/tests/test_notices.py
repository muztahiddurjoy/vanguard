import pytest
from sqlalchemy import select

from app.agents import t5_intake
from app.models import AuditEntry, Case, CaseParty, Party, PartyRole, format_token
from app.services import adnsms, notices
from tests.nid_fakes import FakeRegistry


@pytest.fixture
def sms(monkeypatch) -> list[tuple[str, str]]:
    sent: list[tuple[str, str]] = []

    def fake_send(self, mobile: str, message: str) -> adnsms.SmsResult:
        sent.append((mobile, message))
        return adnsms.SmsResult(ok=True, dry_run=True)

    monkeypatch.setattr(adnsms.AdnSmsClient, "send", fake_send)
    return sent


@pytest.fixture(autouse=True)
def registry(monkeypatch):
    conv = t5_intake.IntakeConversation(use_default_llm=False, registry=FakeRegistry())
    monkeypatch.setattr(t5_intake, "_conversations", conv)


def call(client, *utterances: str, caller: str | None = None) -> dict:
    sid = client.post("/intake/conversations", json={"language": "en"}).json()["sessionId"]
    if caller:  # as the phone line would: caller ID arrives with the call
        t5_intake.conversations().start(sid, channel="hotline_16699", language="en",
                                        caller_phone=caller)  # fmt: skip
    body: dict = {}
    for u in utterances:
        body = client.post(f"/intake/conversations/{sid}/turns", json={"utterance": u}).json()
    return body


RAFIQ_SELF = ("for myself", "Rafiqul Islam", "Md Abdul Karim", "Rangpur", "2 June 1994")
WAGES = ("My employer has not paid my wages for three months", "Kamal Hossain", "Abdul Hamid",
         "Gaibandha")  # fmt: skip


def test_filer_gets_token_and_respondent_gets_notice_on_every_registered_sim(client, db, sms):
    last = call(client, *RAFIQ_SELF, *WAGES, "yes", "after 5 pm", caller="01811223344")
    assert last["complete"] is True
    case = db.scalars(select(Case)).one()
    token = format_token(case.tracking_token or "")
    assert case.track == "mediation"
    # The token is read out digit by digit before the call ends.
    digits = case.tracking_token or ""
    assert last["reply"].endswith(
        f"Your tracking number is {' '.join(digits[:4])}, {' '.join(digits[4:])}. "
        "Please note it down."
    )

    assert sms[0] == (
        "01811223344",
        f"Your legal aid application {case.application_id} has been received. Tracking number: "
        f"{token}. Call 16430 to follow its progress. - District Legal Aid Office, Rangpur",
    )
    # Nobody asked the respondent's language: Bangla, the default for every party.
    notice = (
        f"আপনার বিরুদ্ধে একটি অভিযোগ দায়ের করা হয়েছে (সূত্র {case.application_id})। অনুগ্রহ করে "
        "জেলা লিগ্যাল এইড অফিস, রংপুর-এ উপস্থিত হোন। তথ্যের জন্য 16430 নম্বরে ফোন করুন।"
    )
    assert sms[1:] == [("01911000001", notice), ("01611000002", notice)]
    assert case.notices["filer"]["status"] == "sent"
    assert case.notices["respondent"] | {"at": None} == {
        "status": "sent", "sentTo": 2, "dryRun": True, "releasedByOfficer": False, "at": None,
    }  # fmt: skip
    logged = db.scalars(select(AuditEntry).where(AuditEntry.action == "contact.sent")).all()
    assert len(logged) == 3 and all("filed against" not in str(e.details) for e in logged)


def test_respondent_notice_is_held_when_the_caller_says_not_now(client, db, sms):
    call(client, *RAFIQ_SELF, *WAGES, "no, not now", "after 5 pm", caller="01811223344")
    case = db.scalars(select(Case)).one()
    assert case.notices["respondent"]["status"] == "held"
    assert case.notices["respondent"]["reasons"] == ["callerDidNotAgree"]
    assert [to for to, _ in sms] == ["01811223344"]  # only the filer's receipt
    held = db.scalars(select(AuditEntry).where(AuditEntry.action == "notice.held")).one()
    assert held.details == {"notice": "respondent", "reasons": ["callerDidNotAgree"]}


def test_family_filing_sends_the_token_to_the_relative_who_called(client, db, sms):
    call(client, "for my mother", "Rafiqul Islam", "Md Abdul Karim", "Rangpur", "2 June 1994",
         "Rahima Khatun", "Her brother took her land by force", "no one", "01711000999",
         "mornings", caller="01811223344")  # fmt: skip
    case = db.scalars(select(Case)).one()
    assert case.applicant is not None and case.applicant.phone == "01711000999"
    assert [to for to, _ in sms] == ["01811223344"]
    assert case.notices["respondent"]["status"] == "notFound"


def test_hostage_caller_gets_no_sms_at_all(client, db, sms):
    call(client, "for myself", "Rafiqul Islam", "Md Abdul Karim", "Rangpur", "2 June 1994",
         "My wife's brothers locked me in a room", "Kamal Hossain", "Abdul Hamid",
         "Gaibandha", "anytime", caller="01811223344")  # fmt: skip
    case = db.scalars(select(Case)).one()
    assert case.do_not_call_reason == "hostage"
    assert sms == []
    assert case.notices["filer"] == {**case.notices["filer"], "status": "blocked",
                                     "reason": "do_not_contact"}  # fmt: skip
    reasons = case.notices["respondent"]["reasons"]
    assert {"doNotCall", "sensitive", "callerDidNotAgree"} <= set(reasons)


def test_notice_never_goes_to_the_applicants_own_sim(db):
    wife = Party(name="Moyuri Akter", phone="01712345318", registered_phones=[])
    husband = Party(name="Jalal Uddin", registered_phones=["01712345318", "01911457820"])
    case = Case(
        application_id="APP-2026-900",
        channel="hotline",
        current_office="Rangpur",
        parties=[
            CaseParty(party=wife, role=PartyRole.APPLICANT),
            CaseParty(party=husband, role=PartyRole.RESPONDENT),
        ],
    )
    assert notices.respondent_numbers(case) == ["01911457820"]


def test_web_intake_sends_the_receipt_to_the_applicant(client, db, sms):
    body = {
        "applicant": {"name": "Abdul Malek", "phone": "01819000560", "district": "Rangpur"},
        "narrative": "Dispute with cousins over inherited farmland; I want to know my rights.",
        "preferred_language": "bn",
    }
    client.post("/intake/web", json=body)
    row = db.scalars(select(Case)).one()
    assert sms[0][0] == "01819000560"
    assert f"ট্র্যাকিং নম্বর: {format_token(row.tracking_token or '')}" in sms[0][1]
