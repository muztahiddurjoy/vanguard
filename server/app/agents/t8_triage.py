"""T8 triage: Categorization -> Compliance -> Urgency -> Track.

Produces the dashboard's ``TriageRecommendation``: a priority, a confidence,
the warning signs checked (each tagged with the check that found it), a
bilingual rationale, and a *track* mark saying which way the case could go:

- ``advice``: can be resolved through advice alone;
- ``mediation``: a dispute with another side that mediation could settle;
- ``sensitive``: violence, threats or other risk; needs an officer's care.

Everything here is a recommendation that an officer accepts or changes. The
priority is always decided by the transparent rules in ``urgency`` so an
officer can see exactly why; Claude is only asked to categorize narratives the
keyword rules cannot place confidently, and to choose between advice and
mediation. It can never lower a case the rules marked sensitive.
"""

import re
from functools import lru_cache
from typing import Any, Literal

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from pydantic import BaseModel, Field

from app.agents.llm import StructuredLLM, default_llm
from app.agents.state import AgentKey, TriageFactor, TriageState, Weight
from app.database import utcnow

CATEGORIES = (
    "domesticViolence",
    "dowryHarassment",
    "cyberHarassment",
    "landDispute",
    "familyMaintenance",
    "labourDispute",
    "childCustody",
)

# English terms match on word starts; Bangla terms match as substrings
# (regex word boundaries are unreliable around Bangla vowel signs).
CATEGORY_TERMS: dict[str, tuple[str, ...]] = {
    # Abuse words only: "husband" or "in-laws" appear in every family matter.
    "domesticViolence": (
        "beat", "beating", "assault", "hit me", "hits me", "abuse", "violence", "injur",
        "slap", "মারধর", "নির্যাতন", "আঘাত", "মারে",
    ),
    "dowryHarassment": ("dowry", "যৌতুক"),
    "cyberHarassment": (
        "facebook", "online", "blackmail", "fake account", "fake id", "private photo",
        "video", "messenger", "ফেসবুক", "অনলাইন", "ব্ল্যাকমেইল", "ভুয়া আইডি", "ছবি",
    ),
    "landDispute": (
        "land", "plot", "deed", "khatian", "boundary", "property", "grabb",
        "জমি", "দলিল", "খতিয়ান", "সীমানা", "দখল",
    ),
    "familyMaintenance": (
        "maintenance", "divorce", "dower", "denmohor", "talaq",
        "ভরণপোষণ", "খোরপোশ", "তালাক", "দেনমোহর", "মোহরানা",
    ),
    "labourDispute": (
        "wage", "salary", "factory", "employer", "worker", "dismissed", "overtime", "unpaid",
        "মজুরি", "বেতন", "কারখানা", "শ্রমিক", "মালিক", "ছাঁটাই",
    ),
    "childCustody": ("custody", "guardianship", "হেফাজত", "অভিভাবকত্ব"),
}  # fmt: skip

# Some terms imply a more specific category than the one they share words with.
CATEGORY_BONUS = {"dowryHarassment": 3.0, "childCustody": 1.5}

FactorSpec = tuple[AgentKey, Weight, tuple[str, ...]]

RISK_FACTORS: dict[str, FactorSpec] = {
    "activeViolence": (
        "risk", "high",
        ("beat", "beating", "assault", "hit me", "hits me", "injur", "bleeding", "slap",
         "মারধর", "মারে", "আঘাত", "রক্ত"),
    ),
    "weaponThreat": (
        "risk", "high",
        ("knife", "machete", "acid", "gun", "kill", "burn her", "burn me",
         "ছুরি", "এসিড", "মেরে ফেল", "খুন", "দা দিয়ে", "পুড়িয়ে"),
    ),
    # Person-specific phrasing on purpose: "আটকে রেখেছে" alone also means
    # "withheld" (wages, money), which is a labour dispute, not a hostage.
    "hostageSituation": (
        "risk", "high",
        ("hostage", "held captive", "kidnap", "abduct", "locked me", "locked her",
         "locked him", "locked us", "locked in the room", "locked in a room",
         "locked in the house", "won't let me leave", "will not let me leave",
         "not letting me leave", "won't let me out", "confined me", "confined her",
         "জিম্মি", "অপহরণ", "আমাকে আটকে", "তাকে আটকে", "ওকে আটকে", "ঘরে আটকে",
         "বন্দি করে", "বন্দী করে", "ঘরে বন্দি", "ঘরে বন্দী", "আমাকে তালা", "ঘরে তালা",
         "বের হতে দিচ্ছে না", "যেতে দিচ্ছে না"),
    ),
    "extortionThreat": (
        "risk", "high",
        ("blackmail", "extort", "demand money", "demands money", "ransom",
         "ব্ল্যাকমেইল", "টাকা চায়", "টাকা দাবি"),
    ),
    "onlineAbuse": (
        "risk", "medium",
        ("facebook", "online", "fake account", "fake id", "messenger", "video",
         "ফেসবুক", "অনলাইন", "ভুয়া আইডি"),
    ),
    "childrenInHousehold": (
        "safety", "medium",
        ("child", "children", "son", "daughter", "kids", "সন্তান", "শিশু", "বাচ্চা"),
    ),
    "financialDependency": (
        "safety", "low",
        ("no income", "depend", "no money", "cannot afford", "can't afford",
         "আয় নেই", "টাকা নেই", "নির্ভর"),
    ),
    "priorLegalAction": (
        "intake", "low",
        ("gd ", "g.d.", "fir", "case filed", "police station", "court",
         "জিডি", "মামলা", "থানা", "আদালত"),
    ),
}  # fmt: skip

