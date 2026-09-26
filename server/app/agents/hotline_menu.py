"""The hotline's opening question: file a new case, or hear how one is going.

The application hotline opens with one question (``MENU``), so a caller who
has already applied and only wants news of their case is not taken for a new
application. This module decides what the answer means:

- ``"new"``: they want to file a case; intake begins with ``TELL_ME``.
- ``"status"``: they want to hear the progress of a case they filed; the query
  helpline asks for the tracking number (or reads one said with the answer).
- ``"story"``: instead of choosing, they began saying what happened, or said
  something about danger. Intake hears this very utterance as its first turn,
  so nothing they said is lost and its emergency flow runs at once.
- ``"unclear"``: the question is asked again (``MENU_AGAIN``); after
  ``MAX_MENU_ASKS`` such answers the call goes to intake anyway.

Intake's rule holds here too: a frightened caller, or one in danger, is heard
first. Danger and signs of being held are listened for before anything else
and always mean "story", even beside the word "status"; an answer that says
what happened is never "unclear". Answers are read by rules. The model, if
configured, is asked only about a short answer the rules cannot place, and
when in doubt the answer is "unclear", never "status": a caller who needs to
apply must not be sent to the status line.
"""

import logging
import unicodedata
from typing import Literal

from pydantic import BaseModel, Field

from app.agents.helpline import find_token
from app.agents.llm import StructuredLLM, default_llm
from app.agents.spoken import has_any, has_word, words
from app.agents.t5_intake import DANGER_TERMS, FILLER_WORDS, names_a_problem
from app.agents.t8_triage import (
    RISK_FACTORS,
    SENSITIVE_TERMS,
    categorize_by_rules,
    find_hostage_sign,
)

log = logging.getLogger(__name__)

Choice = Literal["new", "status", "story", "unclear"]
Lang = Literal["bn", "en"]

# Answers not understood before the call goes to intake anyway: nobody is kept at a menu.
MAX_MENU_ASKS = 2
# Words of the caller's own (see ``own_words``) that make an answer an account.
ACCOUNT_WORDS = 3


def _t(en: str, bn: str) -> dict[str, str]:
    return {"en": en, "bn": bn}


MENU = _t(
    "Legal aid. Do you want to file a new case, or hear the progress of a case you already filed?",
    "লিগ্যাল এইড। আপনি কি নতুন মামলা করতে চান, নাকি আগে করা মামলার অগ্রগতি জানতে চান?",
)
MENU_AGAIN = _t(
    "Sorry, I did not understand. To file a new case, say 'new case'. To hear the progress "
    "of a case you filed, say 'status'.",
    "দুঃখিত, বুঝতে পারিনি। নতুন মামলা করতে বলুন 'নতুন মামলা'। আগের মামলার অগ্রগতি জানতে বলুন 'অবস্থা'।",
)
TELL_ME = _t("All right. I'm listening, tell me what happened.", "ঠিক আছে। আমি শুনছি, বলুন কী হয়েছে।")

# Someone is being hurt, threatened or held: triage's high-weight warning signs. Not
# ``has_risk_sign``, which also counts milder signs that any status request may carry:
# "মামলা" (earlier legal action), a son or daughter, even "first" (its "fir").
SERIOUS_SIGNS = tuple(
    term for _, weight, terms in RISK_FACTORS.values() if weight == "high" for term in terms
)
# Fear, threats and self-harm, in words the shared tables do not have.
FEAR_TERMS = (
    "afraid", "scared", "frightened", "danger", "threat", "hurt", "save me", "suicide",
    "ভয় পাচ্ছি", "ভয় লাগছে", "ভয় করছে", "ভয় পাই", "ভয়ে আছি", "ভয় দেখা", "বিপদ", "হুমকি",
    "মারছে", "মেরেছে", "মারবে", "মারতে", "পেটা", "পিটিয়ে", "বাঁচাও", "আত্মহত্যা",
)  # fmt: skip
# Someone asking for help is heard by intake ("I'm listening"), not given the menu again.
# Whole words: "is this the helpline?" is not a plea.
HELP_WORDS = ("help", "সাহায্য", "সাহায্যের", "সহায়তা", "সহায়তার")

