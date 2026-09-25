"""T5 intake: the conversational agent on the legal aid hotline (and at UDCs).

One turn = one utterance in, one reply out. Each turn the graph

1. ``extract``: pulls answers out of the utterance (rules first; Claude, if
   configured, for free-form speech) and keeps a note of what was said;
2. ``check_danger``: listens for immediate danger and for signs that the
   caller is being held;
3. ``resolve``: checks the NID registry once enough is known: the caller's
   identity, the relative they are applying for, and the person the
   complaint is against;
4. ``respond``: asks the next question.

A caller cannot read out a 10- or 17-digit NID on a call, so they give their
name and answer security questions only they should know (father's name,
permanent district and date of birth, as on their NID). They may apply for
themselves or for their father, mother, brother or sister: the relative is
confirmed through the registry's parent links. When the registry cannot
confirm someone, intake carries on and the application is marked unverified;
nobody is turned away.

The questions are short and plain because callers may be frightened, may be
calling for someone else, and may be overheard. Conversation state is kept by
a LangGraph checkpointer keyed by the call or session ID.
"""

import re
from datetime import date
from typing import Any, Literal, cast

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from pydantic import BaseModel, Field

from app.agents.llm import StructuredLLM, default_llm
from app.agents.spoken import (
    clean_name,
    find_district,
    find_phone,
    has_any,
    has_word,
    is_dont_know,
    name_similarity,
    parse_date,
    say_digits,
    words,
    yes_or_no,
)
from app.agents.state import IntakeState
from app.agents.t8_triage import PHONE_MONITORED, categorize_by_rules, find_hostage_sign
from app.database import utcnow
from app.services.adnsms import normalize_bd_mobile
from app.services.nid_registry import Citizen, NidRegistry, default_registry

FilingFor = Literal["self", "father", "mother", "sibling", "other"]

# Asked in this order; a slot is skipped once filled or when not needed (see ``needed``).
SLOTS = (
    "filing_for",
    "caller_name",
    "father_name",
    "permanent_district",
    "date_of_birth",
    "name",
    "district",
    "problem",
    "respondent_name",
    "respondent_father_name",
    "respondent_district",
    "notify_respondent",
    "phone",
    "safe_to_call",
)
IDENTITY_SLOTS = ("father_name", "permanent_district", "date_of_birth")
REQUIRED = {"name", "phone", "district", "problem"}
MAX_TURNS = 24
MAX_VERIFY_ATTEMPTS = 2
# Name similarity (0-100) for accepting a relative found through NID parent links.
FAMILY_MATCH = 85

Lang = Literal["bn", "en"]
Text = dict[str, str]


def _t(en: str, bn: str) -> Text:
    return {"en": en, "bn": bn}


