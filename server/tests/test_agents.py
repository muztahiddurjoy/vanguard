import base64
from datetime import date

from app.agents import t5_intake, t6_document, t7_settlement
from app.agents.spoken import (
    clean_name,
    find_district,
    find_phone,
    parse_date,
    parse_safe_window,
    yes_or_no,
)
from app.agents.t5_intake import IntakeConversation, LLMOpening
from app.agents.t6_document import LLMReading, run_document_review
from app.agents.t7_settlement import LLMDraft, run_settlement_draft
from tests.nid_fakes import FakeRegistry


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
    assert find_district("Comilla") == "Cumilla"


def test_spoken_dates_names_and_answers():
    assert parse_date("2 June 1994") == date(1994, 6, 2)
    assert parse_date("১৫ই মার্চ ১৯৯০") == date(1990, 3, 15)
    assert parse_date("02/06/1994") == date(1994, 6, 2)  # day first, as written in Bangladesh
    assert parse_date("sometime in the nineties") is None
    assert clean_name("My father's name is Md. Abdul Karim") == "Md. Abdul Karim"
    assert clean_name("আমি রফিকুল ইসলাম বলছি") == "রফিকুল ইসলাম"
    # "মা" (mother) is inside "আমার" (my): only whole words count.
    assert t5_intake.filing_for_from("আমার জন্য") == "self"
    assert t5_intake.filing_for_from("আমার মায়ের জন্য") == "mother"
    assert t5_intake.filing_for_from("for my mother-in-law") == "other"
    assert t5_intake.respondent_from("আমার স্বামী জালালের বিরুদ্ধে") == ("জালাল", "husband")
    assert yes_or_no("No, don't send it now") is False


def talk(conv: IntakeConversation, sid: str, *utterances: str) -> dict:
    s: dict = {}
    for u in utterances:
        s = conv.turn(sid, u)
    return s


WAGES = "My employer has not paid my wages for three months"
LAND = "My mother's land deed was lost and nobody will help her"


def rafiq_verifies(conv: IntakeConversation, sid: str, filing: str, story: str = LAND) -> dict:
    conv.start(sid, channel="hotline_16699", language="en", caller_phone="+8801811223344")
    return talk(conv, sid, story, filing, "My name is Rafiqul Islam", "Mohammad Abdul Karim",
                "Rangpur", "2 June 1994")  # fmt: skip


def test_the_line_greets_then_listens_before_asking_anything():
    conv = IntakeConversation(use_default_llm=False, registry=FakeRegistry())
    s = conv.start("g1", channel="hotline_16699", language="en", caller_phone="01811223344")
    assert s["reply"] == t5_intake.GREETING["en"] and s["asking"] == "problem"
    # "Hello?" or a fragment is not what happened yet: the line only encourages.
    s = conv.turn("g1", "Hello? Can you hear me?")
    assert (s["reply"], s["asking"]) == (t5_intake.KEEP_LISTENING["en"], "problem")
    s = conv.turn("g1", "My husband")
    assert s["asking"] == "problem" and "problem" not in s["slots"]
    s = conv.turn("g1", "he beats me when he is drunk")
    # The account is kept in the caller's own words; the hellos are not part of it.
    assert s["slots"]["problem"] == "My husband he beats me when he is drunk"
    assert s["slots"]["category"] == "domesticViolence"
    assert s["reply"] == f"{t5_intake.HEARD['en']} {t5_intake.QUESTIONS['filing_for']['en']}"
    assert [n["topic"] for n in s["notes"]] == ["problem"] * 3
    assert s["identity"] == "pending"  # nothing is looked up before the account


def test_a_caller_who_never_says_what_happened_is_asked_to_call_again():
    conv = IntakeConversation(use_default_llm=False, use_default_registry=False)
    conv.start("u1", channel="hotline_16699")
    s = talk(conv, "u1", "হ্যালো", "হ্যালো, শুনতে পাচ্ছেন?")
    assert s["complete"] is False and s["reply"] == t5_intake.KEEP_LISTENING["bn"]
    s = conv.turn("u1", "হ্যালো")
    assert s["complete"] is True and s["reply"] == t5_intake.CLOSING_UNHEARD["bn"]
    assert "problem" not in s["slots"]