PHONE_MONITORED = (
    "monitors her phone", "monitors his phone", "monitors my phone",
    "checks her phone", "checks his phone", "checks my phone",
    "takes her phone", "takes his phone", "takes my phone",
    "ফোন দেখে", "ফোন নিয়ে", "ফোন চেক",
)  # fmt: skip

LABELS: dict[str, tuple[str, str]] = {
    "activeViolence": ("active violence", "চলমান সহিংসতা"),
    "weaponThreat": ("threat with a weapon or to kill", "অস্ত্র বা হত্যার হুমকি"),
    "hostageSituation": ("possibly held hostage", "জিম্মি থাকার আশঙ্কা"),
    "extortionThreat": ("blackmail or extortion", "ব্ল্যাকমেইল বা চাঁদাবাজি"),
    "onlineAbuse": ("online abuse", "অনলাইন হয়রানি"),
    "childrenInHousehold": ("children in the household", "পরিবারে শিশু"),
    "financialDependency": ("financial dependency", "আর্থিক নির্ভরতা"),
    "priorLegalAction": ("earlier legal action", "আগের আইনি পদক্ষেপ"),
    "proxyReported": ("reported by someone else (access barrier)", "অন্য কেউ জানিয়েছেন"),
    "safeContactRestricted": ("safe contact restricted", "নিরাপদ যোগাযোগ সীমিত"),
    "outOfJurisdiction": ("outside this district", "এই জেলার বাইরে"),
    "hearingImminent": ("court hearing within a week", "এক সপ্তাহের মধ্যে শুনানি"),
}

PRIORITY_BN = {"critical": "জরুরি", "high": "উচ্চ", "medium": "মাঝারি", "low": "নিম্ন"}
WEIGHT_POINTS = {"high": 3, "medium": 2, "low": 1}

# Categorizations below this confidence are sent to Claude when available.
LLM_CATEGORY_THRESHOLD = 0.5

TRACKS = ("advice", "mediation", "sensitive")
TRACK_LABELS: dict[str, tuple[str, str]] = {
    "advice": ("Can be resolved through advice", "পরামর্শের মাধ্যমে সমাধানযোগ্য"),
    "mediation": ("Can be resolved through mediation", "মধ্যস্থতার মাধ্যমে সমাধানযোগ্য"),
    "sensitive": ("Sensitive case", "সংবেদনশীল মামলা"),
}
# Warning signs that make a case sensitive, most serious first.
SENSITIVE_FACTORS = (
    "hostageSituation",
    "weaponThreat",
    "activeViolence",
    "extortionThreat",
    "safeContactRestricted",
)
SENSITIVE_CATEGORIES: dict[str, tuple[str, str]] = {
    "domesticViolence": ("domestic violence", "পারিবারিক সহিংসতা"),
    "dowryHarassment": ("dowry harassment", "যৌতুকের জন্য হয়রানি"),
    "cyberHarassment": ("cyber harassment", "সাইবার হয়রানি"),
}
SENSITIVE_TERMS = (
    "rape", "sexual", "molest", "trafficking", "acid", "child marriage", "suicide",
    "ধর্ষণ", "যৌন", "শ্লীলতাহানি", "পাচার", "এসিড", "বাল্যবিবাহ", "বাল্য বিবাহ", "আত্মহত্যা",
)  # fmt: skip
# Someone on the other side of a dispute; without one there is nobody to mediate with.
COUNTERPARTY_TERMS = (
    "husband", "wife", "employer", "owner", "neighbour", "neighbor", "brother", "cousin",
    "uncle", "landlord", "tenant", "in-laws", "relative", "company", "factory",
    "স্বামী", "স্ত্রী", "মালিক", "প্রতিবেশী", "ভাই", "চাচা", "মামা", "শ্বশুর", "শাশুড়ি",
    "ভাড়াটিয়া", "বাড়িওয়ালা", "আত্মীয়", "কোম্পানি", "কারখানা",
)  # fmt: skip
ADVICE_TERMS = (
    "advice", "how do i", "how can i", "what should i", "what can i", "want to know",
    "is it legal", "my rights", "পরামর্শ", "জানতে চাই", "কীভাবে", "কিভাবে", "কী করব",
    "কি করব", "করণীয়", "অধিকার",
)  # fmt: skip


