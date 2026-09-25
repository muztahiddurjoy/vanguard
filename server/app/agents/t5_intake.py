"""T5 intake: conversational slot filling for the 16699 hotline and UDC operators.

One turn = one utterance in, one reply out. The graph extracts whatever it can
from the utterance (rules first; Claude, if configured, for free-form speech),
checks for danger, then asks for the next missing slot. Conversation state is
kept by a LangGraph checkpointer keyed by the call or session ID, so each turn
only sends the new utterance.

The questions are short and plain because callers may be frightened, may be
calling for someone else, and may be overheard.
"""

import re
from typing import Any, cast

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from pydantic import BaseModel, Field

from app.agents.llm import StructuredLLM, default_llm
from app.agents.state import IntakeState
from app.agents.t8_triage import PHONE_MONITORED, categorize_by_rules

# Asked in this order; a slot is skipped once filled.
SLOTS = ("is_proxy", "name", "phone", "district", "problem", "safe_to_call")
REQUIRED = {"name", "phone", "district", "problem"}
MAX_TURNS = 16

QUESTIONS: dict[str, dict[str, str]] = {
    "is_proxy": {
        "bn": "আপনি কি নিজের জন্য ফোন করেছেন, নাকি অন্য কারও হয়ে?",
        "en": "Are you calling for yourself, or for someone else?",
    },
    "name": {
        "bn": "যাঁর আইনি সহায়তা দরকার, তাঁর নাম কী?",
        "en": "What is the name of the person who needs legal help?",
    },
    "phone": {
        "bn": "কোন নম্বরে তাঁর সঙ্গে যোগাযোগ করা নিরাপদ?",
        "en": "Which phone number is safe to reach them on?",
    },
    "district": {
        "bn": "তিনি কোন জেলা ও উপজেলায় থাকেন?",
        "en": "Which district and upazila do they live in?",
    },
    "problem": {
        "bn": "সংক্ষেপে বলুন, কী সমস্যা হয়েছে?",
        "en": "Briefly, what has happened?",
    },
    "safe_to_call": {
        "bn": "কোন দিন ও সময়ে ফোন করলে তাঁর জন্য নিরাপদ? কেউ ফোন দেখে থাকলে বলুন।",
        "en": "Which day and time is it safe to call them? Tell us if someone checks their phone.",
    },
}

CLOSING = {
    "bn": "ধন্যবাদ। আপনার আবেদন নেওয়া হয়েছে। জেলা লিগ্যাল এইড অফিস নিরাপদ সময়ে যোগাযোগ করবে।",
    "en": "Thank you. Your application is recorded. "
    "The District Legal Aid Office will contact you at a safe time.",
}
# Promises only what always happens: the application is escalated for an urgent callback.
EMERGENCY = {
    "bn": "আপনি এখন বিপদে থাকলে এখনই ৯৯৯ নম্বরে ফোন করুন। একজন কর্মকর্তা যত দ্রুত সম্ভব আপনাকে ফোন করবেন।",
    "en": "If you are in danger right now, call 999 now. "
    "An officer will call you back as soon as possible.",
}

DANGER_TERMS = (
    "right now", "he is here", "is beating me", "going to kill", "help me now",
    "এখনই", "এখন মারছে", "মেরে ফেলবে", "বাঁচান",
)  # fmt: skip

