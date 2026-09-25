"""T8 triage: Categorization -> Compliance -> Urgency.

Produces the dashboard's ``TriageRecommendation``: a priority, a confidence,
the warning signs checked (each tagged with the check that found it) and a
bilingual rationale. The priority itself is always decided by the transparent
rules in ``urgency`` so an officer can see exactly why; Claude is only asked
to categorize narratives the keyword rules cannot place confidently.
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
    "domesticViolence": (
        "beat", "beating", "assault", "hit me", "hits me", "husband", "in-laws", "abuse",
        "violence", "injur", "slap", "মারধর", "নির্যাতন", "স্বামী", "শ্বশুর", "আঘাত", "মারে",
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
    "monitors her phone", "monitors my phone", "checks her phone", "checks my phone",
    "takes my phone", "takes her phone", "ফোন দেখে", "ফোন নিয়ে", "ফোন চেক",
)  # fmt: skip

LABELS: dict[str, tuple[str, str]] = {
    "activeViolence": ("active violence", "চলমান সহিংসতা"),
    "weaponThreat": ("threat with a weapon or to kill", "অস্ত্র বা হত্যার হুমকি"),
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


def _matches(text: str, term: str) -> bool:
    if term.isascii():
        return re.search(r"(?<![a-z])" + re.escape(term), text) is not None
    return term in text


def _first_match(text: str, terms: tuple[str, ...]) -> str | None:
    return next((t.strip() for t in terms if _matches(text, t)), None)


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

        return {
            "factors": factors,
            "compliance_notes": notes,
            "recommended_safety_level": recommended_level,
        }

    def urgency(state: TriageState) -> TriageState:
        factors = state["factors"]
        detected = {f["key"] for f in factors if f["detected"]}
        score = sum(WEIGHT_POINTS[f["weight"]] for f in factors if f["detected"])

        if "weaponThreat" in detected:
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

    graph = StateGraph(TriageState)
    graph.add_node("categorize", categorize)
    graph.add_node("compliance", compliance)
    graph.add_node("urgency", urgency)
    graph.add_edge(START, "categorize")
    graph.add_edge("categorize", "compliance")
    graph.add_edge("compliance", "urgency")
    graph.add_edge("urgency", END)
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
    }