def _matches(text: str, term: str) -> bool:
    if term.isascii():
        return re.search(r"(?<![a-z])" + re.escape(term), text) is not None
    return term in text


def _first_match(text: str, terms: tuple[str, ...]) -> str | None:
    return next((t.strip() for t in terms if _matches(text, t)), None)


def find_hostage_sign(text: str) -> str | None:
    """The phrase suggesting someone is being held, if any (also used by T5 on calls)."""
    return _first_match(text.casefold(), RISK_FACTORS["hostageSituation"][2])


def has_risk_sign(text: str) -> bool:
    """Whether ``text`` mentions any warning sign (violence, threats, hostage, ...)."""
    lowered = text.casefold()
    return any(_first_match(lowered, terms) for _, _, terms in RISK_FACTORS.values())


def track_by_rules(
    text: str, category: str | None, detected: set[str], has_respondent: bool
) -> tuple[str, dict[str, str]]:
    """Mark the case advice, mediation or sensitive, with a bilingual reason."""
    lowered = text.casefold()
    signs = [LABELS[k] for k in SENSITIVE_FACTORS if k in detected]
    if category in SENSITIVE_CATEGORIES:
        signs.append(SENSITIVE_CATEGORIES[category])
    if term := _first_match(lowered, SENSITIVE_TERMS):
        signs.append((f'mentions "{term}"', f'"{term}" উল্লেখ আছে'))
    if signs:
        return "sensitive", {
            "en": f"Sensitive case: {', '.join(en for en, _ in signs)}.",
            "bn": f"সংবেদনশীল মামলা: {', '.join(bn for _, bn in signs)}।",
        }

    counterparty = "the named respondent" if has_respondent else None
    counterparty = counterparty or _first_match(lowered, COUNTERPARTY_TERMS)
    if counterparty:
        return "mediation", {
            "en": f"Can be resolved through mediation: a dispute with {counterparty} "
            "and no sign of violence.",
            "bn": "মধ্যস্থতার মাধ্যমে সমাধানযোগ্য: অপর পক্ষের সঙ্গে বিরোধ, সহিংসতার কোনো ইঙ্গিত নেই।",
        }
    asking = _first_match(lowered, ADVICE_TERMS)
    return "advice", {
        "en": "Can be resolved through advice: no other side is named"
        + (", and the applicant is asking for information." if asking else "."),
        "bn": "পরামর্শের মাধ্যমে সমাধানযোগ্য: অপর কোনো পক্ষের নাম নেই"
        + ("; আবেদনকারী তথ্য জানতে চাইছেন।" if asking else "।"),
    }


def categorize_by_rules(text: str) -> tuple[str | None, float]:
    """Keyword vote. Confidence is the winner's share of all matched weight."""
    lowered = text.casefold()
    scores: dict[str, float] = {}
    for category, terms in CATEGORY_TERMS.items():
        hits = sum(1 for t in terms if _matches(lowered, t))
        if hits:
            scores[category] = hits * CATEGORY_BONUS.get(category, 1.0)
    if not scores:
        return None, 0.0
    best = max(scores, key=lambda c: scores[c])
    return best, round(scores[best] / sum(scores.values()), 2)


