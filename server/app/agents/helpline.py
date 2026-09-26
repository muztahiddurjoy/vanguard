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
number. A mediation notice's SMS carries its own eight-digit number too: a
spoken number is looked up as a tracking number first, then as a notice's
(``lookup_number``). For a notice the helpline reads which case the meeting is
about, as which party the caller is invited, when and where it is, and what to
bring, and remembers it, so "when is it?" or "what if I can't come?" is
answered from it. Known questions are answered by rules; Claude, if configured, answers
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
from app.agents.spoken import (
    BN_DIGITS,
    DISTRICTS,
    EN_TO_BN_DIGITS,
    has_any,
    is_dont_know,
    say_digits,
)
from app.agents.state import HelplineState
from app.agents.t5_intake import DANGER_TERMS
from app.agents.t8_triage import find_hostage_sign
from app.config import get_settings
from app.database import utcnow

Lang = Literal["bn", "en"]
Intent = Literal[
    "track", "mediationNotice", "notice", "office", "documents", "mediation", "fees", "apply",
    "emergency", "goodbye", "unknown",
]  # fmt: skip
# A spoken number to what it may reveal: a case's status, or with "kind": "notice" a
# mediation notice (services.case_status.lookup_number); None if nothing has it.
Lookup = Callable[[str], dict[str, Any] | None]

MAX_TURNS = 12
# Numbers not heard or not found before we stop asking for one.
MAX_TOKEN_TRIES = 3