QUESTIONS: dict[str, Text] = {
    "filing_for": _t(
        "Are you applying for yourself, or for your father, mother, brother, sister "
        "or someone else?",
        "আপনি কি নিজের জন্য আবেদন করছেন, নাকি আপনার বাবা, মা, ভাই, বোন বা অন্য কারও জন্য?",
    ),
    "caller_name": _t("What is your name?", "আপনার নাম কী?"),
    "father_name": _t(
        "To confirm who you are: what is your father's name, as written on your NID?",
        "আপনার পরিচয় নিশ্চিত করতে বলুন, এনআইডি অনুযায়ী আপনার বাবার নাম কী?",
    ),
    "permanent_district": _t(
        "Which district is your permanent address in, according to your NID?",
        "এনআইডি অনুযায়ী আপনার স্থায়ী ঠিকানা কোন জেলায়?",
    ),
    "date_of_birth": _t(
        "What is your date of birth according to your NID?",
        "এনআইডি অনুযায়ী আপনার জন্ম তারিখ কত?",
    ),
    "problem": _t("Briefly, what has happened?", "সংক্ষেপে বলুন, কী সমস্যা হয়েছে?"),
    "respondent_name": _t(
        "Who is the complaint against? Tell me their name, or say 'no one'.",
        "অভিযোগটি কার বিরুদ্ধে? তাঁর নাম বলুন, কেউ না থাকলে বলুন 'কেউ না'।",
    ),
    "respondent_father_name": _t(
        "What is their father's name? Say 'don't know' if you are not sure.",
        "তাঁর বাবার নাম কী? না জানলে বলুন 'জানি না'।",
    ),
    "respondent_district": _t("Which district do they live in?", "তিনি কোন জেলায় থাকেন?"),
    "notify_respondent": _t(
        "We can send them an SMS asking them to come to the District Legal Aid Office. "
        "Is it safe for you if we send it now?",
        "আমরা তাঁকে জেলা লিগ্যাল এইড অফিসে আসার জন্য একটি এসএমএস পাঠাতে পারি। এখন পাঠালে কি আপনার জন্য নিরাপদ?",
    ),
}
# Questions worded for the caller themselves ("you") or for the person they call about.
QUESTIONS_SELF: dict[str, Text] = {
    "district": _t(
        "Which district and upazila do you live in now?", "আপনি এখন কোন জেলা ও উপজেলায় থাকেন?"
    ),
    "phone": _t(
        "Which phone number is safe to reach you on?", "কোন নম্বরে আপনার সঙ্গে যোগাযোগ করা নিরাপদ?"
    ),
    "safe_to_call": _t(
        "Which day and time is it safe to call you? Tell us if someone checks your phone.",
        "কোন দিন ও সময়ে ফোন করলে আপনার জন্য নিরাপদ? কেউ আপনার ফোন দেখে থাকলে বলুন।",
    ),
}
QUESTIONS_OTHER: dict[str, Text] = {
    "district": _t("Which district and upazila do they live in?", "তিনি কোন জেলা ও উপজেলায় থাকেন?"),
    "phone": _t(
        "Which phone number is safe to reach them on?", "কোন নম্বরে তাঁর সঙ্গে যোগাযোগ করা নিরাপদ?"
    ),
    "safe_to_call": _t(
        "Which day and time is it safe to call them? Tell us if someone checks their phone.",
        "কোন দিন ও সময়ে ফোন করলে তাঁর জন্য নিরাপদ? কেউ ফোন দেখে থাকলে বলুন।",
    ),
}
NAME_QUESTIONS: dict[str, Text] = {
    "father": _t("What is your father's name?", "আপনার বাবার নাম কী?"),
    "mother": _t("What is your mother's name?", "আপনার মায়ের নাম কী?"),
    "sibling": _t("What is your brother's or sister's name?", "আপনার ভাই বা বোনের নাম কী?"),
    "other": _t(
        "What is the name of the person who needs legal help?",
        "যাঁর আইনি সহায়তা দরকার, তাঁর নাম কী?",
    ),
}
RELATION_WORDS: dict[str, Text] = {
    "father": _t("father", "বাবা"),
    "mother": _t("mother", "মা"),
    "sibling": _t("brother or sister", "ভাই বা বোন"),
}
SIBLING_WORDS: dict[str, Text] = {"male": _t("brother", "ভাই"), "female": _t("sister", "বোন")}

VERIFIED = _t(
    "Thank you, {name}. Your identity is confirmed.", "ধন্যবাদ, {name}। আপনার পরিচয় নিশ্চিত হয়েছে।"
)
RETRY = _t(
    "Sorry, those details do not match the NID record. Let us try once more.",
    "দুঃখিত, তথ্যগুলো এনআইডি রেকর্ডের সঙ্গে মেলেনি। আরেকবার চেষ্টা করি।",
)
NOT_VERIFIED = _t(
    "We could not confirm your identity by phone. We will still record your application; "
    "please bring your NID when you visit the office.",
    "ফোনে আপনার পরিচয় নিশ্চিত করা গেল না। তবু আপনার আবেদন নেওয়া হবে; "
    "অফিসে আসার সময় আপনার এনআইডি সঙ্গে আনবেন।",
)
REGISTRY_DOWN = _t(
    "We cannot check NID records right now, so we will record your application and check it later.",
    "এই মুহূর্তে এনআইডি রেকর্ড যাচাই করা যাচ্ছে না, তাই আবেদন নিয়ে পরে যাচাই করা হবে।",
)
FAMILY_FOUND = _t(
    "We found your {relation}, {name}, in the NID records.",
    "এনআইডি রেকর্ডে আপনার {relation} {name}-কে পাওয়া গেছে।",
)
FAMILY_NOT_FOUND = _t(
    "We could not find your {relation} in the NID records linked to yours. "
    "We will still record the application.",
    "আপনার এনআইডির সঙ্গে যুক্ত রেকর্ডে আপনার {relation}-কে পাওয়া যায়নি। তবু আবেদনটি নেওয়া হবে।",
)

