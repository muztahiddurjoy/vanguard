"""The query helpline: an AI that answers callers' questions about legal aid.

This is the number printed in every SMS. Callers are applicants following
their case, people who were told by SMS that a case has been filed against
them, and anyone asking how legal aid works. A caller on the application
hotline who asks about a case they filed is handed here and asked for its
tracking number straight away. One turn = one utterance in, one reply out,
spoken back over the phone.

Answers come from a fixed set of facts about the office (``FACTS``) and, when
the caller says their tracking number, from the case's current stage (see
``services.case_status``): never from the case file, because anyone may say a
number. Known questions are answered by rules; Claude, if configured, answers
the rest from the same facts, and a rule-based fallback covers any failure.
The helpline never decides anything about a case and never gives an opinion on
its merits.
"""

import re
from collections.abc import Callable
from datetime import datetime
from typing import Any, Literal, cast

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from pydantic import BaseModel, Field

from app.agents.llm import StructuredLLM, default_llm
from app.agents.spoken import BN_DIGITS, DISTRICTS, EN_TO_BN_DIGITS, has_any, is_dont_know
from app.agents.state import HelplineState
from app.agents.t5_intake import DANGER_TERMS
from app.agents.t8_triage import find_hostage_sign
from app.config import get_settings

Lang = Literal["bn", "en"]
Intent = Literal[
    "track", "notice", "office", "documents", "mediation", "fees", "apply", "emergency",
    "goodbye", "unknown",
]  # fmt: skip
Lookup = Callable[[str], dict[str, Any] | None]

MAX_TURNS = 12
# Tracking numbers not heard or not found before we stop asking for one.
MAX_TOKEN_TRIES = 3

INTENT_TERMS: dict[str, tuple[str, ...]] = {
    # Order matters: the first intent with a matching term wins. Goodbye is last,
    # so "thanks, and where is the office?" is a question, not the end of the call.
    "notice": ("against me", "filed against", "got an sms", "got a message", "received an sms",
               "received a message", "notice", "আমার বিরুদ্ধে", "এসএমএস পেয়েছি", "মেসেজ পেয়েছি",
               "নোটিশ"),
    "apply": ("apply", "file a case", "make a complaint", "new case", "new application",
              "new complaint", "আবেদন করতে", "অভিযোগ করতে", "মামলা করতে", "আবেদন করব",
              "নতুন মামলা", "নতুন আবেদন", "নতুন অভিযোগ"),
    # Any other mention of a case or application is most likely about its progress.
    "track": ("status", "progress", "tracking", "case", "application", "update", "happening",
              "অবস্থা", "অগ্রগতি", "ট্র্যাকিং", "মামলা", "আবেদন", "কী হলো", "কি হলো"),
    "documents": ("document", "papers", "what to bring", "what should i bring", "কাগজ",
                  "ডকুমেন্ট", "কী আনতে", "কি আনতে", "কী নিয়ে", "কি নিয়ে"),
    "mediation": ("mediation", "settle", "settlement", "মধ্যস্থতা", "আপস", "সালিশ", "মীমাংসা"),
    "fees": ("free", "cost", "fee", "pay", "money", "eligible", "who can", "বিনামূল্যে",
             "খরচ", "টাকা লাগবে", "টাকা লাগে", "ফি", "কারা পাবে"),
    "office": ("where", "address", "office hours", "open", "when can i come", "কোথায়",
               "ঠিকানা", "খোলা", "কখন আসব", "অফিস"),
    "goodbye": ("thank you", "thanks", "bye", "that's all", "nothing else", "no more",
                "ধন্যবাদ", "আর কিছু না", "আর কিছু নেই", "রাখছি"),
}  # fmt: skip
# Said instead of the tracking number by a caller who has none to give.
NO_TOKEN_TERMS = ("don't have", "do not have", "dont have", "lost", "নেই", "হারিয়ে")


def _t(en: str, bn: str) -> dict[str, str]:
    return {"en": en, "bn": bn}


