"""T5 intake: the conversational agent on the legal aid hotline (and at UDCs).

The call opens with a short greeting and then listens: nothing is asked until
the caller has said what happened, because a frightened caller, or one in
danger, needs to be heard before any form is filled in. One turn = one
utterance in, one reply out. Each turn the graph

1. ``extract``: pulls answers out of the utterance (rules first; the model,
   if configured, for free-form speech) and keeps a note of what was said;
2. ``check_danger``: listens for immediate danger and for signs that the
   caller is being held;
3. ``listen``: while the caller is saying what happened, decides whether it
   sounds like a case yet; until it does, it only encourages them to go on;
4. ``resolve``: checks the NID registry once enough is known: the caller's
   identity, the relative they are applying for, and the person the
   complaint is against;
5. ``respond``: asks the next question, skipping anything already said.

A caller cannot read out a 10- or 17-digit NID on a call, so they give their
name and answer security questions only they should know (father's name,
permanent district and date of birth, as on their NID). When they cannot
answer, or their answers match no one twice, the registry is searched
instead: the SIM they are calling from is registered to an NID, and if the
name they gave is that person's, or a family member's on their NID record
(a wife calling on her husband's phone), they are confirmed. They may apply
for themselves or for their father, mother, brother or sister: the relative
is confirmed through the registry's parent links. When the registry cannot
confirm someone, intake carries on and the application is marked
unverified; nobody is turned away.

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
    normalize_name,
    parse_date,
    say_digits,
    words,
    yes_or_no,
)
from app.agents.state import IntakeState, OpeningKind
from app.agents.t8_triage import (
    PHONE_MONITORED,
    categorize_by_rules,
    find_hostage_sign,
    has_risk_sign,
)
from app.config import get_settings
from app.database import utcnow
from app.services.adnsms import normalize_bd_mobile
from app.services.nid_registry import Citizen, NidRegistry, default_registry

FilingFor = Literal["self", "father", "mother", "sibling", "other"]

# Asked in this order; a slot is skipped once filled or when not needed (see ``needed``).
# "problem" is not a question: it is what the caller says after the greeting.
SLOTS = (
    "problem",
    "filing_for",
    "caller_name",
    "father_name",
    "permanent_district",
    "date_of_birth",
    "name",
    "district",
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
# Turns spent listening for what happened before we either take it as it is or give up.
MAX_LISTENS = 3
# An account this long (not counting "hello"s) is taken as a case even with no keywords.
STORY_WORDS = 6
MAX_VERIFY_ATTEMPTS = 2
# A question not understood this many times is not asked again: it is recorded as
# not known (or as below), and an officer follows up.
MAX_ASKS = 2
GIVEN_UP: dict[str, Any] = {"filing_for": "self", "notify_respondent": False}
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

GREETING = _t(
    "Legal aid. I'm listening, tell me what happened.", "লিগ্যাল এইড। আমি শুনছি, বলুন কী হয়েছে।"
)
# The caller has not said what happened yet ("hello?", a fragment).
KEEP_LISTENING = _t("I'm listening. Tell me, what happened?", "আমি শুনছি। বলুন, কী হয়েছে?")
HEARD = _t(
    "Thank you for telling me. I will ask a few short questions.",
    "বুঝেছি, ধন্যবাদ। কয়েকটি ছোট প্রশ্ন করব।",
)
# The model heard something that is not a legal problem (a wrong number, a question
# about an application already made): say what the line is for, and keep listening.
NOT_LEGAL = _t(
    "This line takes applications for legal aid, for problems like family, land, work or "
    "violence. To ask about an application you made, call {helpline}. "
    "If you need legal help, tell me what happened.",
    "এই লাইনে আইনি সহায়তার আবেদন নেওয়া হয়, যেমন পরিবার, জমি, কাজ বা নির্যাতনের সমস্যায়। "
    "আগের আবেদনের খোঁজ নিতে {helpline} নম্বরে ফোন করুন। আইনি সহায়তা দরকার হলে বলুন, কী হয়েছে।",
)
CLOSING_NOT_LEGAL = _t(
    "Thank you for calling. If you need legal help, call this number again. "
    "To ask about an application you made, call {helpline}.",
    "ফোন করার জন্য ধন্যবাদ। আইনি সহায়তা দরকার হলে এই নম্বরে আবার ফোন করুন। "
    "আগের আবেদনের খোঁজ নিতে {helpline} নম্বরে ফোন করুন।",
)
CLOSING_UNHEARD = _t(
    "Sorry, I could not understand what happened. Please call again. "
    "If you are in danger, call 999.",
    "দুঃখিত, কী হয়েছে বুঝতে পারিনি। আবার ফোন করুন। বিপদে থাকলে ৯৯৯ নম্বরে ফোন করুন।",
)

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

# What people say on a line before they say anything: none of it is an account.
FILLER_WORDS = {
    "hello", "hallo", "helo", "hi", "yes", "yeah", "ok", "okay", "hmm", "um", "uh", "ah",
    "sir", "madam", "can", "you", "hear", "me", "is", "anyone", "there",
    "হ্যালো", "হ্যাঁ", "হ্যা", "জি", "জ্বি", "আচ্ছা", "শুনছেন", "শুনতে", "পাচ্ছেন", "পারছেন",
    "স্যার", "ম্যাডাম", "আপা", "ভাই", "আসসালামু", "আলাইকুম", "সালাম", "নমস্কার", "কেউ", "আছেন",
}  # fmt: skip

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


def substance(text: str) -> int:
    """How many words of ``text`` say something ("hello, can you hear me?" says nothing)."""
    return sum(1 for w in words(text) if w not in FILLER_WORDS)


def names_a_problem(text: str) -> bool:
    """A problem legal aid knows (land, wages, dowry, ...) or a warning sign."""
    return (
        categorize_by_rules(text)[0] is not None
        or has_risk_sign(text)
        or has_any(text, DANGER_TERMS)
    )


def sounds_like_case(text: str) -> bool:
    """Whether the caller has said what happened, by rules alone.

    Either a known problem or warning sign, or simply an account of some
    length. "I need help" or "my husband" is not yet: the caller is encouraged
    to go on rather than questioned.
    """
    return substance(text) >= STORY_WORDS or names_a_problem(text)


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
    if asking in (None, "district", "name", "phone") and (district := find_district(utterance)):
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
    danger_now: bool | None = Field(
        None,
        description="True only if someone is in danger right now or about to be hurt "
        "(being beaten now, the abuser is there now, threatened with death now); "
        "not for harm that happened before",
    )


class LLMOpening(LLMSlots):
    """The caller's account before any question: the details, and what kind of call it is."""

    kind: OpeningKind = Field(
        description="'case': a problem a legal aid office may help with (family, marriage, "
        "dowry, violence, land, property, work or wages, money, harassment, custody, a court "
        "or police matter), however vaguely told; 'other': clearly not a legal problem, a "
        "wrong number, or a question about an application already made; 'unclear': they "
        "have not yet said what happened (greetings, 'can you hear me', a fragment)"
    )