class LLMCategory(BaseModel):
    category: Literal[
        "domesticViolence",
        "dowryHarassment",
        "cyberHarassment",
        "landDispute",
        "familyMaintenance",
        "labourDispute",
        "childCustody",
        "other",
    ]
    confidence: float = Field(description="0 to 1")


class LLMTrack(BaseModel):
    track: Literal["advice", "mediation", "sensitive"]
    reason_en: str = Field(description="One sentence, plain English")
    reason_bn: str = Field(description="The same sentence in Bangla")


TRACK_SYSTEM = (
    "You help a District Legal Aid Office in Bangladesh sort applications. Mark how the "
    "application could be resolved: 'advice' if legal advice or information alone could "
    "resolve it; 'mediation' if it is a dispute with another side that the office could "
    "settle by mediation; 'sensitive' if there is violence, threats, sexual abuse, a risk to "
    "someone's safety, or another reason it needs special care. This is only a mark for an "
    "officer, who decides. Give a one-sentence reason in English and in Bangla."
)

CATEGORY_SYSTEM = (
    "You categorize legal aid applications received by a District Legal Aid Office in "
    "Bangladesh. Narratives may be in Bangla, English or a mix, and are often transcribed "
    "from phone calls. Pick the single category that best describes the legal problem the "
    "applicant needs help with; use 'other' if none fits. Dowry-related abuse is "
    "dowryHarassment rather than domesticViolence."
)


def build_triage_graph(llm: StructuredLLM | None = None) -> CompiledStateGraph:
    def categorize(state: TriageState) -> TriageState:
        category, confidence = categorize_by_rules(state["text"])
        if confidence < LLM_CATEGORY_THRESHOLD and llm is not None:
            result = llm.structured(
                system=CATEGORY_SYSTEM,
                content=f"<narrative>\n{state['text']}\n</narrative>",
                schema=LLMCategory,
            )
            if result is not None:
                return {
                    "category": None if result.category == "other" else result.category,
                    "category_confidence": round(max(0.0, min(1.0, result.confidence)), 2),
                    "category_source": "llm",
                }
        return {
            "category": category,
            "category_confidence": confidence,
            "category_source": "rules",
        }

    def compliance(state: TriageState) -> TriageState:
        text = state["text"].casefold()
        factors: list[TriageFactor] = []
        notes: list[str] = []

        for key, (agent, weight, terms) in RISK_FACTORS.items():
            evidence = _first_match(text, terms)
            factors.append(
                TriageFactor(
                    key=key, detected=evidence is not None, agent=agent, weight=weight,
                    evidence=evidence,
                )
            )  # fmt: skip

        proxy = bool(state.get("is_proxy")) or state.get("channel") == "proxy"
        factors.append(
            TriageFactor(
                key="proxyReported", detected=proxy, agent="intake", weight="medium",
                evidence="reported on the applicant's behalf" if proxy else None,
            )
        )  # fmt: skip
        if proxy:
            notes.append("Reported by a proxy: confirm consent with the applicant directly.")

        monitored = _first_match(text, PHONE_MONITORED)
        restricted = state.get("safety_level") == "restricted" or monitored is not None
        factors.append(
            TriageFactor(
                key="safeContactRestricted", detected=restricted, agent="safety", weight="high",
                evidence=monitored or ("safety level restricted" if restricted else None),
            )
        )  # fmt: skip
        recommended_level = "restricted" if restricted else state.get("safety_level", "standard")
        if restricted:
            notes.append("Contact only inside the applicant's safe window, with neutral wording.")

        district = (state.get("district") or "").strip()
        office = state.get("office_district", "").strip()
        outside = bool(district and office and district.casefold() != office.casefold())
        factors.append(
            TriageFactor(
                key="outOfJurisdiction", detected=outside, agent="jurisdiction", weight="medium",
                evidence=district if outside else None,
            )
        )  # fmt: skip
        if outside:
            notes.append(f"Applicant is in {district}: refer to that district's legal aid office.")

        days = state.get("next_hearing_days")
        imminent = days is not None and 0 <= days <= 7
        factors.append(
            TriageFactor(
                key="hearingImminent", detected=imminent, agent="intake", weight="high",
                evidence=f"hearing in {days} days" if imminent else None,
            )
        )  # fmt: skip

        detected = {f["key"] for f in factors if f["detected"]}
        if {"activeViolence", "weaponThreat"} & detected:
            notes.append("Violence reported: not suitable for mediation until safety is secured.")
        if "hostageSituation" in detected:
            notes.append("Possibly held hostage: do not call or text the applicant's number.")

        return {
            "factors": factors,
            "compliance_notes": notes,
            "recommended_safety_level": recommended_level,
        }

    def urgency(state: TriageState) -> TriageState:
        factors = state["factors"]
        detected = {f["key"] for f in factors if f["detected"]}
        score = sum(WEIGHT_POINTS[f["weight"]] for f in factors if f["detected"])

        if {"weaponThreat", "hostageSituation"} & detected:
            priority = "critical"
        elif {"activeViolence", "extortionThreat", "hearingImminent"} & detected or score >= 6:
            priority = "high"
        elif score >= 3:
            priority = "medium"
        else:
            priority = "low"

        # Confidence grows with how clearly the case was categorized and how
        # much evidence the checks found; it never claims certainty.
        confidence = 0.5 + 0.3 * state.get("category_confidence", 0.0) + 0.03 * len(detected)
        confidence = round(min(confidence, 0.95), 2)

        ordered = sorted(
            (f for f in factors if f["detected"]), key=lambda f: -WEIGHT_POINTS[f["weight"]]
        )
        signs_en = ", ".join(LABELS[f["key"]][0] for f in ordered) or "no warning signs found"
        signs_bn = ", ".join(LABELS[f["key"]][1] for f in ordered) or "কোনো সতর্ক সংকেত পাওয়া যায়নি"
        rationale = {
            "en": f"Recommended {priority.upper()}: {signs_en}.",
            "bn": f"প্রস্তাবিত অগ্রাধিকার {PRIORITY_BN[priority]}: {signs_bn}।",
        }
        return {"priority": priority, "confidence": confidence, "rationale": rationale}

    def track(state: TriageState) -> TriageState:
        detected = {f["key"] for f in state["factors"] if f["detected"]}
        key, reason = track_by_rules(
            state["text"], state.get("category"), detected, bool(state.get("has_respondent"))
        )
        if llm is not None and key != "sensitive":
            result = llm.structured(
                system=TRACK_SYSTEM,
                content=f"<narrative>\n{state['text']}\n</narrative>",
                schema=LLMTrack,
            )
            if result is not None:
                return {
                    "track": result.track,
                    "track_reason": {"en": result.reason_en, "bn": result.reason_bn},
                    "track_source": "llm",
                }
        return {"track": key, "track_reason": reason, "track_source": "rules"}

    graph = StateGraph(TriageState)
    graph.add_node("categorize", categorize)
    graph.add_node("compliance", compliance)
    graph.add_node("urgency", urgency)
    graph.add_node("track", track)
    graph.add_edge(START, "categorize")
    graph.add_edge("categorize", "compliance")
    graph.add_edge("compliance", "urgency")
    graph.add_edge("urgency", "track")
    graph.add_edge("track", END)
    return graph.compile()