GREETING = _t(
    "This is the legal aid helpline. You can ask about your case with your tracking number, "
    "about a notice you received, the office, what documents to bring, or mediation. "
    "How can I help?",
    "লিগ্যাল এইড হেল্পলাইনে আপনাকে স্বাগতম। ট্র্যাকিং নম্বর দিয়ে আপনার মামলার অবস্থা, পাওয়া নোটিশ, "
    "অফিস, কী কাগজপত্র আনতে হবে বা মধ্যস্থতা সম্পর্কে জানতে পারেন। কীভাবে সাহায্য করতে পারি?",
)
ANYTHING_ELSE = _t("Is there anything else?", "আর কিছু জানতে চান?")
GOODBYE = _t("Thank you for calling. Goodbye.", "ফোন করার জন্য ধন্যবাদ।")
ASK_TOKEN = _t(
    "Please say your eight-digit tracking number. It is in the SMS you received.",
    "অনুগ্রহ করে আপনার আট অঙ্কের ট্র্যাকিং নম্বরটি বলুন। এটি আপনার পাওয়া এসএমএসে আছে।",
)
TOKEN_UNKNOWN = _t(
    "I could not find a case with that tracking number. Please check the number in your SMS "
    "and say it again, digit by digit.",
    "এই ট্র্যাকিং নম্বরে কোনো মামলা পাওয়া যায়নি। এসএমএসের নম্বরটি দেখে এক এক অঙ্ক করে আবার বলুন।",
)
TOKEN_GIVE_UP = _t(
    "I still cannot find that case. Please check the tracking number in the SMS you received, "
    "or visit the District Legal Aid Office with your NID.",
    "আমি এখনও মামলাটি খুঁজে পাচ্ছি না। অনুগ্রহ করে আপনার পাওয়া এসএমএসে ট্র্যাকিং নম্বরটি মিলিয়ে "
    "দেখুন, অথবা আপনার এনআইডি নিয়ে জেলা লিগ্যাল এইড অফিসে আসুন।",
)
NO_TOKEN = _t(
    "Without the tracking number I cannot find the case. It is in the SMS we sent when you "
    "applied. You can also visit the District Legal Aid Office with your NID.",
    "ট্র্যাকিং নম্বর ছাড়া আমি মামলাটি খুঁজে পাব না। আবেদন করার সময় আমরা যে এসএমএস পাঠিয়েছিলাম, "
    "তাতে নম্বরটি আছে। আপনার এনআইডি নিয়ে জেলা লিগ্যাল এইড অফিসেও আসতে পারেন।",
)
EMERGENCY = _t(
    "If you are in danger right now, call 999 now.",
    "আপনি এখন বিপদে থাকলে এখনই ৯৯৯ নম্বরে ফোন করুন।",
)

STAGES: dict[str, dict[str, str]] = {
    "received": _t(
        "Your application {ref} has been received and is waiting for an officer's review.",
        "আপনার আবেদন {ref} গ্রহণ করা হয়েছে এবং একজন কর্মকর্তার পর্যালোচনার অপেক্ষায় আছে।",
    ),
    "reviewed": _t(
        "An officer has reviewed your application {ref}. The office will contact you about "
        "the next step.",
        "একজন কর্মকর্তা আপনার আবেদন {ref} পর্যালোচনা করেছেন। পরবর্তী ধাপ সম্পর্কে অফিস যোগাযোগ করবে।",
    ),
    "accepted": _t(
        "Your case {ref} has been accepted for legal aid. A panel lawyer will be assigned.",
        "আপনার মামলা {ref} আইনি সহায়তার জন্য গৃহীত হয়েছে। একজন প্যানেল আইনজীবী নিয়োগ দেওয়া হবে।",
    ),
    "lawyerAssigned": _t(
        "Your case {ref} is active and a panel lawyer is working on it.",
        "আপনার মামলা {ref} চলমান এবং একজন প্যানেল আইনজীবী এতে কাজ করছেন।",
    ),
    "referred": _t(
        "Your case {ref} has been sent to the District Legal Aid Office, {office}, "
        "which will contact you.",
        "আপনার মামলা {ref} জেলা লিগ্যাল এইড অফিস, {office_bn}-এ পাঠানো হয়েছে; সেখান থেকে যোগাযোগ করা হবে।",
    ),
    "mediation": _t("Your case {ref} is in mediation.", "আপনার মামলা {ref} মধ্যস্থতার পর্যায়ে আছে।"),
    "closed": _t("Your case {ref} is closed.", "আপনার মামলা {ref} নিষ্পত্তি হয়েছে।"),
}
NEXT_MEDIATION = _t("The next mediation session is on {date}.", "পরবর্তী মধ্যস্থতা সভা {date} তারিখে।")
NEXT_HEARING = _t("The next court hearing is on {date}.", "আদালতে পরবর্তী শুনানি {date} তারিখে।")
TRACK_DECIDED = {
    "advice": _t(
        "The officer expects it can be resolved through advice.",
        "কর্মকর্তা মনে করছেন পরামর্শের মাধ্যমে এটি সমাধান করা যাবে।",
    ),
    "mediation": _t(
        "The officer expects it can be resolved through mediation.",
        "কর্মকর্তা মনে করছেন মধ্যস্থতার মাধ্যমে এটি সমাধান করা যাবে।",
    ),
}


