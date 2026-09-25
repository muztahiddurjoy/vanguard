from app.agents.t8_triage import LLMCategory, categorize_by_rules, run_triage

MOYURI = (
    "Neighbour reports repeated physical assault by the husband, most recently two days ago "
    "with visible injuries. The husband monitors her phone; she can only speak safely on "
    "Tuesdays 2-4 PM while he is at the weekly market. Two children (6 and 9) live in the home."
)


def detected(rec: dict) -> set[str]:
    return {f["key"] for f in rec["factors"] if f["detected"]}


def triage(text: str, **kw) -> dict:
    kw.setdefault("office_district", "Rangpur")
    return run_triage(text, use_default_llm=False, **kw)


def test_moyuri_matches_the_dashboard_recommendation():
    rec = triage(MOYURI, channel="proxy", district="Rangpur")
    assert rec["category"] == "domesticViolence"
    assert rec["priority"] == "high"
    assert {
        "activeViolence",
        "proxyReported",
        "safeContactRestricted",
        "childrenInHousehold",
    } <= detected(rec)
    assert "outOfJurisdiction" not in detected(rec)
    assert rec["recommendedSafetyLevel"] == "restricted"
    assert rec["rationale"]["en"].startswith("Recommended HIGH:")
    assert rec["rationale"]["bn"].startswith("প্রস্তাবিত অগ্রাধিকার উচ্চ")
    assert rec["status"] == "pending"
    assert 0.5 <= rec["confidence"] <= 0.95


def test_every_factor_names_the_check_that_ran_it():
    rec = triage(MOYURI, channel="proxy")
    agents = {f["key"]: f["agent"] for f in rec["factors"]}
    assert agents["activeViolence"] == "risk"
    assert agents["safeContactRestricted"] == "safety"
    assert agents["outOfJurisdiction"] == "jurisdiction"
    assert agents["proxyReported"] == "intake"


def test_weapon_threat_is_critical():
    rec = triage("My husband beat me and said he will kill me with a knife.")
    assert rec["priority"] == "critical"
    assert "weaponThreat" in detected(rec)


def test_bangla_narrative():
    rec = triage("স্বামী প্রতিদিন মারধর করে, যৌতুকের টাকা চায়। আমার দুই সন্তান আছে।")
    assert rec["category"] == "dowryHarassment"
    assert {"activeViolence", "childrenInHousehold", "extortionThreat"} <= detected(rec)
    assert rec["priority"] == "high"


def test_land_dispute_without_danger_is_low_or_medium():
    rec = triage("My uncle is occupying my father's land. The deed and khatian are in my name.")
    assert rec["category"] == "landDispute"
    assert rec["priority"] in {"low", "medium"}
    assert not {"activeViolence", "weaponThreat"} & detected(rec)


def test_out_of_district_is_flagged_for_referral():
    rec = triage("Cyber harassment on Facebook with a fake account.", district="Dhaka")
    assert "outOfJurisdiction" in detected(rec)
    assert any("refer" in n for n in rec["complianceNotes"])


def test_imminent_hearing_raises_priority():
    rec = triage("Land boundary dispute with neighbour.", next_hearing_days=3)
    assert rec["priority"] == "high"


def test_violence_marks_case_unsuitable_for_mediation():
    rec = triage(MOYURI)
    assert any("mediation" in n for n in rec["complianceNotes"])


def test_keyword_confidence_is_share_of_matches():
    assert categorize_by_rules("nothing relevant here") == (None, 0.0)
    category, confidence = categorize_by_rules("unpaid wage at the factory")
    assert category == "labourDispute" and confidence == 1.0


class FakeLLM:
    def __init__(self, result):
        self.result = result
        self.calls = 0

    def structured(self, **_kw):
        self.calls += 1
        return self.result


def test_ambiguous_text_is_categorized_by_llm_when_available():
    llm = FakeLLM(LLMCategory(category="childCustody", confidence=0.8))
    rec = run_triage("আমি আমার মেয়েকে ফেরত চাই", office_district="Rangpur", llm=llm)
    assert llm.calls == 1
    assert rec["category"] == "childCustody"
    assert rec["categorySource"] == "llm"


def test_clear_text_does_not_call_llm():
    llm = FakeLLM(LLMCategory(category="other", confidence=0.9))
    rec = run_triage("unpaid wage at the factory", office_district="Rangpur", llm=llm)
    assert llm.calls == 0
    assert rec["categorySource"] == "rules"


def test_llm_failure_falls_back_to_rules():
    llm = FakeLLM(None)
    rec = run_triage("something happened", office_district="Rangpur", llm=llm)
    assert llm.calls == 1
    assert rec["categorySource"] == "rules"
    assert rec["priority"] == "low"