CLOSING = _t(
    "Thank you. Your application is recorded. "
    "The District Legal Aid Office will contact you at a safe time.",
    "ধন্যবাদ। আপনার আবেদন নেওয়া হয়েছে। জেলা লিগ্যাল এইড অফিস নিরাপদ সময়ে যোগাযোগ করবে।",
)
# Someone may be holding the caller: never promise (or make) a call back.
CLOSING_NO_CONTACT = _t(
    "Thank you. Your application is recorded. We will not call this number. "
    "Call this helpline again when it is safe for you.",
    "ধন্যবাদ। আপনার আবেদন নেওয়া হয়েছে। আমরা এই নম্বরে ফোন করব না। নিরাপদ হলে এই হেল্পলাইনে আবার ফোন করুন।",
)
# Promises only what always happens: the application is escalated for an urgent callback.
EMERGENCY = _t(
    "If you are in danger right now, call 999 now. "
    "An officer will call you back as soon as possible.",
    "আপনি এখন বিপদে থাকলে এখনই ৯৯৯ নম্বরে ফোন করুন। একজন কর্মকর্তা যত দ্রুত সম্ভব আপনাকে ফোন করবেন।",
)
HOSTAGE_EMERGENCY = _t(
    "Call 999 now if you can. We will not call this number back. "
    "Your call has been recorded for the legal aid office.",
    "সম্ভব হলে এখনই ৯৯৯ নম্বরে ফোন করুন। আমরা এই নম্বরে ফোন করব না। "
    "আপনার কলটি লিগ্যাল এইড অফিসের জন্য নথিভুক্ত হয়েছে।",
)
# Said once, then intake carries on quietly: if the call is cut, what was said is kept.
HOSTAGE_ACK = _t(
    "If you are being held right now, call 999 as soon as you can. "
    "We will not call this number back.",
    "আপনাকে এখন আটকে রাখা হলে যত দ্রুত সম্ভব ৯৯৯ নম্বরে ফোন করুন। আমরা এই নম্বরে ফোন করব না।",
)

TOKEN_LINE = _t(
    "Your tracking number is {digits}. Please note it down.",
    "আপনার ট্র্যাকিং নম্বর {digits}। নম্বরটি লিখে রাখুন।",
)

DANGER_TERMS = (
    "right now", "he is here", "is beating me", "going to kill", "help me now",
    "এখনই", "এখন মারছে", "মেরে ফেলবে", "বাঁচান",
)  # fmt: skip