def facts(lang: Lang) -> dict[str, str]:
    """What the helpline knows about the office, in the caller's language."""
    s = get_settings()
    district = s.office_district if lang == "en" else DISTRICTS.get(s.office_district, "")
    helpline = s.helpline_number if lang == "en" else s.helpline_number.translate(EN_TO_BN_DIGITS)
    if lang == "en":
        return {
            "office": f"The District Legal Aid Office, {district}, is in the District Judge "
            "Court building. It is open Sunday to Thursday, 9 am to 5 pm.",
            "notice": "The SMS asks you to come to the District Legal Aid Office to talk about "
            "a complaint. It is not a court order or an arrest warrant. Please visit with your "
            "NID and the reference number in the SMS. Coming lets you give your side, and many "
            "matters are settled by mediation.",
            "documents": "Bring your NID or birth certificate, any papers about the problem, "
            "such as a land deed, kabinnama, medical certificate or GD copy, and your tracking "
            "number.",
            "mediation": "In mediation, a legal aid officer sits with both sides to help them "
            "agree a settlement. It is free and voluntary: nobody has to agree. Cases involving "
            "violence are not sent to mediation.",
            "fees": "Government legal aid is free for people who cannot afford a lawyer. The "
            "officer checks whether you are eligible when you apply.",
            "apply": "You can apply by phone on the legal aid hotline, at your Union Digital "
            "Centre, or at the District Legal Aid Office.",
            "unknown": f"I can tell you the progress of your case if you have a tracking number, "
            "explain a notice you received, and tell you about the office, documents and "
            f"mediation. For anything else, please visit the office or call {helpline} during "
            "office hours.",
        }
    return {
        "office": f"জেলা লিগ্যাল এইড অফিস, {district}, জেলা জজ আদালত ভবনে অবস্থিত। অফিস রবিবার থেকে "
        "বৃহস্পতিবার, সকাল ৯টা থেকে বিকেল ৫টা পর্যন্ত খোলা।",
        "notice": "এসএমএসে একটি অভিযোগ নিয়ে কথা বলতে আপনাকে জেলা লিগ্যাল এইড অফিসে আসতে বলা হয়েছে। "
        "এটি আদালতের আদেশ বা গ্রেপ্তারি পরোয়ানা নয়। আপনার এনআইডি ও এসএমএসের সূত্র নম্বর নিয়ে আসুন। "
        "এলে আপনি আপনার কথা বলতে পারবেন, আর অনেক বিষয় মধ্যস্থতায় মীমাংসা হয়।",
        "documents": "আপনার এনআইডি বা জন্মনিবন্ধন, সমস্যা সংক্রান্ত কাগজপত্র যেমন জমির দলিল, কাবিননামা, "
        "মেডিকেল সার্টিফিকেট বা জিডির কপি, এবং আপনার ট্র্যাকিং নম্বর নিয়ে আসুন।",
        "mediation": "মধ্যস্থতায় একজন লিগ্যাল এইড কর্মকর্তা দুই পক্ষকে নিয়ে বসে মীমাংসায় পৌঁছাতে সাহায্য "
        "করেন। এটি বিনামূল্যে ও স্বেচ্ছামূলক; কাউকে রাজি হতে বাধ্য করা হয় না। সহিংসতার মামলা "
        "মধ্যস্থতায় পাঠানো হয় না।",
        "fees": "যাঁরা আইনজীবীর খরচ বহন করতে পারেন না, তাঁদের জন্য সরকারি আইনি সহায়তা বিনামূল্যে। "
        "আবেদনের সময় কর্মকর্তা যোগ্যতা যাচাই করেন।",
        "apply": "লিগ্যাল এইড হটলাইনে ফোন করে, আপনার ইউনিয়ন ডিজিটাল সেন্টারে বা জেলা লিগ্যাল এইড "
        "অফিসে গিয়ে আবেদন করতে পারেন।",
        "unknown": "ট্র্যাকিং নম্বর থাকলে আমি আপনার মামলার অগ্রগতি, পাওয়া নোটিশের অর্থ, এবং অফিস, "
        f"কাগজপত্র ও মধ্যস্থতা সম্পর্কে জানাতে পারি। অন্য বিষয়ে অফিস চলাকালীন {helpline} নম্বরে "
        "ফোন করুন বা অফিসে আসুন।",
    }