EXTRACT_SYSTEM = (
    "You extract intake details from one turn of a Bangladeshi legal aid hotline call "
    "(Bangla, English or mixed, transcribed from speech). The caller may apply for "
    "themselves or for a relative. Return only details the caller actually stated in this "
    "turn; leave the rest null. Never guess names, dates or numbers."
)
OPENING_SYSTEM = (
    f"{EXTRACT_SYSTEM} This is the caller's own account, given before any question. "
    "Also say what kind of call it is (when in doubt it is a case: nobody who may need "
    "help is turned away) and whether anyone is in danger right now."
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


def _categorized(slots: dict[str, Any]) -> None:
    if slots.get("problem") and "category" not in slots:
        category, confidence = categorize_by_rules(slots["problem"])
        if category:
            slots["category"] = category
            slots["category_confidence"] = confidence


def _citizen(raw: dict[str, Any] | None) -> Citizen | None:
    return Citizen.model_validate(raw) if raw else None


def _name_in(c: Citizen, lang: Lang) -> str:
    return c.name.bn if lang == "bn" else c.name.en


def _named(said: str, c: Citizen) -> bool:
    """Whether ``said`` names this relative: closely, or by part of their name ("Jalal").

    Only for the handful of people on one NID record, never a registry-wide search.
    """
    if name_similarity(said, c.name.en, c.name.bn) >= FAMILY_MATCH:
        return True
    given = set(normalize_name(said).split())
    return bool(given) and any(
        given <= set(normalize_name(n).split()) for n in (c.name.en, c.name.bn)
    )


def build_intake_graph(
    llm: StructuredLLM | None = None,
    registry: NidRegistry | None = None,
    checkpointer: Any = None,
) -> CompiledStateGraph:
    def extract(state: IntakeState) -> IntakeState:
        utterance = state.get("utterance", "")
        slots = dict(state.get("slots") or {})
        asking = state.get("asking")
        # While we listen, everything said so far is read together as one account,
        # and never as the answer to a question. A "hello" adds nothing to it.
        listening = asking == "problem"
        story = state.get("story", "")
        new_words = substance(utterance) > 0 if listening else bool(utterance.strip())
        if listening and new_words:
            story = _join(story, utterance.strip())
        found = extract_by_rules(story, None) if listening else extract_by_rules(utterance, asking)

        # The model's reading of this turn, when there is one.
        danger_now, kind = False, None
        if llm is not None and new_words:
            if listening:
                context = "The caller is saying what happened, in their own words."
            else:
                context = f"We had just asked about: {asking}." if asking else ""
            said = story if listening else utterance
            result = llm.structured(
                system=OPENING_SYSTEM if listening else EXTRACT_SYSTEM,
                content=f"{context}\n<utterance>\n{said}\n</utterance>",
                schema=LLMOpening if listening else LLMSlots,
            )
            if result is not None:
                values = result.model_dump(exclude_none=True)
                danger_now = bool(values.pop("danger_now", False))
                kind = values.pop("kind", None) if listening else None
                for key, value in _llm_values(values).items():
                    if listening and key == "problem":
                        continue  # the caller's own words are kept, not a summary
                    # Rules win: their answers are validated formats.
                    found.setdefault(key, value)

        verified_already = state.get("identity") != "pending"
        for key, value in found.items():
            if key == "problem" and key in slots:
                continue  # the first account is kept; everything said is in the notes
            if key in IDENTITY_SLOTS and verified_already:
                continue
            slots[key] = value
        _categorized(slots)

        notes = list(state.get("notes") or [])
        if utterance.strip():
            notes.append(
                {
                    "at": utcnow().isoformat(),
                    "topic": asking or "opening",
                    "text": utterance.strip(),
                }
            )
        return {
            "slots": slots,
            "notes": notes,
            "turns": state.get("turns", 0) + 1,
            "story": story,
            "danger_now": danger_now,
            "opening_kind": kind,
        }

    def check_danger(state: IntakeState) -> IntakeState:
        utterance = state.get("utterance", "")
        emergency = has_any(utterance, DANGER_TERMS) or bool(state.get("danger_now"))
        held = find_hostage_sign(utterance) is not None
        update: IntakeState = {
            "emergency": emergency,
            "hostage": bool(state.get("hostage")) or held,
        }
        if held and not state.get("hostage") and not emergency:
            update["ack"] = HOSTAGE_ACK[state.get("language", "bn")]
        return update

    def listen(state: IntakeState) -> IntakeState:
        """Hear the caller out: ask nothing until what they said sounds like a case."""
        utterance = state.get("utterance", "")
        if state.get("asking") != "problem" or state.get("emergency") or not utterance.strip():
            return {}
        lang = state.get("language", "bn")
        story = state.get("story", "")
        asks = dict(state.get("asks") or {})
        asks["problem"] = heard = asks.get("problem", 0) + 1
        # The model decides when it has read the account, but a problem the rules
        # know is never turned away.
        kind = state.get("opening_kind")
        told = sounds_like_case(story) if kind is None else kind == "case" or names_a_problem(story)
        # After a few tries a short account is taken as it is: an officer can follow up.
        if told or (heard >= MAX_LISTENS and kind != "other" and substance(story) >= 3):
            slots = {**(state.get("slots") or {}), "problem": story}
            _categorized(slots)
            return {"slots": slots, "asks": asks, "ack": _join(state.get("ack"), HEARD[lang])}
        helpline = say_digits(get_settings().helpline_number, lang)
        if heard >= MAX_LISTENS:
            closing = CLOSING_NOT_LEGAL if kind == "other" else CLOSING_UNHEARD
            reply = closing[lang].format(helpline=helpline)
            return {"asks": asks, "reply": reply, "complete": True, "asking": None, "ack": ""}
        nudge = NOT_LEGAL if kind == "other" else KEEP_LISTENING
        return {"asks": asks, "ack": nudge[lang].format(helpline=helpline)}

    def confirmed(state: IntakeState, caller: Citizen, via: str, lang: Lang) -> IntakeState:
        phone = state.get("caller_phone")
        return {
            "identity": "verified",
            "identity_via": via,
            "caller_record": caller.model_dump(mode="json"),
            "caller_sim_registered": bool(phone and phone in caller.phones),
            "ack": VERIFIED[lang].format(name=_name_in(caller, lang)),
        }

    def verify_caller(state: IntakeState, slots: dict[str, Any], lang: Lang) -> IntakeState:
        """Match the caller's name and security answers to exactly one NID record.

        A caller who cannot answer, or whose answers match no one twice, is
        looked up through the SIM they are calling from instead.
        """
        assert registry is not None
        # Some answers may still be missing: one the caller could not give is enough.
        born = parse_date(slots.get("date_of_birth") or "")
        answered = slots.get("father_name") and slots.get("permanent_district") and born
        if not (slots["caller_name"] and answered):
            return caller_by_sim(state, slots["caller_name"], lang)
        matches = registry.match(
            name=slots["caller_name"],
            father_name=slots["father_name"],
            permanent_district=slots["permanent_district"],
            date_of_birth=born,
        )
        if matches is None:
            return {"identity": "unavailable", "ack": REGISTRY_DOWN[lang]}
        if len(matches) == 1:
            return confirmed(state, matches[0], "answers", lang)
        attempts = state.get("verify_attempts", 0) + 1
        if attempts < MAX_VERIFY_ATTEMPTS:
            for key in IDENTITY_SLOTS:
                slots.pop(key, None)
            return {"verify_attempts": attempts, "ack": RETRY[lang]}
        return {"verify_attempts": attempts, **caller_by_sim(state, slots["caller_name"], lang)}

    def caller_by_sim(state: IntakeState, name: str, lang: Lang) -> IntakeState:
        """Whether the caller is who their phone is registered to, or in that person's family."""
        assert registry is not None
        phone = state.get("caller_phone")
        not_verified: IntakeState = {"identity": "failed", "ack": NOT_VERIFIED[lang]}
        if not (phone and name):
            return not_verified
        nid = registry.sim_owner(phone)
        owner = registry.citizen(nid) if nid else None
        if nid is None or (nid and owner is None):
            return {"identity": "unavailable", "ack": REGISTRY_DOWN[lang]}
        if owner is None:
            return not_verified  # the SIM is not registered to anyone
        if name_similarity(name, owner.name.en, owner.name.bn) >= FAMILY_MATCH:
            return confirmed(state, owner, "sim", lang)
        family = registry.family(owner.nid)
        if family is None:
            return {"identity": "unavailable", "ack": REGISTRY_DOWN[lang]}
        relatives = [
            family.father,
            family.mother,
            family.spouse,
            *family.siblings,
            *family.children,
        ]
        scored = [(name_similarity(name, c.name.en, c.name.bn), c) for c in relatives if c]
        score, best = max(scored, key=lambda sc: sc[0], default=(0.0, None))
        if best is None or score < FAMILY_MATCH:
            return not_verified
        return confirmed(state, best, "sim_family", lang)

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

    def respondent_found(respondent: Citizen, via: str) -> IntakeState:
        return {
            "respondent_status": "found" if respondent.phones else "no_phone",
            "respondent_via": via,
            "respondent_record": respondent.model_dump(mode="json"),
        }

    def find_respondent(state: IntakeState, slots: dict[str, Any]) -> IntakeState:
        """Match the respondent by name, father's name and district.

        When the caller does not know those, or they match no one, the respondent
        is looked for among the applicant's relatives on their NID record.
        """
        father, district = slots["respondent_father_name"], slots["respondent_district"]
        if registry is None:
            return {"respondent_status": "unavailable"}
        caller = _citizen(state.get("caller_record"))
        caller_nid = caller.nid if caller else None
        if father and district:
            matches = registry.match(
                name=slots["respondent_name"], father_name=father, district=district
            )
            if matches is None:
                return {"respondent_status": "unavailable"}
            if len(matches) == 1 and matches[0].nid != caller_nid:
                return respondent_found(matches[0], "match")
        applicant = _citizen(state.get("applicant_record"))
        relation = slots.get("respondent_relation")
        # An employer, a neighbour or an uncle is not on the applicant's NID record.
        if applicant is None or relation not in (None, "husband", "wife", "brother"):
            return {"respondent_status": "not_found"}
        family = registry.family(applicant.nid)
        if family is None:
            return {"respondent_status": "unavailable"}
        candidates: list[Citizen | None]
        if relation in ("husband", "wife"):
            candidates = [family.spouse]
        elif relation == "brother":
            candidates = list(family.siblings)
        else:
            candidates = [family.spouse, family.father, family.mother, *family.siblings]
            candidates += family.children
        said = slots["respondent_name"]
        named = [c for c in candidates if c and c.nid != caller_nid and _named(said, c)]
        if len(named) != 1:
            return {"respondent_status": "not_found"}
        return respondent_found(named[0], "family")

    def resolve(state: IntakeState) -> IntakeState:
        slots = dict(state.get("slots") or {})
        # Nothing is looked up before the caller has said what happened.
        if state.get("emergency") or "problem" not in slots:
            return {}
        lang = state.get("language", "bn")
        acks = [state.get("ack") or ""]
        update: IntakeState = {}

        asking, asks = state.get("asking"), dict(state.get("asks") or {})
        if asking in SLOTS and asking not in slots and state.get("utterance", "").strip():
            asks[asking] = asks.get(asking, 0) + 1
            if asks[asking] >= MAX_ASKS:
                slots[asking] = GIVEN_UP.get(asking, "")

        def merge(part: IntakeState) -> None:
            if ack := part.pop("ack", None):
                acks.append(ack)
            update.update(part)
            state.update(part)  # later steps in this turn see the result

        # Once every security answer is in, or one of them is not known.
        answers = [slots.get(k) for k in IDENTITY_SLOTS]
        if (
            state.get("identity") == "pending"
            and "caller_name" in slots
            and (None not in answers or "" in answers)
        ):
            merge(verify_caller(state, slots, lang))
            if state.get("identity") == "pending":  # asked again: each question starts over
                for key in IDENTITY_SLOTS:
                    asks.pop(key, None)

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
        # The number they call from is their contact number only once we know it is
        # theirs, or cannot check: a phone registered to someone else may be the abuser's.
        identity = state.get("identity")
        checked = identity in ("verified", "failed")
        own_phone = identity != "pending" and (not checked or state.get("caller_sim_registered"))
        if filing == "self" and state.get("caller_phone") and own_phone:
            slots.setdefault("phone", state["caller_phone"])

        if state.get("respondent_status") == "pending" and "respondent_name" in slots:
            if not slots["respondent_name"]:
                merge({"respondent_status": "none"})
            elif "respondent_father_name" in slots and "respondent_district" in slots:
                merge(find_respondent(state, slots))

        return {**update, "slots": slots, "asks": asks, "ack": _join(*acks)}

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
        if nxt == "problem":
            # Still listening: the greeting, then only encouragement to go on.
            return {"reply": ack or GREETING[lang], "complete": False, "asking": nxt, "ack": ""}
        reply = _join(ack, question(nxt, slots, lang))
        return {"reply": reply, "complete": False, "asking": nxt, "ack": ""}

    graph = StateGraph(IntakeState)
    graph.add_node("extract", extract)
    graph.add_node("check_danger", check_danger)
    graph.add_node("listen", listen)
    graph.add_node("resolve", resolve)
    graph.add_node("respond", respond)
    graph.add_edge(START, "extract")
    graph.add_edge("extract", "check_danger")
    graph.add_edge("check_danger", "listen")
    # Listening can end the call when nothing was said that we could act on.
    graph.add_conditional_edges(
        "listen", lambda s: END if s.get("complete") else "resolve", ["resolve", END]
    )
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
        """Open a conversation and return the greeting.

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
                "story": "",
                "asks": {},
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
