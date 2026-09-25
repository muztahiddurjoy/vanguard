"""T7 settlement drafting assistant (Section 21C, Legal Aid Services Act 2000).

Screen -> Draft -> Review. The output is always a *draft* for the DLAO to
edit and approve; it becomes signable (T11) only after officer approval.

- Screen: refuses to draft when violence or threats are on record, unless the
  officer explicitly acknowledges the risk (audited by the router).
- Draft: Claude if configured, otherwise a fixed bilingual template.
- Review: structural checks every draft must pass (each party named, each
  agreed term present, the voluntariness declaration and the statutory
  reference). A Claude draft that fails review is replaced by the template.
"""

from typing import Any, cast

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from pydantic import BaseModel

from app.agents.llm import StructuredLLM, default_llm
from app.agents.state import SettlementState
from app.database import utcnow

BLOCKING_RISKS = {"activeViolence", "weaponThreat"}

STATUTE = {
    "en": "Section 21C of the Legal Aid Services Act, 2000",
    "bn": "আইনগত সহায়তা প্রদান আইন, ২০০০-এর ধারা ২১গ",
}
VOLUNTARY = {"en": "voluntarily", "bn": "স্বেচ্ছায়"}
ROLE_LABEL = {
    "en": {"applicant": "Applicant", "respondent": "Respondent", "proxy": "Representative"},
    "bn": {"applicant": "আবেদনকারী", "respondent": "প্রতিপক্ষ", "proxy": "প্রতিনিধি"},
}


def template_draft(state: SettlementState, office: str) -> str:
    lang = state.get("language", "bn")
    parties = state.get("parties", [])
    terms = state.get("terms", [])
    today = utcnow().date().isoformat()
    roles = ROLE_LABEL[lang]
    party_lines = "\n".join(
        f"{i}. {p['name']} ({roles.get(p['role'], p['role'])})" for i, p in enumerate(parties, 1)
    )
    term_lines = "\n".join(f"{i}. {t}" for i, t in enumerate(terms, 1))
    date_word = "তারিখ" if lang == "bn" else "Date"
    signature_lines = "\n".join(
        f"{p['name']}: ____________________  {date_word}: ________" for p in parties
    )

    if lang == "bn":
        return (
            "আপস-মীমাংসা চুক্তি\n"
            f"({STATUTE['bn']} অনুযায়ী বিকল্প বিরোধ নিষ্পত্তি)\n\n"
            f"মামলা নম্বর: {state['case_ref']}\n"
            f"তারিখ: {today}\n\n"
            f"পক্ষসমূহ:\n{party_lines}\n\n"
            f"জেলা লিগ্যাল এইড অফিসার, {office}-এর মধ্যস্থতায় উভয় পক্ষ {VOLUNTARY['bn']} "
            "নিম্নলিখিত বিষয়ে একমত হয়েছেন:\n\n"
            f"{term_lines}\n\n"
            "ঘোষণা:\n"
            "- প্রত্যেক পক্ষ কোনো চাপ, ভয়ভীতি বা প্রলোভন ছাড়াই স্বেচ্ছায় এই চুক্তি করেছেন।\n"
            "- চুক্তির শর্তগুলো প্রত্যেক পক্ষকে তাঁর বোধগম্য ভাষায় পড়ে শোনানো ও ব্যাখ্যা করা হয়েছে।\n"
            "- আইনে আপসযোগ্য নয় এমন কোনো ফৌজদারি অপরাধ এই চুক্তির মাধ্যমে নিষ্পত্তি করা হয়নি।\n\n"
            f"স্বাক্ষর:\n{signature_lines}\n\n"
            f"মধ্যস্থতাকারী: জেলা লিগ্যাল এইড অফিসার, {office}\n"
        )
    return (
        "SETTLEMENT AGREEMENT\n"
        f"(Alternative dispute resolution under {STATUTE['en']})\n\n"
        f"Case number: {state['case_ref']}\n"
        f"Date: {today}\n\n"
        f"Parties:\n{party_lines}\n\n"
        f"Through mediation by the District Legal Aid Officer, {office}, the parties have "
        f"{VOLUNTARY['en']} agreed as follows:\n\n"
        f"{term_lines}\n\n"
        "Declarations:\n"
        "- Each party has entered into this agreement voluntarily, without force, threat or "
        "inducement.\n"
        "- The terms have been read out and explained to each party in a language they "
        "understand.\n"
        "- This agreement does not settle any criminal offence that the law does not allow to "
        "be compounded.\n\n"
        f"Signatures:\n{signature_lines}\n\n"
        f"Mediated by: District Legal Aid Officer, {office}\n"
    )