INTENT_TERMS: dict[str, tuple[str, ...]] = {
    # Order matters: the first intent with a matching term wins. Goodbye is last,
    # so "thanks, and where is the office?" is a question, not the end of the call.
    # A mediation notice before "notice", the respondent's "visit the office" SMS.
    "mediationNotice": ("mediation notice", "notice for mediation", "notice about mediation",
                        "notice about a mediation", "notice number", "মধ্যস্থতার নোটিশ",
                        "মধ্যস্থতা নোটিশ", "মধ্যস্থতার এসএমএস", "সভার নোটিশ", "নোটিশ নম্বর",
                        "নোটিশের নম্বর"),
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
# Follow-up questions about the mediation notice the caller gave the number of. Order
# matters as for INTENT_TERMS: "if I can't come, when is the next one?" is about not coming.
NOTICE_TOPICS: dict[str, tuple[str, ...]] = {
    "cantCome": ("can't come", "cannot come", "can not come", "can't make it", "cannot make it",
                 "not able to come", "unable to come", "won't be able", "miss the meeting",
                 "যেতে না পারলে", "আসতে না পারলে", "যেতে পারব না", "আসতে পারব না",
                 "যেতে পারবো না", "আসতে পারবো না", "না যেতে পারি", "না আসতে পারি", "না গেলে",
                 "না আসলে"),
    "bring": ("bring", "carry", "documents", "papers", "কী আনতে", "কি আনতে", "আনতে হবে",
              "নিয়ে আসতে", "কী নিয়ে", "কি নিয়ে", "কাগজ"),
    "when": ("when", "what time", "which day", "what day", "the date", "কখন", "কবে", "কয়টায়",
             "কটায়", "কত তারিখ", "কোন তারিখ", "কোন দিন", "সময়"),
    "where": ("where", "address", "which place", "কোথায়", "ঠিকানা", "কোন জায়গায়", "স্থান"),
    "repeat": ("again", "repeat", "আবার বলুন", "আবার বলেন", "আবার বলবেন", "আরেকবার"),
}  # fmt: skip


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
# The same questions for a mediation notice's number, which is in the meeting's SMS.
ASK_NOTICE = _t(
    "Please say the eight-digit notice number. It is in the SMS about the meeting.",
    "অনুগ্রহ করে আট অঙ্কের নোটিশ নম্বরটি বলুন। এটি সভার এসএমএসে আছে।",
)
NOTICE_UNKNOWN = _t(
    "I could not find a notice with that number. Please check the number in your SMS and say "
    "it again, digit by digit.",
    "এই নম্বরে কোনো নোটিশ পাওয়া যায়নি। এসএমএসের নম্বরটি দেখে এক এক অঙ্ক করে আবার বলুন।",
)
NOTICE_GIVE_UP = _t(
    "I still cannot find that notice. Please check the notice number in the SMS you received, "
    "or visit the District Legal Aid Office with your NID and the SMS.",
    "আমি এখনও নোটিশটি খুঁজে পাচ্ছি না। অনুগ্রহ করে আপনার পাওয়া এসএমএসে নোটিশ নম্বরটি মিলিয়ে দেখুন, "
    "অথবা আপনার এনআইডি ও এসএমএসটি নিয়ে জেলা লিগ্যাল এইড অফিসে আসুন।",
)
NO_NOTICE = _t(
    "Without the notice number I cannot find the meeting. It is in the SMS about the meeting. "
    "You can also visit the District Legal Aid Office with your NID.",
    "নোটিশ নম্বর ছাড়া আমি সভাটি খুঁজে পাব না। নম্বরটি সভার এসএমএসে আছে। আপনার এনআইডি নিয়ে "
    "জেলা লিগ্যাল এইড অফিসেও আসতে পারেন।",
)
NUMBER_PROMPTS = {
    "token": {"ask": ASK_TOKEN, "unknown": TOKEN_UNKNOWN, "giveUp": TOKEN_GIVE_UP, "none": NO_TOKEN},
    "notice": {"ask": ASK_NOTICE, "unknown": NOTICE_UNKNOWN, "giveUp": NOTICE_GIVE_UP,
               "none": NO_NOTICE},
}  # fmt: skip
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
# What a mediation notice means (describe_notice), and answers to questions about it.
NOTICE_ROLES = {
    "applicant": _t("the applicant", "আবেদনকারী"),
    "respondent": _t("the other party", "অপর পক্ষ"),
}
NOTICE_ABOUT = _t(
    "This notice is about a mediation meeting on case {ref}. You are invited as {role}.",
    "এই নোটিশটি মামলা {ref}-এর একটি মধ্যস্থতা সভা নিয়ে। আপনাকে {role} হিসেবে ডাকা হয়েছে।",
)
NOTICE_WHEN = _t("The meeting is on {date}.", "সভার সময় {date}।")
NOTICE_WHERE = _t("Place: {place}.", "স্থান: {place}।")
NOTICE_FREE = _t(
    "Mediation is free and voluntary: nobody has to agree to a settlement.",
    "মধ্যস্থতা বিনামূল্যে ও স্বেচ্ছামূলক; কাউকে মীমাংসায় রাজি হতে বাধ্য করা হয় না।",
)
NOTICE_BRING = _t(
    "Please bring your NID and the notice number.",
    "আপনার এনআইডি ও নোটিশ নম্বরটি সঙ্গে আনুন।",
)
NOTICE_BRING_NUMBER = _t(
    "Please bring your NID, the notice number, {code}, and any papers about the matter.",
    "আপনার এনআইডি, নোটিশ নম্বর {code}, এবং বিষয়টির কাগজপত্র সঙ্গে আনুন।",
)
NOTICE_CALL = _t(
    "If you cannot come, please call the office before the date.",
    "আসতে না পারলে তারিখের আগেই অফিসে ফোন করে জানান।",
)
NOTICE_CANT_COME = _t(
    "If you cannot come, please tell the office before the date: call {helpline} during office "
    "hours, Sunday to Thursday, 9 am to 5 pm, or visit the office.",
    "আসতে না পারলে তারিখের আগেই অফিসকে জানান: অফিস চলাকালীন, রবিবার থেকে বৃহস্পতিবার সকাল ৯টা থেকে "
    "বিকেল ৫টা, {helpline} নম্বরে ফোন করুন বা অফিসে আসুন।",
)
NOTICE_UDC = _t(
    "If you miss meetings again and again, your Union Digital Centre may contact you about the "
    "next date.",
    "বারবার সভায় না এলে পরবর্তী তারিখ জানাতে আপনার ইউনিয়ন ডিজিটাল সেন্টার আপনার সঙ্গে যোগাযোগ করতে পারে।",
)
NOTICE_CANCELLED = _t(
    "The mediation meeting on case {ref} that was set for {date} has been cancelled. If a new "
    "date is set, you will get a new notice by SMS.",
    "মামলা {ref}-এর যে মধ্যস্থতা সভা {date}-এ হওয়ার কথা ছিল, সেটি বাতিল করা হয়েছে। নতুন তারিখ ঠিক হলে "
    "এসএমএসে নতুন নোটিশ পাবেন।",
)
NOTICE_PAST = _t(
    "The mediation meeting on case {ref} was on {date}. If there is another meeting, you will "
    "get a new notice by SMS.",
    "মামলা {ref}-এর মধ্যস্থতা সভা ছিল {date}। আরেকটি সভা হলে এসএমএসে নতুন নোটিশ পাবেন।",
)
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


def helpline_number(lang: Lang) -> str:
    number = get_settings().helpline_number
    return number if lang == "en" else number.translate(EN_TO_BN_DIGITS)


def facts(lang: Lang) -> dict[str, str]:
    """What the helpline knows about the office, in the caller's language."""
    s = get_settings()
    district = s.office_district if lang == "en" else DISTRICTS.get(s.office_district, "")
    helpline = helpline_number(lang)
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


def _notice_fields(notice: dict[str, Any], lang: Lang) -> dict[str, str]:
    code = notice.get("code") or ""
    return {
        "ref": notice["reference"],
        "role": NOTICE_ROLES.get(notice["role"], NOTICE_ROLES["respondent"])[lang],
        "date": say_date(notice["scheduledFor"], lang),
        "place": notice["place"] if lang == "en" else notice["placeBn"],
        "helpline": helpline_number(lang),
        # Read in two groups, digit by digit, as the tracking number is.
        "code": f"{say_digits(code[:4], lang)}, {say_digits(code[4:], lang)}" if code else "",
    }


def notice_upcoming(notice: dict[str, Any]) -> bool:
    ahead = datetime.fromisoformat(notice["scheduledFor"]) > utcnow()
    return notice.get("status") == "scheduled" and ahead


def describe_notice(notice: dict[str, Any], lang: Lang) -> str:
    """What the SMS means, as the caller hears it: the case, their part, when, where, what next."""
    fields = _notice_fields(notice, lang)
    if notice.get("status") == "cancelled":
        return NOTICE_CANCELLED[lang].format(**fields)
    if not notice_upcoming(notice):
        return NOTICE_PAST[lang].format(**fields)
    parts = (NOTICE_ABOUT, NOTICE_WHEN, NOTICE_WHERE, NOTICE_FREE, NOTICE_BRING, NOTICE_CALL,
             NOTICE_UDC)  # fmt: skip
    return " ".join(p[lang].format(**fields) for p in parts)


def notice_topic(text: str) -> str | None:
    return next((t for t, terms in NOTICE_TOPICS.items() if has_any(text, terms)), None)


def about_notice(notice: dict[str, Any], topic: str, lang: Lang) -> str:
    """A follow-up question about the notice, answered from it."""
    if topic == "repeat" or not notice_upcoming(notice):
        return describe_notice(notice, lang)
    fields = _notice_fields(notice, lang)
    if topic == "cantCome":
        return f"{NOTICE_CANT_COME[lang].format(**fields)} {NOTICE_UDC[lang]}"
    if topic == "bring":
        return (NOTICE_BRING_NUMBER if fields["code"] else NOTICE_BRING)[lang].format(**fields)
    return (NOTICE_WHEN if topic == "when" else NOTICE_WHERE)[lang].format(**fields)


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
        awaited = state.get("awaiting")
        if not utterance.strip():
            opening = NUMBER_PROMPTS[awaited]["ask"] if awaited else GREETING
            return {"reply": opening[lang], "turns": turns, "complete": False, "intent": None}

        lookup: Lookup | None = (config.get("configurable") or {}).get("lookup")
        intent = intent_of(utterance)
        number = find_token(utterance)
        # Questions about the notice the caller already gave: "when is it?", "where?"
        notice = state.get("notice")
        topic = None
        if notice and number is None and intent not in ("emergency", "apply"):
            topic = notice_topic(utterance)
            if topic is None and intent in ("notice", "mediationNotice"):
                topic = "repeat"  # "what does the notice say?"
            if topic is not None:
                intent = "mediationNotice"
        # A bare number right after we asked for one is the number we asked for.
        if awaited and topic is None and intent in ("unknown", "track"):
            intent = "track"
        text: str
        awaiting = None
        tries = state.get("token_tries", 0)
        remembered = None
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
            case "mediationNotice" if notice and topic:
                text = about_notice(notice, topic, lang)
            case "track" | "mediationNotice":
                # Which number to ask for if none works; any number is looked up as both.
                about = awaited == "notice" or has_any(utterance, INTENT_TERMS["mediationNotice"])
                want = "notice" if about else "token"
                prompts = NUMBER_PROMPTS[want]
                asked = awaited == want
                if awaited and not asked:
                    tries = 0  # now asking for the other number
                found = lookup(number) if number and lookup else None
                if found is not None and found.get("kind") == "notice":
                    text, tries, remembered = describe_notice(found, lang), 0, found
                    intent = "mediationNotice"
                elif found is not None:
                    text, tries, intent = describe(found, lang), 0, "track"
                elif number is None and not asked:
                    text, awaiting = prompts["ask"][lang], want
                elif number is None and has_no_token(utterance):
                    # "I don't have it": asking again would not help.
                    text, tries = prompts["none"][lang], 0
                # A miss: no number heard when we asked for one, or nothing has it. A phone
                # caller who cannot give a number that works is not asked forever.
                elif (tries := tries + 1) < MAX_TOKEN_TRIES:
                    text, awaiting = (prompts["unknown"] if number else prompts["ask"])[lang], want
                else:
                    text, tries = prompts["giveUp"][lang], 0
            case "unknown" if llm is not None:
                known = list(facts(lang).values())
                if notice:
                    known.append(describe_notice(notice, lang))
                result = llm.structured(
                    system=ANSWER_SYSTEM.format(language="Bangla" if lang == "bn" else "English"),
                    content="<facts>\n"
                    + "\n".join(f"- {v}" for v in known)
                    + f"\n</facts>\n<question>\n{utterance}\n</question>",
                    schema=LLMAnswer,
                )
                text = result.answer.strip() if result else facts(lang)["unknown"]
            case _:
                text = facts(lang)[intent]
        done = turns >= MAX_TURNS
        tail = GOODBYE[lang] if done else ("" if awaiting else ANYTHING_ELSE[lang])
        out: HelplineState = {
            "reply": " ".join(p for p in (text, tail) if p),
            "complete": done,
            "intent": intent,
            "awaiting": awaiting,
            "token_tries": tries,
            "turns": turns,
        }
        if remembered is not None:
            out["notice"] = remembered
        return out

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