def test_a_short_account_is_taken_as_it_is_after_three_tries():
    conv = IntakeConversation(use_default_llm=False, use_default_registry=False)
    conv.start("u2", channel="hotline_16699", language="en")
    s = talk(conv, "u2", "help", "please", "my husband")
    assert s["slots"]["problem"] == "help please my husband"
    assert s["asking"] == "filing_for"


def test_caller_applying_for_themselves_is_verified_and_the_respondent_found():
    registry = FakeRegistry()
    conv = IntakeConversation(use_default_llm=False, registry=registry)
    conv.start("r1", channel="hotline_16699", language="en", caller_phone="+8801811223344")
    s = conv.turn("r1", WAGES)
    assert s["asking"] == "filing_for"
    s = conv.turn("r1", "For myself")
    assert s["asking"] == "caller_name"
    s = talk(conv, "r1", "My name is Rafiqul Islam", "Mohammad Abdul Karim", "Rangpur")
    assert s["asking"] == "date_of_birth"
    s = conv.turn("r1", "2 June 1994")
    assert s["identity"] == "verified" and s["caller_sim_registered"] is True
    # What happened was heard first and where they live comes from the NID record,
    # so the next question is who it is against.
    assert s["reply"] == (
        "Thank you, Rafiqul Islam. Your identity is confirmed. "
        + t5_intake.QUESTIONS["respondent_name"]["en"]
    )
    s = talk(conv, "r1", "Kamal Hossain, the factory owner", "Abdul Hamid", "Gaibandha")
    assert s["respondent_status"] == "found"
    assert s["slots"]["respondent_relation"] == "employer"
    assert s["asking"] == "notify_respondent"
    s = conv.turn("r1", "Yes, you can send it")
    # The caller ID is their contact number, so the phone question is skipped.
    assert s["asking"] == "safe_to_call"
    s = conv.turn("r1", "Any time after 5 pm")
    assert s["complete"] is True and s["reply"] == t5_intake.CLOSING["en"]
    slots = s["slots"]
    assert (slots["name"], slots["district"], slots["phone"]) == (
        "Rafiqul Islam", "Rangpur", "01811223344",
    )  # fmt: skip
    assert slots["notify_respondent"] is True
    assert t5_intake.missing_required(slots) == []
    assert len(s["notes"]) == 11
    assert s["notes"][0] == {**s["notes"][0], "topic": "problem", "text": WAGES}


def test_mother_is_confirmed_through_nid_parent_links():
    conv = IntakeConversation(use_default_llm=False, registry=FakeRegistry())
    s = rafiq_verifies(conv, "m1", "I am calling for my mother")
    assert s["asking"] == "name"
    assert s["reply"].endswith("What is your mother's name?")
    s = conv.turn("m1", "Rahima Khatun")
    assert s["applicant_status"] == "verified"
    assert s["reply"] == (
        "We found your mother, Rahima Khatun, in the NID records. "
        + t5_intake.QUESTIONS["respondent_name"]["en"]
    )
    assert s["applicant_record"]["nid"] == "4600000002"
    # The mother has no SMS number on the call, so the phone question is asked.
    s = conv.turn("m1", "no one")
    assert s["asking"] == "phone"
    assert s["reply"] == t5_intake.QUESTIONS_OTHER["phone"]["en"]


def test_father_needs_no_extra_name_question():
    conv = IntakeConversation(use_default_llm=False, registry=FakeRegistry())
    s = rafiq_verifies(conv, "f1", "for my father")
    assert s["applicant_status"] == "verified"
    assert s["applicant_record"]["nid"] == "4600000001"
    assert s["asking"] == "respondent_name"


def test_sister_in_bangla_and_a_stranger_is_not_accepted_as_a_sibling():
    conv = IntakeConversation(use_default_llm=False, registry=FakeRegistry())
    conv.start("s1", channel="hotline_16699", caller_phone="01811223344")
    s = talk(conv, "s1", "আমার বোনকে তার স্বামী মারধর করে", "আমার বোনের জন্য",
             "আমি রফিকুল ইসলাম বলছি", "মোঃ আব্দুল করিম", "রংপুর", "২ জুন ১৯৯৪",
             "শিরিন আক্তার")  # fmt: skip
    assert s["reply"].startswith("এনআইডি রেকর্ডে আপনার বোন শিরিন আক্তার-কে পাওয়া গেছে।")

    conv.start("s2", channel="hotline_16699", language="en")
    s = talk(conv, "s2", LAND, "for my brother", "Rafiqul Islam", "Abdul Karim", "Rangpur",
             "02/06/1994", "Jalal Uddin")  # fmt: skip
    assert s["applicant_status"] == "not_found"
    assert s["reply"].startswith("We could not find your brother or sister")
    assert "applicant_record" not in s


