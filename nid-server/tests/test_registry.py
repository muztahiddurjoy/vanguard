import copy
import json
from datetime import date

import pytest

from app.config import DEFAULT_DATA_FILE
from app.registry import (
    Registry,
    RegistryError,
    canonical_district,
    normalise_msisdn,
    normalise_name,
)

PLACE = {
    "village": {"en": "Shyampur", "bn": "শ্যামপুর"},
    "upazila": {"en": "Pirgachha", "bn": "পীরগাছা"},
    "district": {"en": "Rangpur", "bn": "রংপুর"},
}


def person(nid, en, bn, gender, *, father=None, mother=None, spouse=None, sims=()):
    unregistered = {"name": {"en": "Someone", "bn": "কেউ"}, "nid": None}
    return {
        "nid": nid,
        "name": {"en": en, "bn": bn},
        "father": father or unregistered,
        "mother": mother or unregistered,
        "spouse": spouse,
        "date_of_birth": "1980-01-01",
        "gender": gender,
        "permanent_address": PLACE,
        "present_address": PLACE,
        "sims": [
            {"msisdn": m, "operator": "Grameenphone", "registered_on": "2016-01-01"} for m in sims
        ],
    }


def link(record):
    return {"name": record["name"], "nid": record["nid"]}


@pytest.fixture
def valid():
    husband = person("1000000001", "Abdul Hamid", "আব্দুল হামিদ", "male", sims=["01711111111"])
    wife = person("1000000002", "Nurjahan Begum", "নূরজাহান বেগম", "female")
    husband["spouse"], wife["spouse"] = link(wife), link(husband)
    child = person(
        "1000000003",
        "Sohel Rana",
        "সোহেল রানা",
        "male",
        father=link(husband),
        mother=link(wife),
        sims=["01811111111"],
    )
    return [husband, wife, child]


def write(tmp_path, records):
    path = tmp_path / "citizens.json"
    path.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
    return path


def test_valid_file_loads(tmp_path, valid):
    registry = Registry.from_file(write(tmp_path, valid))
    assert len(registry) == 3
    assert registry.family(registry.get("1000000003")).father.nid == "1000000001"


def test_dangling_parent_nid_is_rejected(tmp_path, valid):
    valid[2]["father"]["nid"] = "9999999999"
    with pytest.raises(RegistryError, match="father NID 9999999999 is not in the registry"):
        Registry.from_file(write(tmp_path, valid))


def test_duplicate_sim_is_rejected(tmp_path, valid):
    valid[2]["sims"][0]["msisdn"] = "01711111111"
    with pytest.raises(RegistryError, match="SIM 01711111111 is registered to both"):
        Registry.from_file(write(tmp_path, valid))


def test_duplicate_nid_is_rejected(tmp_path, valid):
    twin = copy.deepcopy(valid[2])
    twin["sims"] = []
    with pytest.raises(RegistryError, match="NID 1000000003 appears more than once"):
        Registry.from_file(write(tmp_path, [*valid, twin]))


def test_one_sided_spouse_is_rejected(tmp_path, valid):
    valid[1]["spouse"] = None
    with pytest.raises(RegistryError, match="does not name 1000000001 back"):
        Registry.from_file(write(tmp_path, valid))


def test_parent_name_must_match_the_linked_record(tmp_path, valid):
    valid[2]["mother"]["name"] = {"en": "Rahima Khatun", "bn": "রহিমা খাতুন"}
    with pytest.raises(RegistryError, match="mother is named 'Rahima Khatun'"):
        Registry.from_file(write(tmp_path, valid))


@pytest.mark.parametrize(
    ("field", "value"),
    [("msisdn", "01211111111"), ("msisdn", "+8801711111111"), ("operator", "Nokia")],
)
def test_malformed_sim_is_rejected(tmp_path, valid, field, value):
    valid[0]["sims"][0][field] = value
    with pytest.raises(RegistryError, match="Cannot load"):
        Registry.from_file(write(tmp_path, valid))


