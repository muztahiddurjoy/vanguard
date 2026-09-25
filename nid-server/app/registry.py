"""The in-memory citizen registry: loading, integrity checks and matching.

The whole file is checked at startup (unique NIDs and SIMs, every family link
pointing at a real record, spouses naming each other) and the service refuses to
start on the first inconsistency, because a wrong link here becomes a wrong
relative on a legal aid case.

Matching confirms an identity the caller already knows; it is not a search. Every
field the caller gives must agree, names are compared fuzzily (spelling, honorifics,
English or Bangla) and dates and districts exactly, and the route demands at least
two details besides the name.
"""

import re
import unicodedata
from collections.abc import Iterable, Iterator
from functools import lru_cache
from pathlib import Path

from pydantic import TypeAdapter, ValidationError
from rapidfuzz import fuzz

from app.schemas import (
    MSISDN_PATTERN,
    Citizen,
    Family,
    Localized,
    Match,
    MatchRequest,
    PersonRef,
    Sim,
)


class RegistryError(ValueError):
    """The citizens file is unreadable or internally inconsistent."""


_CITIZENS = TypeAdapter(list[Citizen])
_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
_MSISDN_RE = re.compile(MSISDN_PATTERN)

# Titles and markers that are written on some documents and not others.
# "Sheikh" is kept on purpose: it is a family name, not a title.
_HONORIFIC_WORDS = (
    "md", "md.", "mohammad", "muhammad", "mohammed", "mohamed", "mohd", "mst", "mst.",
    "mosammat", "mosammot", "most", "late",
    "মোঃ", "মো:", "মো", "মোহাম্মদ", "মুহাম্মদ", "মোসাম্মৎ", "মোছাঃ", "মোসাঃ", "মৃত", "মরহুম", "মরহুমা",
)  # fmt: skip

# Old or common spellings -> the current official English name.
_DISTRICT_ALIASES = {
    "Chittagong": "Chattogram", "Chottogram": "Chattogram", "Comilla": "Cumilla",
    "Kumilla": "Cumilla", "Barisal": "Barishal", "Jessore": "Jashore", "Bogra": "Bogura",
    "Rongpur": "Rangpur", "Dacca": "Dhaka", "Mymensing": "Mymensingh",
    "Nawabganj": "Chapai Nawabganj", "Chapainawabganj": "Chapai Nawabganj",
    "Jhalakati": "Jhalokathi", "Jhalokati": "Jhalokathi", "Lalmanirhat": "Lalmonirhat",
    "Nilfamari": "Nilphamari", "Gaibanda": "Gaibandha", "Netrakona": "Netrokona",
    "Maulvibazar": "Moulvibazar", "Moulvi Bazar": "Moulvibazar", "Hobiganj": "Habiganj",
    "Khagrachari": "Khagrachhari", "Sirajgonj": "Sirajganj", "Kishorganj": "Kishoreganj",
    "Narshingdi": "Narsingdi", "Panchagar": "Panchagarh", "Jaipurhat": "Joypurhat",
    "Coxs Bazar": "Cox's Bazar", "Coxsbazar": "Cox's Bazar",
}  # fmt: skip
_DISTRICT_SUFFIXES = (" district", " zila", " zilla", " জেলা")


def _fold(text: str) -> str:
    """NFC, casefold, punctuation and symbols to spaces, whitespace collapsed.

    Punctuation is found by Unicode category rather than ``\\W`` because Python's
    ``\\w`` does not cover Bangla vowel signs and would split words apart.
    """
    text = unicodedata.normalize("NFC", text).casefold()
    text = "".join(" " if unicodedata.category(ch)[0] in "PS" else ch for ch in text)
    return " ".join(text.split())


_HONORIFICS = frozenset(_fold(word) for word in _HONORIFIC_WORDS)


def normalise_name(text: str) -> str:
    return " ".join(t for t in _fold(text).split() if t not in _HONORIFICS)


def name_score(query: str, name: Localized) -> float:
    """Best token_sort_ratio of an already normalised query against both spellings."""
    if not query:
        return 0.0
    return max(fuzz.token_sort_ratio(query, normalise_name(n)) for n in (name.en, name.bn))


def _district_key(text: str) -> str:
    key = _fold(text)
    for suffix in _DISTRICT_SUFFIXES:
        key = key.removesuffix(suffix)
    return key


_ALIAS_KEYS = {_district_key(k): _district_key(v) for k, v in _DISTRICT_ALIASES.items()}


def canonical_district(text: str) -> str:
    key = _district_key(text)
    return _ALIAS_KEYS.get(key, key)


def district_matches(query: str, district: Localized) -> bool:
    wanted = canonical_district(query)
    return wanted in (canonical_district(district.en), canonical_district(district.bn))


def normalise_nid(raw: str) -> str:
    return re.sub(r"[^0-9]", "", raw.translate(_BN_DIGITS))


def normalise_msisdn(raw: str) -> str | None:
    """``01XXXXXXXXX`` from +880/880/00880-prefixed, local or 10-digit input."""
    digits = normalise_nid(raw)
    if digits.startswith("00880"):
        digits = digits[2:]
    if digits.startswith("880"):
        digits = digits[2:]
    elif len(digits) == 10:
        digits = "0" + digits
    return digits if _MSISDN_RE.fullmatch(digits) else None