def test_wrong_security_answers_get_one_retry_then_intake_continues_unverified():
    conv = IntakeConversation(use_default_llm=False, registry=FakeRegistry())
    conv.start("w1", channel="hotline_16699", language="en")
    s = talk(conv, "w1", WAGES, "myself", "Rafiqul Islam", "Abdul Karim", "Rangpur",
             "3 June 1994")  # fmt: skip
    assert s["identity"] == "pending" and s["asking"] == "father_name"
    assert s["reply"].startswith(t5_intake.RETRY["en"])
    s = talk(conv, "w1", "Abdul Karim", "Rangpur", "I don't know")
    assert s["identity"] == "failed"
    assert (
        s["reply"] == f"{t5_intake.NOT_VERIFIED['en']} {t5_intake.QUESTIONS_SELF['district']['en']}"
    )


def test_a_question_is_asked_twice_at_most_then_skipped():
    conv = IntakeConversation(use_default_llm=False, use_default_registry=False)
    conv.start("q1", channel="hotline_16699", language="en")
    s = talk(conv, "q1", WAGES, "umm")
    assert s["asking"] == "filing_for"  # asked again
    s = conv.turn("q1", "what?")
    # Not understood twice: taken as applying for themselves, which an officer can correct.
    assert s["slots"]["filing_for"] == "self" and s["asking"] == "caller_name"
    s = talk(conv, "q1", "Rafiqul Islam", "a village near the river", "far from here")
    assert s["slots"]["district"] == "" and s["asking"] == "respondent_name"


def test_caller_who_cannot_answer_is_found_through_the_sim_they_call_from():
    registry = FakeRegistry()
    conv = IntakeConversation(use_default_llm=False, registry=registry)
    conv.start("x1", channel="hotline_16699", language="en", caller_phone="01811223344")
    s = talk(conv, "x1", WAGES, "for myself", "Rafiqul Islam", "I don't know")
    # One unknown answer is enough: the other security questions are not asked.
    assert (s["identity"], s["identity_via"]) == ("verified", "sim")
    assert s["caller_record"]["nid"] == "4600000003" and s["caller_sim_registered"] is True
    assert s["reply"] == (
        "Thank you, Rafiqul Islam. Your identity is confirmed. "
        + t5_intake.QUESTIONS["respondent_name"]["en"]
    )
    assert registry.calls == ["sim_owner", "citizen"]


def test_wife_calling_on_her_husbands_phone_is_found_through_his_nid_family():
    conv = IntakeConversation(use_default_llm=False, registry=FakeRegistry())
    conv.start("x2", channel="hotline_16699", caller_phone="01722000333")  # Jalal's SIM
    s = talk(conv, "x2", "আমার স্বামী আমাকে প্রতিদিন মারধর করে", "আমার নিজের জন্য",
             "আমার নাম ময়ূরী আক্তার", "জানি না")  # fmt: skip
    assert (s["identity"], s["identity_via"]) == ("verified", "sim_family")
    assert s["caller_record"]["nid"] == "4600000012"
    assert s["caller_sim_registered"] is False  # the phone is his, not hers
    # She does not know his father's name: he is found on her NID record by first name.
    s = talk(conv, "x2", "আমার স্বামী জালালের বিরুদ্ধে", "জানি না", "রংপুর")
    assert (s["respondent_status"], s["respondent_via"]) == ("found", "family")
    assert s["respondent_record"]["nid"] == "4600000011"
    # The phone she calls from is his: she is asked for a safe number instead.
    s = conv.turn("x2", "না, এখন না")
    assert s["asking"] == "phone" and "phone" not in s["slots"]
    assert s["reply"] == t5_intake.QUESTIONS_SELF["phone"]["bn"]