def review_draft(draft: str, state: SettlementState) -> list[str]:
    lang = state.get("language", "bn")
    issues = []
    for p in state.get("parties", []):
        if p["name"] not in draft:
            issues.append(f"Party not named in draft: {p['name']}")
    for t in state.get("terms", []):
        if t.strip() and t.strip() not in draft:
            issues.append(f"Agreed term missing or reworded: {t.strip()[:60]}")
    if VOLUNTARY[lang] not in draft:
        issues.append("Voluntariness declaration missing")
    if STATUTE[lang] not in draft:
        issues.append("Statutory reference missing")
    return issues


class LLMDraft(BaseModel):
    draft: str


DRAFT_SYSTEM = (
    "You draft settlement agreements for District Legal Aid Offices in Bangladesh, reached "
    "through mediation under {statute}. Write in {language}. Use plain words a person with "
    "little schooling can follow when it is read aloud. Include, in this order: a title; the "
    "statutory reference exactly as '{statute}'; case number and date; the parties with their "
    "roles; a sentence that the parties agreed {voluntary} through mediation by the District "
    "Legal Aid Officer; every agreed term copied exactly as given, numbered; declarations that "
    "the agreement was made without force, threat or inducement, was explained in a language "
    "each party understands, and does not settle any non-compoundable criminal offence; and a "
    "signature line for each party. Do not add terms that were not given."
)


def build_settlement_graph(llm: StructuredLLM | None, office: str) -> CompiledStateGraph:
    def screen(state: SettlementState) -> SettlementState:
        issues = []
        risks = set(state.get("risk_flags", [])) & BLOCKING_RISKS
        if risks and not state.get("risk_acknowledged"):
            issues.append(
                "Violence or threats on record ("
                + ", ".join(sorted(risks))
                + "): mediation is not suitable until the officer confirms safety."
            )
        if not any(p.get("role") == "applicant" for p in state.get("parties", [])):
            issues.append("No applicant among the parties")
        if not any(p.get("role") == "respondent" for p in state.get("parties", [])):
            issues.append("No respondent among the parties")
        if not [t for t in state.get("terms", []) if t.strip()]:
            issues.append("No agreed terms given")
        return {"issues": issues, "ready_for_review": False}

    def route(state: SettlementState) -> str:
        return "stop" if state.get("issues") else "draft"

    def draft(state: SettlementState) -> SettlementState:
        lang = state.get("language", "bn")
        if llm is not None:
            parties = "\n".join(f"- {p['name']} ({p['role']})" for p in state["parties"])
            terms = "\n".join(f"- {t}" for t in state["terms"])
            result = llm.structured(
                system=DRAFT_SYSTEM.format(
                    statute=STATUTE[lang],
                    language="Bangla" if lang == "bn" else "English",
                    voluntary=VOLUNTARY[lang],
                ),
                content=(
                    f"Case number: {state['case_ref']}\nOffice: {office}\n"
                    f"Date: {utcnow().date().isoformat()}\n"
                    f"<parties>\n{parties}\n</parties>\n<agreed_terms>\n{terms}\n</agreed_terms>"
                ),
                schema=LLMDraft,
                effort="medium",
                max_tokens=8000,
            )
            if result is not None and not review_draft(result.draft, state):
                return {"draft": result.draft, "draft_source": "llm"}
        return {"draft": template_draft(state, office), "draft_source": "template"}

    def review(state: SettlementState) -> SettlementState:
        issues = review_draft(state["draft"], state)
        return {"issues": issues, "ready_for_review": not issues}

    graph = StateGraph(SettlementState)
    graph.add_node("screen", screen)
    graph.add_node("draft", draft)
    graph.add_node("review", review)
    graph.add_edge(START, "screen")
    graph.add_conditional_edges("screen", route, {"draft": "draft", "stop": END})
    graph.add_edge("draft", "review")
    graph.add_edge("review", END)
    return graph.compile()


def run_settlement_draft(
    *,
    case_ref: str,
    parties: list[dict[str, Any]],
    terms: list[str],
    office: str,
    language: str = "bn",
    category: str | None = None,
    risk_flags: list[str] | None = None,
    risk_acknowledged: bool = False,
    llm: StructuredLLM | None = None,
    use_default_llm: bool = True,
) -> SettlementState:
    model = llm if llm is not None else (default_llm() if use_default_llm else None)
    out = build_settlement_graph(model, office).invoke(
        {
            "case_ref": case_ref,
            "parties": parties,
            "terms": [t.strip() for t in terms],
            "language": "en" if language == "en" else "bn",
            "category": category,
            "risk_flags": risk_flags or [],
            "risk_acknowledged": risk_acknowledged,
        }
    )
    return cast(SettlementState, out)