FILING_WORDS: dict[str, tuple[str, ...]] = {
    "father": ("father", "dad", "abba", "বাবা", "বাবার", "আব্বা", "আব্বার", "আব্বু", "পিতা", "পিতার"),
    "mother": ("mother", "mom", "mum", "amma", "মা", "মায়ের", "মাকে", "আম্মা", "আম্মার", "আম্মু",
               "মাতা"),
    "sibling": ("brother", "sister", "sibling", "ভাই", "ভাইয়ের", "ভাইকে", "বোন", "বোনের", "বোনকে"),
    "other": ("neighbour", "neighbor", "friend", "someone", "daughter", "son", "wife", "husband",
              "relative", "cousin", "প্রতিবেশী", "বন্ধু", "অন্য", "মেয়ের", "ছেলের", "স্ত্রীর",
              "স্বামীর", "আত্মীয়"),
    "self": ("myself", "me", "self", "yes", "নিজের", "নিজে", "আমার জন্য", "হ্যাঁ", "জি"),
}  # fmt: skip
NO_ONE = (
    "no one", "nobody", "noone", "none", "not anyone", "কেউ না", "কেউ নেই",
    "কারো বিরুদ্ধে না", "কারও বিরুদ্ধে না", "কারো বিরুদ্ধে নয়",
)  # fmt: skip
RESPONDENT_RELATIONS: dict[str, tuple[str, ...]] = {
    "husband": ("husband", "স্বামী"),
    "wife": ("wife", "স্ত্রী"),
    "employer": ("employer", "owner", "boss", "মালিক"),
    "neighbour": ("neighbour", "neighbor", "প্রতিবেশী"),
    "uncle": ("uncle", "চাচা", "মামা"),
    "cousin": ("cousin", "চাচাতো", "মামাতো"),
    "brother": ("brother", "ভাই"),
    "father-in-law": ("father-in-law", "শ্বশুর"),
    "landlord": ("landlord", "বাড়িওয়ালা"),
}
_RESPONDENT_FILLER = {
    "against", "my", "his", "her", "their", "the", "name", "is", "called", "named", "it's",
    "complaint", "factory", "company", "আমার", "তার", "তাঁর", "ওর", "বিরুদ্ধে", "নাম", "অভিযোগ",
    "কারখানার", "কোম্পানির",
}  # fmt: skip


def filing_for_from(utterance: str) -> FilingFor | None:
    if has_any(utterance, ("in-law", "in law")):
        return "other"
    for key in ("father", "mother", "sibling", "other", "self"):
        if has_word(utterance, FILING_WORDS[key]):
            return cast(FilingFor, key)
    return None


def respondent_from(utterance: str) -> tuple[str | None, str | None]:
    """(name, relation) from "against my husband Jalal Uddin" / "আমার স্বামী জালালের বিরুদ্ধে"."""
    relation = next(
        (r for r, terms in RESPONDENT_RELATIONS.items() if has_word(utterance, terms)), None
    )
    relation_terms = {t for terms in RESPONDENT_RELATIONS.values() for t in terms}
    # Drop the genitive before "বিরুদ্ধে": জালালের বিরুদ্ধে -> জালাল.
    text = re.sub(r"(\S+?)(?:য়ের|ের|এর)\s+বিরুদ্ধে", r"\1", utterance)
    kept = [w for w in words(text) if w not in _RESPONDENT_FILLER and w not in relation_terms]
    name = clean_name(" ".join(kept)) if kept else None
    return (name.title() if name and name.isascii() else name), relation


def extract_by_rules(utterance: str, asking: str | None) -> dict[str, Any]:
    """Pull slot values out of one utterance. ``asking`` disambiguates bare answers."""
    found: dict[str, Any] = {}
    about_respondent = (asking or "").startswith("respondent")
    if not about_respondent and asking not in IDENTITY_SLOTS and (phone := find_phone(utterance)):
        found["phone"] = phone
    # A monitored phone changes how we may contact them, whenever it is mentioned.
    if has_any(utterance, PHONE_MONITORED):
        found["phone_monitored"] = True

    unknown = is_dont_know(utterance)
    match asking:
        case "filing_for":
            if filing := filing_for_from(utterance):
                found["filing_for"] = filing
        case "caller_name" | "name":
            if "phone" not in found and (name := clean_name(utterance)):
                found[asking] = name
        case "father_name" | "respondent_father_name":
            if unknown:
                found[asking] = ""
            elif name := clean_name(utterance):
                found[asking] = name
        case "permanent_district" | "respondent_district":
            if district := find_district(utterance):
                found[asking] = district
            elif unknown:
                found[asking] = ""
        case "date_of_birth":
            if born := parse_date(utterance):
                found["date_of_birth"] = born.isoformat()
            elif unknown:
                found["date_of_birth"] = ""
        case "problem":
            if len(utterance.split()) >= 3:
                found["problem"] = utterance.strip()
        case "respondent_name":
            if unknown or has_word(utterance, NO_ONE):
                found["respondent_name"] = ""
            else:
                name, relation = respondent_from(utterance)
                if name:
                    found["respondent_name"] = name
                if relation:
                    found["respondent_relation"] = relation
        case "notify_respondent":
            if (answer := yes_or_no(utterance)) is not None:
                found["notify_respondent"] = answer
        case "safe_to_call":
            found["safe_to_call"] = utterance.strip()
    # Where the applicant lives, when it comes up while we ask about them.
    if asking in (None, "district", "name", "problem", "phone") and (
        district := find_district(utterance)
    ):
        found["district"] = district
    return found


