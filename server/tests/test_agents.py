import base64

from app.agents import t5_intake, t6_document, t7_settlement
from app.agents.t5_intake import IntakeConversation, LLMSlots, find_district, find_phone
from app.agents.t6_document import LLMReading, run_document_review
from app.agents.t7_settlement import LLMDraft, run_settlement_draft


class FakeLLM:
    def __init__(self, *results):
        self.results = list(results)
        self.calls: list[dict] = []

    def structured(self, **kw):
        self.calls.append(kw)
        return self.results.pop(0) if self.results else None


# --- T5 intake -------------------------------------------------------------


def test_phone_and_district_extraction_handles_bangla():
    assert find_phone("নম্বর ০১৭১২-৩৪৫৩১৮") == "01712345318"
    assert find_phone("call +880 1712 345318 please") == "01712345318"
    assert find_phone("no number") is None
    assert find_district("থাকেন রংপুর, পীরগাছা") == "Rangpur"
    assert find_district("I live in Cox's Bazar") == "Cox's Bazar"


def test_intake_conversation_fills_slots_in_order():
    conv = IntakeConversation(use_default_llm=False)
    s = conv.start("call-1", channel="hotline_16699", language="en")
    assert s["asking"] == "is_proxy"
    assert s["reply"] == t5_intake.QUESTIONS["is_proxy"]["en"]

    s = conv.turn("call-1", "I am calling for my neighbour")
    assert s["slots"]["is_proxy"] is True
    assert s["asking"] == "name"

    s = conv.turn("call-1", "Moyuri Akter")
    assert s["slots"]["name"] == "Moyuri Akter"

    # A phone and a district in one answer fill both slots.
    s = conv.turn("call-1", "01712-345318, she lives in Rangpur")
    assert s["slots"]["phone"] == "01712345318"
    assert s["slots"]["district"] == "Rangpur"
    assert s["asking"] == "problem"

    s = conv.turn("call-1", "Her husband beats her and she has visible injuries")
    assert s["slots"]["category"] == "domesticViolence"
    assert s["asking"] == "safe_to_call"

    s = conv.turn("call-1", "Tuesday 2 to 4 pm, he checks her phone")
    assert s["complete"] is True
    assert s["reply"] == t5_intake.CLOSING["en"]
    assert t5_intake.missing_required(s["slots"]) == []


def test_conversations_are_isolated_by_session():
    conv = IntakeConversation(use_default_llm=False)
    conv.start("a", channel="udc")
    conv.start("b", channel="udc")
    conv.turn("a", "নিজের জন্য")
    assert conv.state("a")["slots"] == {"is_proxy": False}
    assert conv.state("b")["slots"] == {}


def test_danger_ends_the_call_with_emergency_guidance():
    conv = IntakeConversation(use_default_llm=False)
    conv.start("c", channel="hotline_16699")
    s = conv.turn("c", "ও এখনই আমাকে মেরে ফেলবে")
    assert s["emergency"] is True
    assert s["complete"] is True
    assert "৯৯৯" in s["reply"]


def test_llm_extraction_fills_free_form_answers_but_rules_win_on_phone():
    # start() has an empty utterance and never calls the model, so one result is enough.
    llm = FakeLLM(
        LLMSlots(
            is_proxy=True,
            name="Moyuri Akter",
            phone="01999999999",
            problem="Husband beats her",
            phone_monitored=True,
        ),
    )
    conv = IntakeConversation(llm=llm)
    conv.start("d", channel="hotline_16699", language="en")
    s = conv.turn("d", "Calling about Moyuri Akter, 01712345318, her husband beats her")
    assert s["slots"]["phone"] == "01712345318"
    assert s["slots"]["name"] == "Moyuri Akter"
    assert s["slots"]["phone_monitored"] is True
    assert len(llm.calls) == 1


# --- T6 documents ----------------------------------------------------------


def _text_doc(doc_id: int, text: str, **kw) -> dict:
    return {"id": doc_id, "content_type": "text/plain", "text": text, **kw}


def test_checklist_marks_provided_and_missing_items():
    out = run_document_review(
        "domesticViolence",
        [
            _text_doc(1, "Government of Bangladesh. National ID card. Name: Moyuri Akter."),
            _text_doc(2, "Upazila Health Complex. Medical certificate. Injury on left arm."),
        ],
        use_default_llm=False,
    )
    items = {i["key"]: i for i in out["checklist"]}
    assert items["nid_copy"]["status"] == "provided"
    assert items["nid_copy"]["document_id"] == 1
    assert items["medical_certificate"]["status"] == "provided"
    assert items["gd_fir_copy"]["status"] == "missing"
    assert out["missing"] == []
    assert out["results"]["2"]["summary"].startswith("Upazila Health Complex.")