_TOKEN_RE = re.compile(r"(?<![\d])(?:\d[\s-]?){7}\d(?![\d])")


def find_token(text: str) -> str | None:
    """Eight digits, however they were spoken ("4821 0937", "৪৮২১-০৯৩৭"); not a phone number."""
    m = _TOKEN_RE.search(text.translate(BN_DIGITS))
    return re.sub(r"\D", "", m.group()) if m else None


def has_no_token(text: str) -> bool:
    """ "I don't have it", "নম্বর হারিয়ে গেছে", "I don't know": no tracking number to give."""
    return is_dont_know(text) or has_any(text, NO_TOKEN_TERMS)


def intent_of(text: str) -> Intent:
    if find_hostage_sign(text) or has_any(text, DANGER_TERMS):
        return "emergency"
    if find_token(text):
        return "track"
    return cast(
        Intent, next((i for i, terms in INTENT_TERMS.items() if has_any(text, terms)), "unknown")
    )


BN_MONTHS = (
    "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর",
    "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
)  # fmt: skip


def bn_part_of_day(hour: int) -> str:
    if 5 <= hour < 12:
        return "সকাল"
    if 12 <= hour < 15:
        return "দুপুর"
    if 15 <= hour < 18:
        return "বিকেল"
    return "সন্ধ্যা" if 18 <= hour < 20 else "রাত"


def say_date(iso: str, lang: Lang) -> str:
    """ "4 October 2026, 11:00 am" / "৪ অক্টোবর ২০২৬, সকাল ১১:০০", in office time."""
    at = datetime.fromisoformat(iso).astimezone(get_settings().tz)
    hour12 = at.hour % 12 or 12
    if lang == "en":
        return f"{at.day} {at:%B} {at.year}, {hour12}:{at:%M} {'am' if at.hour < 12 else 'pm'}"
    text = (
        f"{at.day} {BN_MONTHS[at.month - 1]} {at.year}, {bn_part_of_day(at.hour)} {hour12}:{at:%M}"
    )
    return text.translate(EN_TO_BN_DIGITS)


def describe(status: dict[str, Any], lang: Lang) -> str:
    office = status.get("office") or get_settings().office_district
    parts = [
        STAGES[status["stage"]][lang].format(
            ref=status["reference"], office=office, office_bn=DISTRICTS.get(office, office)
        )
    ]
    if status.get("nextMediation"):
        parts.append(NEXT_MEDIATION[lang].format(date=say_date(status["nextMediation"], lang)))
    if status.get("nextHearing"):
        parts.append(NEXT_HEARING[lang].format(date=say_date(status["nextHearing"], lang)))
    if (track := status.get("track")) in TRACK_DECIDED:
        parts.append(TRACK_DECIDED[track][lang])
    return " ".join(parts)


class LLMAnswer(BaseModel):
    answer: str = Field(description="At most three short sentences, in the caller's language")


ANSWER_SYSTEM = (
    "You answer callers on a Bangladeshi government legal aid helpline. Your reply is read "
    "aloud over the phone. Use ONLY the facts provided; if they do not answer the question, "
    "say so and suggest visiting the District Legal Aid Office. Never give an opinion on "
    "anyone's case or on what a court will decide, and never promise an outcome. Answer in "
    "{language}, in at most three short sentences."
)