class LLMSlots(BaseModel):
    """Only details actually stated by the caller; everything else null."""

    filing_for: FilingFor | None = Field(
        None, description="Who the application is for, relative to the caller"
    )
    caller_name: str | None = Field(None, description="The caller's own name")
    father_name: str | None = Field(None, description="The caller's father's name")
    permanent_district: str | None = Field(
        None, description="District of the caller's permanent address, in English"
    )
    date_of_birth: str | None = Field(None, description="The caller's date of birth, YYYY-MM-DD")
    name: str | None = Field(
        None, description="Name of the person who needs help, if not the caller"
    )
    phone: str | None = Field(None, description="Bangladeshi mobile number to reach them on")
    district: str | None = Field(None, description="District where they live now, in English")
    upazila: str | None = None
    problem: str | None = Field(None, description="The legal problem, in the caller's words")
    respondent_name: str | None = Field(
        None, description="Name of the person the complaint is against"
    )
    respondent_relation: str | None = Field(None, description="e.g. husband, employer")
    respondent_father_name: str | None = None
    respondent_district: str | None = Field(None, description="In English")
    notify_respondent: bool | None = Field(
        None, description="Caller agreed (true) or refused (false) an SMS to the other side now"
    )
    safe_to_call: str | None = Field(None, description="When it is safe to call back")
    phone_monitored: bool | None = Field(None, description="Someone checks their phone")


EXTRACT_SYSTEM = (
    "You extract intake details from one turn of a Bangladeshi legal aid hotline call "
    "(Bangla, English or mixed, transcribed from speech). The caller may apply for "
    "themselves or for a relative. Return only details the caller actually stated in this "
    "turn; leave the rest null. Never guess names, dates or numbers."
)


def _llm_values(values: dict[str, Any]) -> dict[str, Any]:
    """Keep only model output that passes the same checks as rule-based answers."""
    out: dict[str, Any] = {}
    for key, value in values.items():
        if key in ("permanent_district", "district", "respondent_district"):
            value = find_district(str(value))
        elif key == "phone":
            value = find_phone(str(value))
        elif key == "date_of_birth":
            born = parse_date(str(value))
            value = born.isoformat() if born else None
        if value is not None:
            out[key] = value
    return out


def needed(slot: str, slots: dict[str, Any], state: IntakeState) -> bool:
    """Whether ``slot`` still has to be asked in this conversation."""
    filing = slots.get("filing_for")
    if slot in IDENTITY_SLOTS:
        return state.get("identity") == "pending"
    if slot == "name":
        # For yourself your own name is used; for your father, the security answer.
        if filing == "self":
            return False
        if filing == "father":
            return state.get("identity") != "pending" and not slots.get("father_name")
        return True
    if slot in ("respondent_father_name", "respondent_district"):
        return bool(slots.get("respondent_name"))
    if slot == "notify_respondent":
        return state.get("respondent_status") == "found" and not state.get("hostage")
    return True