def test_a_respondent_who_is_not_family_is_not_looked_for_on_the_nid_record():
    registry = FakeRegistry()
    conv = IntakeConversation(use_default_llm=False, registry=registry)
    rafiq_verifies(conv, "x4", "myself", story=WAGES)
    s = talk(conv, "x4", "Kamal Hossain, the factory owner", "I don't know", "Gaibandha")
    assert s["respondent_status"] == "not_found"
    assert registry.calls == ["match"]  # the caller's check; no family lookup for an employer


def test_wrong_answers_twice_then_a_sim_that_is_not_theirs_leaves_them_unverified():
    conv = IntakeConversation(use_default_llm=False, registry=FakeRegistry())
    conv.start("x3", channel="hotline_16699", language="en", caller_phone="01911000001")
    s = talk(conv, "x3", WAGES, "myself", "Rafiqul Islam", "Abdul Karim", "Rangpur",
             "3 June 1994", "Abdul Karim", "Rangpur", "4 June 1994")  # fmt: skip
    # Kamal's SIM, and Kamal's NID record has no Rafiqul Islam in his family.
    assert (s["identity"], s["verify_attempts"]) == ("failed", 2)
    assert s["reply"].startswith(t5_intake.NOT_VERIFIED["en"])
    assert "caller_record" not in s


def test_registry_outage_skips_verification_without_retrying():
    registry = FakeRegistry(down=True)
    conv = IntakeConversation(use_default_llm=False, registry=registry)
    s = rafiq_verifies(conv, "d1", "myself")
    assert s["identity"] == "unavailable"
    assert s["reply"].startswith(t5_intake.REGISTRY_DOWN["en"])
    assert registry.calls == ["match"]


def test_without_a_registry_no_security_questions_are_asked():
    conv = IntakeConversation(use_default_llm=False, use_default_registry=False)
    conv.start("n1", channel="udc", language="en")
    s = talk(conv, "n1", "My neighbour's husband beats her and she has visible injuries",
             "I am calling for my neighbour", "My name is Ripon", "Moyuri Akter")  # fmt: skip
    assert s["asking"] == "district"
    assert s["slots"]["category"] == "domesticViolence"
    s = talk(conv, "n1", "01712-345318, she lives in Rangpur")
    assert (s["slots"]["phone"], s["slots"]["district"]) == ("01712345318", "Rangpur")
    s = talk(conv, "n1", "Her husband Jalal Uddin", "I don't know", "Rangpur")
    assert s["slots"]["respondent_father_name"] == ""
    assert s["respondent_status"] == "unavailable"
    assert s["asking"] == "safe_to_call"
    s = conv.turn("n1", "Tuesday 2 to 4 pm, he checks her phone")
    assert s["complete"] is True and s["reply"] == t5_intake.CLOSING["en"]


def test_conversations_are_isolated_by_session():
    conv = IntakeConversation(use_default_llm=False, use_default_registry=False)
    conv.start("a", channel="udc")
    conv.start("b", channel="udc")
    conv.turn("a", "আমার জমি দখল করে নিয়েছে")
    assert conv.state("a")["slots"]["problem"] == "আমার জমি দখল করে নিয়েছে"
    assert conv.state("b")["slots"] == {}


def test_danger_in_the_first_words_ends_the_call_with_emergency_guidance():
    conv = IntakeConversation(use_default_llm=False, use_default_registry=False)
    conv.start("c", channel="hotline_16699")
    s = conv.turn("c", "ও এখনই আমাকে মেরে ফেলবে")
    assert s["emergency"] is True
    assert s["complete"] is True
    assert "৯৯৯" in s["reply"]


def test_hostage_sign_promises_no_callback_and_intake_carries_on():
    conv = IntakeConversation(use_default_llm=False, use_default_registry=False)
    conv.start("h1", channel="hotline_16699", language="en")
    s = conv.turn("h1", "My husband has locked me in the room")
    assert s["hostage"] is True and s["complete"] is False
    assert s["reply"].startswith(t5_intake.HOSTAGE_ACK["en"])
    assert s["asking"] == "filing_for"
    s = conv.turn("h1", "ও এখনই আমাকে মেরে ফেলবে")
    assert s["complete"] is True
    assert s["reply"] == t5_intake.HOSTAGE_EMERGENCY["en"]