DISTRICTS = {
    # The 64 districts, English name -> Bangla name.
    "Bagerhat": "বাগেরহাট", "Bandarban": "বান্দরবান", "Barguna": "বরগুনা",
    "Barishal": "বরিশাল", "Bhola": "ভোলা", "Bogura": "বগুড়া",
    "Brahmanbaria": "ব্রাহ্মণবাড়িয়া", "Chandpur": "চাঁদপুর", "Chapai Nawabganj": "চাঁপাইনবাবগঞ্জ",
    "Chattogram": "চট্টগ্রাম", "Chuadanga": "চুয়াডাঙ্গা", "Cox's Bazar": "কক্সবাজার",
    "Cumilla": "কুমিল্লা", "Dhaka": "ঢাকা", "Dinajpur": "দিনাজপুর", "Faridpur": "ফরিদপুর",
    "Feni": "ফেনী", "Gaibandha": "গাইবান্ধা", "Gazipur": "গাজীপুর", "Gopalganj": "গোপালগঞ্জ",
    "Habiganj": "হবিগঞ্জ", "Jamalpur": "জামালপুর", "Jashore": "যশোর", "Jhalokathi": "ঝালকাঠি",
    "Jhenaidah": "ঝিনাইদহ", "Joypurhat": "জয়পুরহাট", "Khagrachhari": "খাগড়াছড়ি",
    "Khulna": "খুলনা", "Kishoreganj": "কিশোরগঞ্জ", "Kurigram": "কুড়িগ্রাম",
    "Kushtia": "কুষ্টিয়া", "Lakshmipur": "লক্ষ্মীপুর", "Lalmonirhat": "লালমনিরহাট",
    "Madaripur": "মাদারীপুর", "Magura": "মাগুরা", "Manikganj": "মানিকগঞ্জ",
    "Meherpur": "মেহেরপুর", "Moulvibazar": "মৌলভীবাজার", "Munshiganj": "মুন্সীগঞ্জ",
    "Mymensingh": "ময়মনসিংহ", "Naogaon": "নওগাঁ", "Narail": "নড়াইল",
    "Narayanganj": "নারায়ণগঞ্জ", "Narsingdi": "নরসিংদী", "Natore": "নাটোর",
    "Netrokona": "নেত্রকোণা", "Nilphamari": "নীলফামারী", "Noakhali": "নোয়াখালী",
    "Pabna": "পাবনা", "Panchagarh": "পঞ্চগড়", "Patuakhali": "পটুয়াখালী",
    "Pirojpur": "পিরোজপুর", "Rajbari": "রাজবাড়ী", "Rajshahi": "রাজশাহী",
    "Rangamati": "রাঙ্গামাটি", "Rangpur": "রংপুর", "Satkhira": "সাতক্ষীরা",
    "Shariatpur": "শরীয়তপুর", "Sherpur": "শেরপুর", "Sirajganj": "সিরাজগঞ্জ",
    "Sunamganj": "সুনামগঞ্জ", "Sylhet": "সিলেট", "Tangail": "টাঙ্গাইল", "Thakurgaon": "ঠাকুরগাঁও",
}  # fmt: skip

YES = ("yes", "yeah", "myself", "for me", "হ্যাঁ", "জি", "নিজের", "আমার জন্য")
FOR_OTHER = (
    "someone else", "for my", "for her", "for him", "neighbour", "neighbor", "sister",
    "অন্য", "প্রতিবেশী", "বোন", "মেয়ের", "তার হয়ে", "তাঁর হয়ে",
)  # fmt: skip
PHONE_RE = re.compile(r"(?:\+?88)?0?1[3-9](?:[\s-]?\d){8}")

# Bangla digits -> ASCII so phone numbers spoken/typed in Bangla are found.
_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def find_phone(text: str) -> str | None:
    m = PHONE_RE.search(text.translate(_BN_DIGITS))
    if not m:
        return None
    digits = re.sub(r"\D", "", m.group())
    return "0" + digits[-10:]


def find_district(text: str) -> str | None:
    lowered = text.casefold()
    for en, bn in DISTRICTS.items():
        if en.casefold() in lowered or bn in text:
            return en
    return None


def _has_any(text: str, terms: tuple[str, ...]) -> bool:
    lowered = text.casefold()
    return any(t in lowered for t in terms)