# A case already filed: these win even beside a problem ("the progress of my land case").
STATUS_TERMS = (
    "status", "progress", "tracking", "token", "already filed", "already applied",
    "filed a case", "filed the case", "filed an application", "filed a complaint",
    "i applied", "we applied", "previous case", "previous application", "earlier case",
    "earlier application", "old case", "happened to my", "happened with my",
    "happening with my", "happened to the case", "happened with the case", "any news",
    "any update", "news of my", "news about my",
    "স্ট্যাটাস", "অগ্রগতি", "আপডেট", "ট্র্যাকিং", "টোকেন", "আগের মামলা", "আগের আবেদন",
    "আগের অভিযোগ", "আগে করা", "আগে মামলা", "আগে আবেদন", "মামলা করেছি", "আবেদন করেছি",
    "অভিযোগ করেছি", "অভিযোগ দিয়েছি", "দায়ের করেছি", "খবর কী", "খবর কি", "খবর জানতে",
    "খবর নিতে", "কোনো খবর", "কোন খবর", "খোঁজ নিতে", "খোঁজ জানতে", "খোঁজখবর", "খোঁজ খবর",
)  # fmt: skip
# Whole words only: "অবস্থায়" is "in a (bad) state", said by callers in trouble.
STATUS_WORDS = ("update", "updates", "track", "অবস্থা", "অবস্থাটা", "অবস্থার")
NEW_CASE_TERMS = (
    "new case", "new application", "new complaint", "a new one", "file a", "file an",
    "file my", "to file", "filing a", "make a complaint", "lodge a complaint",
    "make an application", "register a case", "open a case", "start a case", "apply",
    "নতুন মামলা", "নতুন আবেদন", "নতুন অভিযোগ", "নতুন করে মামলা", "মামলা করতে", "মামলা করব",
    "মামলা করার", "মামলা করা যা", "মামলা দিতে", "মামলা দেব", "মামলা দিব", "আবেদন করতে",
    "আবেদন করব", "আবেদন করার", "অভিযোগ করতে", "অভিযোগ করব", "অভিযোগ করার", "অভিযোগ দিতে",
    "অভিযোগ দেব", "অভিযোগ দিব", "অভিযোগ জানাতে", "নালিশ করতে", "নালিশ দিতে", "নালিশ জানাতে",
    "দায়ের করতে", "দায়ের করব",
)  # fmt: skip
# "New" alone, or an option by number, counts only as the whole answer.
NEW_WORDS = ("new", "নতুন")
FIRST = ("first", "প্রথম", "প্রথমটা", "প্রথমটি")
SECOND = ("second", "দ্বিতীয়", "দ্বিতীয়টা", "দ্বিতীয়টি")
ONE = ("one", "1", "১", "এক")
TWO = ("two", "2", "২", "দুই")
# "What about my case?": a question about the caller's own case.
OWN_CASE = (
    "my case", "my application", "my complaint", "our case", "our application", "the case i",
    "the application i", "আমার মামলা", "আমাদের মামলা", "আমার আবেদন", "আমাদের আবেদন",
    "আমার অভিযোগ", "মামলাটা", "মামলাটি", "আবেদনটা", "আবেদনটি", "অভিযোগটা", "অভিযোগটি",
)  # fmt: skip
QUESTION_TERMS = (
    "what", "how", "when", "where", "any ", "know", "hear", "?",
    "জানতে", "শুনতে", "কবে", "কেমন", "কোথায়", "কতদূর", "কত দূর", "কতটুকু", "খবর", "খোঁজ",
)  # fmt: skip
QUESTION_WORDS = ("কী", "কি", "হলো", "হল")

# Words that choose or ask rather than tell: the menu's own, the words above, and how
# people put a choice or a question ("I want the second one", "আমি জানতে চাই"). What is
# left of an answer without these and FILLER_WORDS is the caller's own news.
MENU_WORDS = {
    "i", "i'm", "im", "i'd", "we", "my", "our", "your", "it", "it's", "this", "that", "the",
    "a", "an", "to", "of", "for", "about", "with", "on", "in", "and", "or", "please", "just",
    "want", "wanna", "would", "like", "need", "do", "did", "does", "have", "has", "had", "was",
    "will", "what's", "whats", "which", "tell", "say", "said", "check", "ask", "again",
    "sorry", "repeat", "understand", "didn't", "not", "no", "going", "case", "cases",
    "application", "applications", "complaint", "file", "filed", "number", "option",
    "আমি", "আমার", "আমাদের", "একটা", "একটি", "এই", "সেই", "যে", "জন্য", "নিয়ে", "সম্পর্কে",
    "ব্যাপারে", "চাই", "চাচ্ছি", "চাইছি", "চান", "করতে", "করা", "করে", "হবে", "হয়েছে", "আছে",
    "বলুন", "বলেন", "বললেন", "আবার", "বুঝিনি", "বুঝতে", "পারিনি", "না", "নাকি", "টা", "টি",
    "মামলা", "মামলার", "মামলাটার", "মামলাটির", "মামলায়", "আবেদন", "আবেদনের", "অভিযোগ",
    "অভিযোগের", "নম্বর",
} | {
    word
    for terms in (
        STATUS_TERMS, STATUS_WORDS, NEW_CASE_TERMS, NEW_WORDS, FIRST, SECOND, ONE, TWO,
        OWN_CASE, QUESTION_TERMS, QUESTION_WORDS,
    )
    for term in terms
    for word in words(term)
}  # fmt: skip