def test_birth_certificate_satisfies_id_and_required_items_are_listed():
    out = run_document_review(
        "landDispute",
        [_text_doc(1, "জন্ম নিবন্ধন সনদ")],
        use_default_llm=False,
    )
    assert out["missing"] == ["land_record"]
    ids = next(i for i in out["checklist"] if i["key"] == "nid_copy")
    assert ids["status"] == "provided"


def test_scan_without_llm_needs_review():
    scan = {"id": 5, "content_type": "image/jpeg", "data_b64": base64.b64encode(b"x").decode()}
    out = run_document_review("labourDispute", [scan], use_default_llm=False)
    assert out["results"]["5"]["status"] == "needs_review"
    assert "employment_proof" in out["missing"]


def test_scan_is_read_by_llm_as_image_block():
    llm = FakeLLM(
        LLMReading(text="খতিয়ান নং ১২৩", kind="land_record", summary="Khatian 123.", legible=True)
    )
    scan = {"id": 9, "content_type": "image/png", "data_b64": base64.b64encode(b"x").decode()}
    out = run_document_review("landDispute", [scan], llm=llm)
    assert out["results"]["9"]["kind"] == "land_record"
    assert out["missing"] == ["nid_copy"]
    assert llm.calls[0]["content"][0]["type"] == "image"


def test_extractive_summary_respects_bangla_danda():
    text = "প্রথম বাক্য। দ্বিতীয় বাক্য। " + "অনেক লম্বা বাক্য " * 40 + "।"
    assert t6_document.extractive_summary(text).startswith("প্রথম বাক্য। দ্বিতীয় বাক্য।")


# --- T7 settlement ---------------------------------------------------------

PARTIES = [
    {"id": 1, "name": "Rohima Begum", "role": "applicant"},
    {"id": 2, "name": "Abdul Karim", "role": "respondent"},
]
TERMS = ["Abdul Karim will pay Tk 3,000 maintenance by the 5th of each month."]


def test_template_draft_passes_review_in_both_languages():
    for lang, statute in (("en", "Section 21C"), ("bn", "ধারা ২১গ")):
        out = run_settlement_draft(
            case_ref="DLAS-2026-045",
            parties=PARTIES,
            terms=TERMS,
            office="Rangpur",
            language=lang,
            use_default_llm=False,
        )
        assert out["ready_for_review"] is True, out.get("issues")
        assert out["draft_source"] == "template"
        assert statute in out["draft"]
        assert TERMS[0] in out["draft"]


def test_violence_on_record_blocks_drafting_until_acknowledged():
    kw = dict(case_ref="X", parties=PARTIES, terms=TERMS, office="Rangpur", use_default_llm=False)
    blocked = run_settlement_draft(risk_flags=["activeViolence"], **kw)
    assert blocked["ready_for_review"] is False
    assert "draft" not in blocked
    assert "mediation is not suitable" in blocked["issues"][0]

    allowed = run_settlement_draft(risk_flags=["activeViolence"], risk_acknowledged=True, **kw)
    assert allowed["ready_for_review"] is True


def test_missing_respondent_and_terms_are_reported():
    out = run_settlement_draft(
        case_ref="X", parties=PARTIES[:1], terms=[" "], office="Rangpur", use_default_llm=False
    )
    assert "No respondent among the parties" in out["issues"]
    assert "No agreed terms given" in out["issues"]


def test_llm_draft_that_drops_a_term_is_replaced_by_template():
    llm = FakeLLM(LLMDraft(draft="Settlement between Rohima Begum and Abdul Karim."))
    out = run_settlement_draft(
        case_ref="X", parties=PARTIES, terms=TERMS, office="Rangpur", language="en", llm=llm
    )
    assert out["draft_source"] == "template"
    assert out["ready_for_review"] is True


def test_good_llm_draft_is_kept():
    good = t7_settlement.template_draft(
        {"case_ref": "X", "parties": PARTIES, "terms": TERMS, "language": "en"}, "Rangpur"
    ).replace("SETTLEMENT AGREEMENT", "SETTLEMENT AGREEMENT (plain language)")
    out = run_settlement_draft(
        case_ref="X",
        parties=PARTIES,
        terms=TERMS,
        office="Rangpur",
        language="en",
        llm=FakeLLM(LLMDraft(draft=good)),
    )
    assert out["draft_source"] == "llm"