def extract_by_rules(utterance: str, asking: str | None) -> dict[str, Any]:
    """Pull slot values out of one utterance. ``asking`` disambiguates bare answers."""
    found: dict[str, Any] = {}
    if phone := find_phone(utterance):
        found["phone"] = phone
    if district := find_district(utterance):
        found["district"] = district
    # A monitored phone changes how we may contact them, whenever it is mentioned.
    if _has_any(utterance, PHONE_MONITORED):
        found["phone_monitored"] = True
    if asking == "is_proxy":
        if _has_any(utterance, FOR_OTHER):
            found["is_proxy"] = True
        elif _has_any(utterance, YES):
            found["is_proxy"] = False
    elif _has_any(utterance, FOR_OTHER) and "is_proxy" not in found:
        found["is_proxy"] = True
    if asking == "name" and "phone" not in found:
        name = re.sub(r"^(my name is|her name is|his name is|name is|নাম)\s*", "", utterance.strip(),
                      flags=re.I)  # fmt: skip
        if 1 <= len(name.split()) <= 5:
            found["name"] = name.strip(" .।")
    if asking == "problem" and len(utterance.split()) >= 3:
        found["problem"] = utterance.strip()
    if asking == "safe_to_call":
        found["safe_to_call"] = utterance.strip()
    return found


class LLMSlots(BaseModel):
    """Only fields actually stated by the caller; everything else null."""

    is_proxy: bool | None = Field(None, description="True if calling for someone else")
    name: str | None = Field(None, description="Name of the person who needs help")
    phone: str | None = Field(None, description="Bangladeshi mobile number")
    district: str | None = Field(None, description="District, in English")
    upazila: str | None = None
    problem: str | None = Field(None, description="The legal problem, in the caller's words")
    safe_to_call: str | None = Field(None, description="When it is safe to call back")
    phone_monitored: bool | None = Field(None, description="Someone checks their phone")


EXTRACT_SYSTEM = (
    "You extract intake details from one turn of a Bangladeshi legal aid hotline call "
    "(Bangla, English or mixed, transcribed from speech). Return only details the caller "
    "actually stated in this turn; leave the rest null. Never guess names or numbers."
)


def build_intake_graph(
    llm: StructuredLLM | None = None, checkpointer: Any = None
) -> CompiledStateGraph:
    def extract(state: IntakeState) -> IntakeState:
        utterance = state.get("utterance", "")
        slots = dict(state.get("slots") or {})
        asking = state.get("asking")
        found = extract_by_rules(utterance, asking)

        if llm is not None and utterance.strip():
            context = f"We had just asked about: {asking}." if asking else ""
            result = llm.structured(
                system=EXTRACT_SYSTEM,
                content=f"{context}\n<utterance>\n{utterance}\n</utterance>",
                schema=LLMSlots,
            )
            if result is not None:
                for key, value in result.model_dump(exclude_none=True).items():
                    # Rules win for phone/district: they are validated formats.
                    found.setdefault(key, value)

        if found.get("phone_monitored"):
            slots["phone_monitored"] = True
        for key, value in found.items():
            # The first account of the problem is kept; later turns refine other slots.
            if (key in SLOTS or key == "upazila") and not (key == "problem" and key in slots):
                slots[key] = value
        if "problem" in slots and "category" not in slots:
            category, confidence = categorize_by_rules(slots["problem"])
            if category:
                slots["category"] = category
                slots["category_confidence"] = confidence
        return {"slots": slots, "turns": state.get("turns", 0) + 1}

    def check_danger(state: IntakeState) -> IntakeState:
        return {"emergency": _has_any(state.get("utterance", ""), DANGER_TERMS)}

    def respond(state: IntakeState) -> IntakeState:
        lang = state.get("language", "bn")
        if state.get("emergency"):
            return {"reply": EMERGENCY[lang], "complete": True, "asking": None}
        slots = state.get("slots") or {}
        missing = [s for s in SLOTS if s not in slots]
        # After MAX_TURNS we stop asking; an officer calls back to fill any gaps.
        if not missing or state.get("turns", 0) >= MAX_TURNS:
            return {"reply": CLOSING[lang], "complete": True, "asking": None}
        nxt = missing[0]
        return {"reply": QUESTIONS[nxt][lang], "complete": False, "asking": nxt}

    graph = StateGraph(IntakeState)
    graph.add_node("extract", extract)
    graph.add_node("check_danger", check_danger)
    graph.add_node("respond", respond)
    graph.add_edge(START, "extract")
    graph.add_edge("extract", "check_danger")
    graph.add_edge("check_danger", "respond")
    graph.add_edge("respond", END)
    return graph.compile(checkpointer=checkpointer)