def build_helpline_graph(
    llm: StructuredLLM | None = None, checkpointer: Any = None
) -> CompiledStateGraph:
    def answer(state: HelplineState, config: RunnableConfig) -> HelplineState:
        lang: Lang = state.get("language", "bn")
        utterance = state.get("utterance", "")
        turns = state.get("turns", 0) + 1
        asked = state.get("awaiting") == "token"
        if not utterance.strip():
            opening = ASK_TOKEN if asked else GREETING
            return {"reply": opening[lang], "turns": turns, "complete": False, "intent": None}

        lookup: Lookup | None = (config.get("configurable") or {}).get("lookup")
        intent = intent_of(utterance)
        # A bare number right after we asked for it is the tracking number.
        if asked and intent in ("unknown", "track"):
            intent = "track"
        text: str
        awaiting = None
        tries = state.get("token_tries", 0)
        match intent:
            case "emergency":
                return {
                    "reply": EMERGENCY[lang],
                    "complete": True,
                    "intent": intent,
                    "turns": turns,
                }
            case "goodbye":
                return {"reply": GOODBYE[lang], "complete": True, "intent": intent, "turns": turns}
            case "track":
                token = find_token(utterance)
                status = lookup(token) if token and lookup else None
                if status is not None:
                    text, tries = describe(status, lang), 0
                elif token is None and not asked:
                    text, awaiting = ASK_TOKEN[lang], "token"
                elif token is None and has_no_token(utterance):
                    # "I don't have it": asking again would not help.
                    text, tries = NO_TOKEN[lang], 0
                # A miss: no number heard when we asked for one, or no case has it. A phone
                # caller who cannot give a number that works is not asked forever.
                elif (tries := tries + 1) < MAX_TOKEN_TRIES:
                    text, awaiting = (TOKEN_UNKNOWN if token else ASK_TOKEN)[lang], "token"
                else:
                    text, tries = TOKEN_GIVE_UP[lang], 0
            case "unknown" if llm is not None:
                result = llm.structured(
                    system=ANSWER_SYSTEM.format(language="Bangla" if lang == "bn" else "English"),
                    content="<facts>\n"
                    + "\n".join(f"- {v}" for v in facts(lang).values())
                    + f"\n</facts>\n<question>\n{utterance}\n</question>",
                    schema=LLMAnswer,
                )
                text = result.answer.strip() if result else facts(lang)["unknown"]
            case _:
                text = facts(lang)[intent]
        done = turns >= MAX_TURNS
        tail = GOODBYE[lang] if done else ("" if awaiting else ANYTHING_ELSE[lang])
        return {
            "reply": " ".join(p for p in (text, tail) if p),
            "complete": done,
            "intent": intent,
            "awaiting": awaiting,
            "token_tries": tries,
            "turns": turns,
        }

    graph = StateGraph(HelplineState)
    graph.add_node("answer", answer)
    graph.add_edge(START, "answer")
    graph.add_edge("answer", END)
    return graph.compile(checkpointer=checkpointer)


class HelplineConversation:
    """Compiled graph plus an in-memory checkpointer (one worker; see T5)."""

    def __init__(self, llm: StructuredLLM | None = None, use_default_llm: bool = True):
        model = llm if llm is not None else (default_llm() if use_default_llm else None)
        self.graph = build_helpline_graph(model, checkpointer=InMemorySaver())

    def _config(self, session_id: str, lookup: Lookup | None = None) -> RunnableConfig:
        return {"configurable": {"thread_id": session_id, "lookup": lookup}}

    def start(
        self, session_id: str, *, language: str = "bn", tracking: bool = False
    ) -> HelplineState:
        # tracking: a hotline caller who chose to hear about their case. Instead of the
        # greeting they are asked for the tracking number, and their next answer fills it.
        lang: Lang = "en" if language == "en" else "bn"
        opening: HelplineState = {
            "language": lang,
            "utterance": "",
            "turns": 0,
            "awaiting": "token" if tracking else None,
            "token_tries": 0,
        }
        state = self.graph.invoke(opening, self._config(session_id))
        return cast(HelplineState, state)

    def turn(self, session_id: str, utterance: str, lookup: Lookup | None = None) -> HelplineState:
        state = self.graph.invoke({"utterance": utterance}, self._config(session_id, lookup))
        return cast(HelplineState, state)

    def state(self, session_id: str) -> HelplineState:
        return cast(HelplineState, self.graph.get_state(self._config(session_id)).values)


_helpline: HelplineConversation | None = None


def helpline() -> HelplineConversation:
    global _helpline
    if _helpline is None:
        _helpline = HelplineConversation()
    return _helpline