def test_unknown_keys_and_bad_json_are_rejected(tmp_path, valid):
    valid[0]["religion"] = "withheld"
    with pytest.raises(RegistryError, match="Cannot load"):
        Registry.from_file(write(tmp_path, valid))

    broken = tmp_path / "broken.json"
    broken.write_text("[{", encoding="utf-8")
    with pytest.raises(RegistryError, match="Cannot load"):
        Registry.from_file(broken)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("01712345318", "01712345318"),
        ("+880 1712-345318", "01712345318"),
        ("008801712345318", "01712345318"),
        ("1712345318", "01712345318"),
        ("০১৭১২৩৪৫৩১৮", "01712345318"),
        ("01212345318", None),
        ("0171234531", None),
    ],
)
def test_normalise_msisdn(raw, expected):
    assert normalise_msisdn(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Md. Abdul Karim", "abdul karim"),
        ("MOHAMMED  abdul-karim", "abdul karim"),
        ("Mst. Rahima Begum", "rahima begum"),
        ("Late Abdul Kader", "abdul kader"),
        ("Sheikh Rahman", "sheikh rahman"),
        ("মোঃ আব্দুল করিম", "আব্দুল করিম"),
        ("মোছাঃ রহিমা বেগম", "রহিমা বেগম"),
        ("মরহুম আব্দুল কাদের", "আব্দুল কাদের"),
    ],
)
def test_normalise_name(raw, expected):
    assert normalise_name(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Chittagong", "chattogram"),
        ("Comilla", "cumilla"),
        ("Barisal", "barishal"),
        ("Jessore", "jashore"),
        ("Bogra", "bogura"),
        ("Rongpur", "rangpur"),
        ("Rangpur district", "rangpur"),
        ("রংপুর জেলা", "রংপুর"),
    ],
)
def test_canonical_district(raw, expected):
    assert canonical_district(raw) == expected


# --- the bundled data ---------------------------------------------------------------

OPERATOR_PREFIXES = {
    "Grameenphone": ("017", "013"),
    "Robi": ("018",),
    "Airtel": ("016",),
    "Banglalink": ("019", "014"),
    "Teletalk": ("015",),
}
# Dashboard applicants: (name, NID suffix, village, upazila, age on 2026-09-25).
DASHBOARD = [
    ("Moyuri Akter", "2741", "Shyampur", "Pirgachha", 29),
    ("Abdul Malek", "0936", "Ramnathpur", "Badarganj", 58),
    ("Rahima Begum", "4417", "Balarhat", "Mithapukur", 34),
    ("Rohima Begum", "9052", "Balarhat", "Mithapukur", 27),
    ("Jahanara Parvin", "3380", "Kholeya", "Gangachara", 41),
    ("Kamal Hossain", "7712", "Durgapur", "Mithapukur", 36),
    ("Shirin Sultana", "5528", "Shyampur", "Badarganj", 31),
    ("Nabila Rahman", "", "Tepamadhupur", "Kaunia", 22),
]


def age_on(born: date, day: date) -> int:
    return day.year - born.year - ((day.month, day.day) < (born.month, born.day))


@pytest.fixture(scope="module")
def bundled():
    return Registry.from_file(DEFAULT_DATA_FILE)


def test_bundled_data_is_valid(bundled):
    assert len(bundled) == 40


@pytest.mark.parametrize(("name", "suffix", "village", "upazila", "age"), DASHBOARD)
def test_dashboard_applicants_are_consistent(bundled, name, suffix, village, upazila, age):
    [citizen] = [c for c in bundled if c.name.en == name]
    assert citizen.nid.endswith(suffix)
    assert age_on(citizen.date_of_birth, date(2026, 9, 25)) == age
    homes = (citizen.permanent_address, citizen.present_address)
    assert any(a.village.en == village and a.upazila.en == upazila for a in homes)


def test_operators_follow_the_number_prefixes(bundled):
    for citizen in bundled:
        for sim in citizen.sims:
            assert sim.msisdn.startswith(OPERATOR_PREFIXES[sim.operator]), sim.msisdn
            assert sim.registered_on > citizen.date_of_birth