def test_llm_extraction_fills_free_form_answers_but_rules_win_on_phone():
    # start() has an empty utterance and never calls the model, so one result is enough.
    llm = FakeLLM(
        LLMOpening(
            kind="case",
            filing_for="other",
            name="Moyuri Akter",
            phone="01999999999",
            problem="Husband beats her",
            date_of_birth="not a date",
            phone_monitored=True,
        ),
    )
    conv = IntakeConversation(llm=llm, use_default_registry=False)
    conv.start("d", channel="hotline_16699", language="en")
    said = "Calling about Moyuri Akter, 01712345318, her husband beats her"
    s = conv.turn("d", said)
    assert s["slots"]["filing_for"] == "other"
    assert s["slots"]["phone"] == "01712345318"
    assert s["slots"]["name"] == "Moyuri Akter"
    assert s["slots"]["phone_monitored"] is True
    assert s["slots"]["problem"] == said  # the caller's words, not the model's summary
    assert "date_of_birth" not in s["slots"]  # the model's answer failed validation
    assert len(llm.calls) == 1 and llm.calls[0]["schema"] is LLMOpening
    # Everything the caller asked is known, so the next question is what is not.
    assert s["asking"] == "caller_name"


def test_llm_hears_a_case_the_rules_cannot_place_and_danger_without_keywords():
    conv = IntakeConversation(llm=FakeLLM(LLMOpening(kind="case")), use_default_registry=False)
    conv.start("k1", channel="hotline_16699", language="en")
    s = conv.turn("k1", "He cheated me")
    assert s["slots"]["problem"] == "He cheated me" and s["asking"] == "filing_for"

    llm = FakeLLM(LLMOpening(kind="case", danger_now=True))
    conv = IntakeConversation(llm=llm, use_default_registry=False)
    conv.start("k2", channel="hotline_16699", language="en")
    s = conv.turn("k2", "He is outside the door, he says tonight is my last night")
    assert s["emergency"] is True and s["complete"] is True
    assert s["reply"] == t5_intake.EMERGENCY["en"]


def test_llm_cannot_turn_away_a_problem_the_rules_know():
    conv = IntakeConversation(llm=FakeLLM(LLMOpening(kind="unclear")), use_default_registry=False)
    conv.start("k3", channel="hotline_16699")
    s = conv.turn("k3", "যৌতুক")
    assert s["slots"]["problem"] == "যৌতুক" and s["slots"]["category"] == "dowryHarassment"


def test_not_a_legal_matter_is_pointed_to_the_helpline_then_the_call_ends():
    other = LLMOpening(kind="other")
    conv = IntakeConversation(llm=FakeLLM(other, other, other), use_default_registry=False)
    conv.start("o1", channel="hotline_16699", language="en")
    s = conv.turn("o1", "I want to know what is happening with my application")
    assert s["asking"] == "problem" and s["complete"] is False
    assert s["reply"] == t5_intake.NOT_LEGAL["en"].format(helpline="1 6 4 3 0")
    s = talk(conv, "o1", "My application", "The application I made last month")
    assert s["complete"] is True
    assert s["reply"] == t5_intake.CLOSING_NOT_LEGAL["en"].format(helpline="1 6 4 3 0")
    assert "problem" not in s["slots"]


def test_a_hello_is_not_sent_to_the_model():
    llm = FakeLLM()
    conv = IntakeConversation(llm=llm, use_default_registry=False)
    conv.start("o2", channel="hotline_16699")
    conv.turn("o2", "হ্যালো, শুনতে পাচ্ছেন?")
    assert llm.calls == []


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


def test_parse_safe_window_english_and_bangla():
    assert parse_safe_window("Tuesday 2 to 4 pm") == {
        "day": 2,
        "start_hour": 14,
        "end_hour": 16,
    }
    assert parse_safe_window("মঙ্গলবার দুপুর ২টা থেকে ৪টা") == {
        "day": 2,
        "start_hour": 14,
        "end_hour": 16,
    }
    assert parse_safe_window("sometime next week") is None
    assert parse_safe_window("Monday or Tuesday 2-4 pm") is None