@lru_cache(maxsize=1)
def _rules_only_graph() -> CompiledStateGraph:
    return build_triage_graph(None)


def run_triage(
    text: str,
    *,
    channel: str = "online",
    district: str | None = None,
    office_district: str = "",
    is_proxy: bool = False,
    safety_level: str = "standard",
    next_hearing_days: int | None = None,
    has_respondent: bool = False,
    llm: StructuredLLM | None = None,
    use_default_llm: bool = True,
) -> dict[str, Any]:
    """Run the pipeline and return a dashboard-shaped TriageRecommendation."""
    model = llm if llm is not None else (default_llm() if use_default_llm else None)
    graph = build_triage_graph(model) if model is not None else _rules_only_graph()
    out = graph.invoke(
        {
            "text": text,
            "channel": channel,
            "district": district,
            "office_district": office_district,
            "is_proxy": is_proxy,
            "safety_level": safety_level,
            "next_hearing_days": next_hearing_days,
            "has_respondent": has_respondent,
        }
    )
    return {
        "priority": out["priority"],
        "confidence": out["confidence"],
        "factors": out["factors"],
        "rationale": out["rationale"],
        "status": "pending",
        "generatedAt": utcnow().isoformat(),
        "category": out.get("category"),
        "categoryConfidence": out.get("category_confidence"),
        "categorySource": out.get("category_source"),
        "complianceNotes": out.get("compliance_notes", []),
        "recommendedSafetyLevel": out.get("recommended_safety_level"),
        "track": {
            "key": out["track"],
            "reason": out["track_reason"],
            "source": out["track_source"],
        },
    }