def in_danger(text: str) -> bool:
    """Danger now, a sign of being held, violence, a threat or fear, however it is said."""
    return (
        has_any(text, DANGER_TERMS)
        or find_hostage_sign(text) is not None
        or has_any(text, SERIOUS_SIGNS)
        or has_any(text, FEAR_TERMS)
    )


def own_words(text: str) -> list[str]:
    """The words of an answer that are the caller's own: not filler, not the menu's."""
    return [w for w in words(text) if w not in FILLER_WORDS and w not in MENU_WORDS]


def says_what_happened(text: str, own: list[str]) -> bool:
    """A problem legal aid knows, a sensitive matter, or enough words of the caller's own.

    Not ``names_a_problem``: its milder warning signs are in any menu answer ("মামলা").
    """
    return (
        len(own) >= ACCOUNT_WORDS
        or categorize_by_rules(text)[0] is not None
        or has_any(text, SENSITIVE_TERMS)
    )


def option(text: str) -> int | None:
    """1 or 2 when an answer picks an option by number ("the second one", "এক")."""
    first, second = has_word(text, FIRST), has_word(text, SECOND)
    if not (first or second):  # "one" is a number only without an ordinal: "the second one"
        first, second = has_word(text, ONE), has_word(text, TWO)
    if first == second:
        return None
    return 1 if first else 2


def wants_new_case(text: str, own: list[str]) -> bool:
    if has_any(text, NEW_CASE_TERMS):
        return True
    # "New", "first", "এক" only as the whole answer: "one day he ..." is not a choice.
    return not own and (has_word(text, NEW_WORDS) or option(text) == 1)


def asks_about_a_case(text: str, own: list[str]) -> bool:
    if has_any(text, STATUS_TERMS) or has_word(text, STATUS_WORDS):
        return True
    if not own and option(text) == 2:
        return True
    # "What about my case?" asks how it is going, unless it goes on to say what happened.
    asks = has_any(text, QUESTION_TERMS) or has_word(text, QUESTION_WORDS)
    return asks and has_any(text, OWN_CASE) and not says_what_happened(text, own)


class MenuReading(BaseModel):
    choice: Choice = Field(
        description="'new': they want to file a new case or application; 'status': they want "
        "to hear the progress of a case or application they already filed; 'story': they "
        "began telling what happened to them, or said anything about danger; 'unclear': "
        "anything else, or you are not sure"
    )


MENU_SYSTEM = (
    "You read a caller's answer on a Bangladeshi legal aid hotline. Callers speak Bangla, "
    "English or a mix, transcribed from speech. The call opened with this question: "
    "{question} Say what the answer means. 'story' means they started describing their "
    "problem instead of choosing. When you are not sure, say 'unclear', never 'status': a "
    "caller who needs to apply must not be sent to the case status line."
)


class HotlineMenu:
    def __init__(self, llm: StructuredLLM | None = None, use_default_llm: bool = True):
        self.llm = llm if llm is not None else (default_llm() if use_default_llm else None)

    def choose(self, utterance: str, language: str = "bn") -> Choice:
        """What the caller's answer to ``MENU`` means (see the module docstring)."""
        # Speech-to-text may write য় or ড় as one code point; the term tables use two.
        text = unicodedata.normalize("NFC", utterance).strip()
        if not text:
            return "unclear"
        # Before anything else, whatever else was said: T5's 999 line must not wait.
        if in_danger(text):
            return "story"
        if find_token(text):
            return "status"
        own = own_words(text)
        new = wants_new_case(text, own)
        # Both at once ("the status of my new case") is read as a new case, below.
        if not new and asks_about_a_case(text, own):
            return "status"
        if new:
            return "story" if says_what_happened(text, own) else "new"
        # Judged on the caller's own words: "মামলা" alone is a menu word, not a problem.
        if (
            says_what_happened(text, own)
            or names_a_problem(" ".join(own))
            or has_word(text, HELP_WORDS)
        ):
            return "story"
        if not own:
            return "unclear"  # "hello?", "I want": nothing for the model to read
        return self._ask_model(text, "en" if language == "en" else "bn")

    def _ask_model(self, text: str, lang: Lang) -> Choice:
        """A short answer the rules cannot place ("my husband", "I want to know something")."""
        if self.llm is None:
            return "unclear"
        try:
            result = self.llm.structured(
                system=MENU_SYSTEM.format(question=MENU[lang]),
                content=f"<utterance>\n{text}\n</utterance>",
                schema=MenuReading,
            )
        except Exception:
            # Every hotline call starts here: a model failure asks again, it never ends a call.
            log.warning("Menu model failed; asking again", exc_info=True)
            return "unclear"
        return result.choice if result is not None else "unclear"


_menu: HotlineMenu | None = None


def menu() -> HotlineMenu:
    global _menu
    if _menu is None:
        _menu = HotlineMenu()
    return _menu