# The optional request fields, in the order they are reported back in "matched".
DETAIL_FIELDS = ("father_name", "mother_name", "date_of_birth", "permanent_district", "district")


def provided_details(query: MatchRequest) -> list[str]:
    """The fields besides the name that the caller filled in (blank strings do not count)."""
    return [field for field in DETAIL_FIELDS if getattr(query, field) not in (None, "")]


def _by_age(citizens: Iterable[Citizen]) -> list[Citizen]:
    return sorted(citizens, key=lambda c: (c.date_of_birth, c.nid))


class Registry:
    """Read-only view of the citizens file, indexed by NID and by SIM."""

    def __init__(self, citizens: Iterable[Citizen]) -> None:
        self._by_nid: dict[str, Citizen] = {}
        self._by_msisdn: dict[str, tuple[Sim, Citizen]] = {}
        problems: list[str] = []
        for citizen in citizens:
            if citizen.nid in self._by_nid:
                problems.append(f"NID {citizen.nid} appears more than once")
                continue
            self._by_nid[citizen.nid] = citizen
            for sim in citizen.sims:
                if owner := self._by_msisdn.get(sim.msisdn):
                    problems.append(
                        f"SIM {sim.msisdn} is registered to both {owner[1].nid} and {citizen.nid}"
                    )
                else:
                    self._by_msisdn[sim.msisdn] = (sim, citizen)
        problems.extend(self._link_problems())
        if problems:
            raise RegistryError("Invalid citizens data:\n- " + "\n- ".join(problems))

    @classmethod
    def from_file(cls, path: Path) -> "Registry":
        try:
            citizens = _CITIZENS.validate_json(path.read_bytes())
        except (OSError, ValidationError) as exc:
            raise RegistryError(f"Cannot load {path}: {exc}") from exc
        try:
            return cls(citizens)
        except RegistryError as exc:
            raise RegistryError(f"{path}: {exc}") from None

    def _link_problems(self) -> list[str]:
        problems = []
        for c in self:
            links = (("father", c.father, "male"), ("mother", c.mother, "female"))
            for role, ref, gender in (*links, ("spouse", c.spouse, None)):
                if ref is None or ref.nid is None:
                    continue
                target = self._by_nid.get(ref.nid)
                if target is None:
                    problems.append(f"{c.nid}: {role} NID {ref.nid} is not in the registry")
                elif target.nid == c.nid:
                    problems.append(f"{c.nid}: lists itself as {role}")
                else:
                    if ref.name != target.name:
                        problems.append(
                            f"{c.nid}: {role} is named {ref.name.en!r} but {target.nid} is "
                            f"{target.name.en!r}"
                        )
                    if gender and target.gender != gender:
                        problems.append(f"{c.nid}: {role} {target.nid} is not {gender}")
                    if role == "spouse" and (target.spouse is None or target.spouse.nid != c.nid):
                        problems.append(f"{c.nid}: spouse {target.nid} does not name {c.nid} back")
        return problems

    def __len__(self) -> int:
        return len(self._by_nid)

    def __iter__(self) -> Iterator[Citizen]:
        return iter(self._by_nid.values())

    def get(self, nid: str) -> Citizen | None:
        return self._by_nid.get(normalise_nid(nid))

    def sim(self, msisdn: str) -> tuple[Sim, Citizen] | None:
        normalised = normalise_msisdn(msisdn)
        return self._by_msisdn.get(normalised) if normalised else None

    def _linked(self, ref: PersonRef | None) -> Citizen | None:
        return self._by_nid.get(ref.nid) if ref and ref.nid else None

    def family(self, citizen: Citizen) -> Family:
        def shares_parent(other: Citizen) -> bool:
            return any(
                mine.nid is not None and mine.nid == theirs.nid
                for mine, theirs in ((citizen.father, other.father), (citizen.mother, other.mother))
            )

        others = [c for c in self if c.nid != citizen.nid]
        return Family(
            father=self._linked(citizen.father),
            mother=self._linked(citizen.mother),
            spouse=self._linked(citizen.spouse),
            siblings=_by_age(c for c in others if shares_parent(c)),
            children=_by_age(c for c in others if citizen.nid in (c.father.nid, c.mother.nid)),
        )

    def match(self, query: MatchRequest, threshold: float) -> list[Match]:
        """Every citizen that agrees with all the given fields, best score first."""
        details = provided_details(query)
        given = {
            "name": query.name,
            "father_name": query.father_name,
            "mother_name": query.mother_name,
        }
        names = {field: normalise_name(value) for field, value in given.items() if value}

        matches = []
        for c in self:
            stored = {"name": c.name, "father_name": c.father.name, "mother_name": c.mother.name}
            scores = [name_score(q, stored[field]) for field, q in names.items()]
            if min(scores) < threshold:
                continue
            if query.date_of_birth and c.date_of_birth != query.date_of_birth:
                continue
            if query.permanent_district and not district_matches(
                query.permanent_district, c.permanent_address.district
            ):
                continue
            homes = (c.permanent_address.district, c.present_address.district)
            if query.district and not any(district_matches(query.district, d) for d in homes):
                continue
            matches.append(
                Match(
                    citizen=c,
                    score=round(sum(scores) / len(scores), 1),
                    matched=["name", *details],
                )
            )
        matches.sort(key=lambda m: (-m.score, m.citizen.nid))
        return matches


@lru_cache
def load_registry(path: Path) -> Registry:
    return Registry.from_file(path)