def question(slot: str, slots: dict[str, Any], lang: Lang) -> str:
    filing = slots.get("filing_for") or "self"
    if slot == "name":
        return NAME_QUESTIONS[filing if filing in NAME_QUESTIONS else "other"][lang]
    if slot in QUESTIONS_SELF:
        return (QUESTIONS_SELF if filing == "self" else QUESTIONS_OTHER)[slot][lang]
    return QUESTIONS[slot][lang]


def _join(*parts: str | None) -> str:
    return " ".join(p for p in parts if p)


def _citizen(raw: dict[str, Any] | None) -> Citizen | None:
    return Citizen.model_validate(raw) if raw else None


def _name_in(c: Citizen, lang: Lang) -> str:
    return c.name.bn if lang == "bn" else c.name.en


def build_intake_graph(
    llm: StructuredLLM | None = None,
    registry: NidRegistry | None = None,
    checkpointer: Any = None,
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
                for key, value in _llm_values(result.model_dump(exclude_none=True)).items():
                    # Rules win: their answers are validated formats.
                    found.setdefault(key, value)

        verified_already = state.get("identity") != "pending"
        for key, value in found.items():
            if key == "problem" and key in slots:
                continue  # the first account is kept; everything said is in the notes
            if key in IDENTITY_SLOTS and verified_already:
                continue
            slots[key] = value
        if "problem" in slots and "category" not in slots:
            category, confidence = categorize_by_rules(slots["problem"])
            if category:
                slots["category"] = category
                slots["category_confidence"] = confidence

        notes = list(state.get("notes") or [])
        if utterance.strip():
            notes.append(
                {
                    "at": utcnow().isoformat(),
                    "topic": asking or "opening",
                    "text": utterance.strip(),
                }
            )
        return {"slots": slots, "notes": notes, "turns": state.get("turns", 0) + 1}

    def check_danger(state: IntakeState) -> IntakeState:
        utterance = state.get("utterance", "")
        emergency = has_any(utterance, DANGER_TERMS)
        held = find_hostage_sign(utterance) is not None
        update: IntakeState = {
            "emergency": emergency,
            "hostage": bool(state.get("hostage")) or held,
        }
        if held and not state.get("hostage") and not emergency:
            update["ack"] = HOSTAGE_ACK[state.get("language", "bn")]
        return update

    def verify_caller(state: IntakeState, slots: dict[str, Any], lang: Lang) -> IntakeState:
        """Match the caller's name and security answers to exactly one NID record."""
        born = parse_date(slots["date_of_birth"]) if slots["date_of_birth"] else None
        matches: list[Citizen] | None = []
        if registry is not None and slots["father_name"] and slots["permanent_district"] and born:
            matches = registry.match(
                name=slots["caller_name"],
                father_name=slots["father_name"],
                permanent_district=slots["permanent_district"],
                date_of_birth=born,
            )
        if matches is None:
            return {"identity": "unavailable", "ack": REGISTRY_DOWN[lang]}
        if len(matches) == 1:
            caller = matches[0]
            caller_phone = state.get("caller_phone")
            return {
                "identity": "verified",
                "caller_record": caller.model_dump(mode="json"),
                "caller_sim_registered": bool(caller_phone and caller_phone in caller.phones),
                "ack": VERIFIED[lang].format(name=_name_in(caller, lang)),
            }
        attempts = state.get("verify_attempts", 0) + 1
        if attempts < MAX_VERIFY_ATTEMPTS:
            for key in IDENTITY_SLOTS:
                slots.pop(key, None)
            return {"verify_attempts": attempts, "ack": RETRY[lang]}
        return {"identity": "failed", "verify_attempts": attempts, "ack": NOT_VERIFIED[lang]}

    def find_relative(caller: Citizen, filing: str, said: str, lang: Lang) -> IntakeState:
        """Follow the caller's NID parent links to the relative they named."""
        family = registry.family(caller.nid) if registry is not None else None
        relation = RELATION_WORDS[filing][lang]
        if family is None:
            return {"applicant_status": "unavailable"}
        candidates = {"father": [family.father], "mother": [family.mother]}.get(
            filing, family.siblings
        )
        scored = [(name_similarity(said, c.name.en, c.name.bn), c) for c in candidates if c]
        score, best = max(scored, key=lambda sc: sc[0], default=(0.0, None))
        if best is None or score < FAMILY_MATCH:
            return {
                "applicant_status": "not_found",
                "ack": FAMILY_NOT_FOUND[lang].format(relation=relation),
            }
        if filing == "sibling":
            relation = SIBLING_WORDS.get(best.gender, RELATION_WORDS["sibling"])[lang]
        return {
            "applicant_status": "verified",
            "applicant_record": best.model_dump(mode="json"),
            "ack": FAMILY_FOUND[lang].format(relation=relation, name=_name_in(best, lang)),
        }

    def find_respondent(state: IntakeState, slots: dict[str, Any]) -> IntakeState:
        father, district = slots["respondent_father_name"], slots["respondent_district"]
        if registry is None:
            return {"respondent_status": "unavailable"}
        if not (father and district):
            return {"respondent_status": "not_found"}
        matches = registry.match(
            name=slots["respondent_name"], father_name=father, district=district
        )
        if matches is None:
            return {"respondent_status": "unavailable"}
        caller = _citizen(state.get("caller_record"))
        if len(matches) != 1 or (caller and matches[0].nid == caller.nid):
            return {"respondent_status": "not_found"}
        return {
            "respondent_status": "found" if matches[0].phones else "no_phone",
            "respondent_record": matches[0].model_dump(mode="json"),
        }

    def resolve(state: IntakeState) -> IntakeState:
        if state.get("emergency"):
            return {}
        lang = state.get("language", "bn")
        slots = dict(state.get("slots") or {})
        acks = [state.get("ack") or ""]
        update: IntakeState = {}

        def merge(part: IntakeState) -> None:
            if ack := part.pop("ack", None):
                acks.append(ack)
            update.update(part)
            state.update(part)  # later steps in this turn see the result

        if state.get("identity") == "pending" and all(
            k in slots for k in ("caller_name", *IDENTITY_SLOTS)
        ):
            merge(verify_caller(state, slots, lang))

        filing = slots.get("filing_for")
        caller = _citizen(state.get("caller_record"))
        if filing == "self" and "caller_name" in slots:
            slots.setdefault("name", caller.name.en if caller else slots["caller_name"])
        # Only once the security answers are settled: a mismatched answer is asked again.
        if filing == "father" and state.get("identity") != "pending" and slots.get("father_name"):
            slots.setdefault("name", slots["father_name"])

        if state.get("applicant_status") == "pending" and state.get("identity") != "pending":
            if filing == "self":
                merge(
                    {"applicant_status": "verified", "applicant_record": state["caller_record"]}
                    if caller
                    else {"applicant_status": "unverified"}
                )
            elif filing in RELATION_WORDS and "name" in slots:
                merge(
                    find_relative(caller, filing, slots["name"], lang)
                    if caller
                    else {"applicant_status": "unverified"}
                )
            elif filing == "other" and "name" in slots:
                merge({"applicant_status": "unverified"})

        if applicant := _citizen(state.get("applicant_record")):
            slots["name"] = applicant.name.en
            slots.setdefault("district", applicant.present_address.district.en)
            slots.setdefault("upazila", applicant.present_address.upazila.en)
        if filing == "self" and state.get("caller_phone"):
            slots.setdefault("phone", state["caller_phone"])

        if state.get("respondent_status") == "pending" and "respondent_name" in slots:
            if not slots["respondent_name"]:
                merge({"respondent_status": "none"})
            elif "respondent_father_name" in slots and "respondent_district" in slots:
                merge(find_respondent(state, slots))

        return {**update, "slots": slots, "ack": _join(*acks)}

    def respond(state: IntakeState) -> IntakeState:
        lang = state.get("language", "bn")
        ack = state.get("ack") or ""
        if state.get("emergency"):
            text = HOSTAGE_EMERGENCY if state.get("hostage") else EMERGENCY
            return {"reply": text[lang], "complete": True, "asking": None, "ack": ""}
        slots = state.get("slots") or {}
        missing = [s for s in SLOTS if s not in slots and needed(s, slots, state)]
        # After MAX_TURNS we stop asking; an officer fills any gaps on the callback.
        if not missing or state.get("turns", 0) >= MAX_TURNS:
            closing = CLOSING_NO_CONTACT if state.get("hostage") else CLOSING
            return {"reply": _join(ack, closing[lang]), "complete": True, "asking": None, "ack": ""}
        nxt = missing[0]
        reply = _join(ack, question(nxt, slots, lang))
        return {"reply": reply, "complete": False, "asking": nxt, "ack": ""}

    graph = StateGraph(IntakeState)
    graph.add_node("extract", extract)
    graph.add_node("check_danger", check_danger)
    graph.add_node("resolve", resolve)
    graph.add_node("respond", respond)
    graph.add_edge(START, "extract")
    graph.add_edge("extract", "check_danger")
    graph.add_edge("check_danger", "resolve")
    graph.add_edge("resolve", "respond")
    graph.add_edge("respond", END)
    return graph.compile(checkpointer=checkpointer)


class IntakeConversation:
    """Holds the compiled graph and its checkpointer for all live conversations.

    The in-memory checkpointer is per process; with several workers, swap in a
    shared LangGraph checkpointer (Postgres/Redis) so a call can move workers.
    """

    def __init__(
        self,
        llm: StructuredLLM | None = None,
        use_default_llm: bool = True,
        registry: NidRegistry | None = None,
        use_default_registry: bool = True,
    ):
        model = llm if llm is not None else (default_llm() if use_default_llm else None)
        self.registry = (
            registry
            if registry is not None
            else (default_registry() if use_default_registry else None)
        )
        self.graph = build_intake_graph(model, self.registry, checkpointer=InMemorySaver())

    def _config(self, session_id: str) -> RunnableConfig:
        return {"configurable": {"thread_id": session_id}}

    def start(
        self,
        session_id: str,
        *,
        channel: str,
        language: str = "bn",
        caller_phone: str | None = None,
    ) -> IntakeState:
        """Open a conversation and return the first question.

        ``caller_phone`` is the caller ID on phone calls: used as the contact
        number when someone applies for themselves, and checked against the
        SIMs registered to their NID.
        """
        lang: Lang = "en" if language == "en" else "bn"
        try:
            phone = normalize_bd_mobile(caller_phone) if caller_phone else None
        except ValueError:
            phone = None
        state = self.graph.invoke(
            {
                "channel": channel,
                "language": lang,
                "utterance": "",
                "slots": {},
                "notes": [],
                "turns": 0,
                "caller_phone": phone,
                "identity": "pending" if self.registry is not None else "unavailable",
                "verify_attempts": 0,
                "applicant_status": "pending",
                "respondent_status": "pending",
                "hostage": False,
                "ack": "",
            },
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


def with_token(reply: str, token: str | None, lang: str) -> str:
    """The closing line plus the tracking number, read out digit by digit."""
    if not token:
        return reply
    lang_key: Lang = "en" if lang == "en" else "bn"
    digits = f"{say_digits(token[:4], lang_key)}, {say_digits(token[4:], lang_key)}"
    return _join(reply, TOKEN_LINE[lang_key].format(digits=digits))


def missing_required(slots: dict[str, Any]) -> list[str]:
    return [s for s in SLOTS if s in REQUIRED and not slots.get(s)]


def citizen_of(state: IntakeState, key: str) -> Citizen | None:
    """The NID record stored in the conversation under ``key`` (e.g. "applicant_record")."""
    return _citizen(cast(dict[str, Any], state).get(key))


def date_of_birth(slots: dict[str, Any]) -> date | None:
    raw = slots.get("date_of_birth")
    return date.fromisoformat(raw) if raw else None
