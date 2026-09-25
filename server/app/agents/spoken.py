"""Reading what callers say: Bangla, English or a mix, transcribed from speech.

Shared by T5 intake and the query helpline. Everything here is deliberately
conservative: when an answer is unclear the parser returns None and the agent
asks again, because a wrong guess (a wrong date of birth, the wrong relative)
is worse than one more question.
"""

import re
from datetime import date

from rapidfuzz import fuzz

# Bangla digits -> ASCII so numbers spoken/typed in Bangla are found.
BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
EN_TO_BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")

PHONE_RE = re.compile(r"(?:\+?88)?0?1[3-9](?:[\s-]?\d){8}")

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

# Old English spellings people still use.
DISTRICT_ALIASES = {
    "chittagong": "Chattogram", "comilla": "Cumilla", "barisal": "Barishal",
    "jessore": "Jashore", "bogra": "Bogura", "rongpur": "Rangpur",
}  # fmt: skip

MONTHS = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3,
    "april": 4, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sept": 9, "sep": 9, "october": 10,
    "oct": 10, "november": 11, "nov": 11, "december": 12, "dec": 12,
    "জানুয়ারি": 1, "জানুয়ারী": 1, "ফেব্রুয়ারি": 2, "ফেব্রুয়ারী": 2, "মার্চ": 3,
    "এপ্রিল": 4, "মে": 5, "জুন": 6, "জুলাই": 7, "আগস্ট": 8, "আগষ্ট": 8,
    "সেপ্টেম্বর": 9, "অক্টোবর": 10, "নভেম্বর": 11, "ডিসেম্বর": 12,
}  # fmt: skip

YES = ("yes", "yeah", "yep", "okay", "ok", "sure", "please send", "send it",
       "হ্যাঁ", "হ্যা", "জি", "জ্বি", "ঠিক আছে", "পাঠান", "পাঠাতে পারেন")  # fmt: skip
NO = ("no", "not now", "don't", "do not", "not safe", "না", "নাহ", "পাঠাবেন না", "এখন না")
DONT_KNOW = (
    "don't know", "do not know", "dont know", "not sure", "no idea",
    "জানি না", "জানিনা", "জানা নেই", "বলতে পারব না", "মনে নেই",
)  # fmt: skip

# Prefixes people say before a name ("my name is", "আমার নাম") and after it ("বলছি").
_NAME_LEAD = re.compile(
    r"^(?:(?:my|her|his|their|the)\s+)?(?:(?:father|mother|brother|sister)'?s?\s+)?"
    r"(?:name\s+is|name's|name)\s+"
    r"|^(?:(?:my|her|his)\s+(?:father|mother|brother|sister)\s+is|i\s+am|i'm|this\s+is|it's|it\s+is)\s+"
    r"|^(?:আমার|ওর|তার|তাঁর|উনার|ওনার)?\s*(?:বাবার|মায়ের|আব্বার|আম্মার|ভাইয়ের|বোনের|পিতার|মাতার)?\s*নাম\s*"
    r"|^আমি\s+",
    re.IGNORECASE,
)
_NAME_TAIL = re.compile(r"\s*(?:বলছি|বলছিলাম|speaking|here)$", re.IGNORECASE)
# Honorifics dropped before comparing names; the registry does the same.
_HONORIFICS = {
    "md", "mohammad", "muhammad", "mohammed", "mohd", "mst", "mosammat", "mosammot",
    "most", "late", "মোঃ", "মো", "মোহাম্মদ", "মুহাম্মদ", "মোসাম্মৎ", "মোছাঃ", "মোসাঃ",
    "মৃত", "মরহুম", "মরহুমা",
}  # fmt: skip
_PUNCT = re.compile(r"[.,;:!?\"()।]")


def find_phone(text: str) -> str | None:
    m = PHONE_RE.search(text.translate(BN_DIGITS))
    if not m:
        return None
    digits = re.sub(r"\D", "", m.group())
    return "0" + digits[-10:]


def find_district(text: str) -> str | None:
    lowered = text.casefold()
    for en, bn in DISTRICTS.items():
        if en.casefold() in lowered or bn in text:
            return en
    return next((en for old, en in DISTRICT_ALIASES.items() if old in lowered), None)


def words(text: str) -> list[str]:
    """Lower-cased tokens. Bangla needs whole-word checks: "মা" (mother) is inside "আমার"."""
    return _PUNCT.sub(" ", text.casefold()).split()


def has_any(text: str, terms: tuple[str, ...]) -> bool:
    """Substring match: for multi-word phrases and English, where that is safe."""
    lowered = text.casefold()
    return any(t in lowered for t in terms)


def has_word(text: str, terms: tuple[str, ...] | set[str]) -> bool:
    """Whole-word (or whole-phrase) match."""
    padded = f" {' '.join(words(text))} "
    return any(f" {t} " in padded for t in terms)


def is_dont_know(text: str) -> bool:
    return has_any(text, DONT_KNOW)


def yes_or_no(text: str) -> bool | None:
    """True, False, or None when the answer is neither. Any "no" wins: it is the safe answer."""
    if has_word(text, NO):
        return False
    if has_word(text, YES):
        return True
    return None


def clean_name(utterance: str) -> str | None:
    """The name in "My father's name is Abdul Karim" / "আমি রফিকুল ইসলাম বলছি"."""
    name = _NAME_LEAD.sub("", utterance.strip())
    name = _NAME_TAIL.sub("", name).strip(" .।,")
    if not name or find_phone(name) or any(ch.isdigit() for ch in name.translate(BN_DIGITS)):
        return None
    return name if 1 <= len(name.split()) <= 6 else None


def normalize_name(name: str) -> str:
    return " ".join(w for w in words(name) if w not in _HONORIFICS)


def name_similarity(said: str, *recorded: str | None) -> float:
    """Best 0-100 similarity between what was said and any recorded spelling."""
    target = normalize_name(said)
    return max(
        (fuzz.token_sort_ratio(target, normalize_name(r)) for r in recorded if r), default=0.0
    )


def _plausible(year: int, month: int, day: int) -> date | None:
    try:
        born = date(year, month, day)
    except ValueError:
        return None
    return born if date(1900, 1, 1) <= born <= date.today() else None


def parse_date(text: str) -> date | None:
    """A date of birth as people say it: "15 March 1990", "১৫ই মার্চ ১৯৯০", "15/03/1990".

    Numeric dates are read day first, as they are written in Bangladesh.
    """
    t = text.casefold().translate(BN_DIGITS)
    if m := re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", t):
        return _plausible(int(m[1]), int(m[2]), int(m[3]))
    if m := re.search(r"\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b", t):
        return _plausible(int(m[3]), int(m[2]), int(m[1]))
    month = next(
        (n for name, n in sorted(MONTHS.items(), key=lambda kv: -len(kv[0])) if name in t), None
    )
    year = re.search(r"(?<!\d)(19\d{2}|20\d{2})(?!\d)", t)
    if month is None or year is None:
        return None
    # The day is the other one- or two-digit number ("15th", "১লা", "১৫ই").
    rest = t[: year.start()] + " " + t[year.end() :]
    day = re.search(r"(?<!\d)(\d{1,2})(?!\d)", rest)
    return _plausible(int(year[1]), month, int(day[1])) if day else None


def say_digits(digits: str, lang: str) -> str:
    """Digits spaced out so text-to-speech reads them one by one."""
    spaced = " ".join(digits)
    return spaced.translate(EN_TO_BN_DIGITS) if lang == "bn" else spaced


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
    lowered = text.casefold().translate(BN_DIGITS)
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