class IntakeConversation:
    """Holds the compiled graph and its checkpointer for all live conversations.

    The in-memory checkpointer is per process; with several workers, swap in a
    shared LangGraph checkpointer (Postgres/Redis) so a call can move workers.
    """

    def __init__(self, llm: StructuredLLM | None = None, use_default_llm: bool = True):
        model = llm if llm is not None else (default_llm() if use_default_llm else None)
        self.graph = build_intake_graph(model, checkpointer=InMemorySaver())

    def _config(self, session_id: str) -> RunnableConfig:
        return {"configurable": {"thread_id": session_id}}

    def start(self, session_id: str, *, channel: str, language: str = "bn") -> IntakeState:
        """Open a conversation and return the greeting question."""
        lang = "en" if language == "en" else "bn"
        state = self.graph.invoke(
            {"channel": channel, "language": lang, "utterance": "", "slots": {}, "turns": 0},
            self._config(session_id),
        )
        return cast(IntakeState, state)

    def turn(self, session_id: str, utterance: str) -> IntakeState:
        return cast(
            IntakeState, self.graph.invoke({"utterance": utterance}, self._config(session_id))
        )

    def state(self, session_id: str) -> IntakeState:
        return cast(IntakeState, self.graph.get_state(self._config(session_id)).values)


_conversations: IntakeConversation | None = None


def conversations() -> IntakeConversation:
    global _conversations
    if _conversations is None:
        _conversations = IntakeConversation()
    return _conversations


def missing_required(slots: dict[str, Any]) -> list[str]:
    return [s for s in SLOTS if s in REQUIRED and s not in slots]


DAY_NAMES = {
    # JS Date#getDay numbering (0 = Sunday), matching SafeWindow.
    0: ("sunday", "রবিবার", "রোববার"),
    1: ("monday", "সোমবার"),
    2: ("tuesday", "মঙ্গলবার"),
    3: ("wednesday", "বুধবার"),
    4: ("thursday", "বৃহস্পতিবার"),
    5: ("friday", "শুক্রবার"),
    6: ("saturday", "শনিবার"),
}
AFTERNOON = ("pm", "p.m", "afternoon", "evening", "দুপুর", "বিকাল", "বিকেল", "সন্ধ্যা")


def parse_safe_window(text: str) -> dict[str, int] | None:
    """Best-effort parse of "Tuesday 2 to 4 pm" / "মঙ্গলবার দুপুর ২টা থেকে ৪টা".

    Returns None unless a day and a sensible hour range are both clear; the
    officer then sets the window by hand. Guessing wrong here could put a call
    through while the abuser is home.
    """
    lowered = text.casefold().translate(_BN_DIGITS)
    days = [d for d, names in DAY_NAMES.items() if any(n in lowered for n in names)]
    hours = [int(h) for h in re.findall(r"(?<!\d)(\d{1,2})(?!\d)", lowered)]
    if len(days) != 1 or len(hours) < 2:
        return None
    start, end = hours[0], hours[1]
    if any(t in lowered for t in AFTERNOON):
        start, end = (h + 12 if h < 12 else h for h in (start, end))
    if not (0 <= start < end <= 24):
        return None
    return {"day": days[0], "start_hour": start, "end_hour": end}
