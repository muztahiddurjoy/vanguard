import json
from datetime import date

import httpx

from app.config import Settings
from app.services.nid_registry import Citizen, HttpNidRegistry


def citizen(nid: str, name: str, **kw) -> dict:
    place = {
        "village": {"en": "Shyampur", "bn": "শ্যামপুর"},
        "upazila": {"en": "Pirgachha", "bn": "পীরগাছা"},
        "district": {"en": "Rangpur", "bn": "রংপুর"},
    }
    return {
        "nid": nid,
        "name": {"en": name, "bn": name},
        "father": {"name": {"en": "Abdul Karim", "bn": "আব্দুল করিম"}, "nid": None},
        "mother": {"name": {"en": "Rahima Khatun", "bn": "রহিমা খাতুন"}, "nid": None},
        "spouse": None,
        "date_of_birth": "1994-06-02",
        "gender": "male",
        "permanent_address": place,
        "present_address": place,
        "sims": [{"msisdn": "01811223344", "operator": "Robi", "registered_on": "2019-01-05"}],
        **kw,
    }


def registry(handler) -> HttpNidRegistry:
    settings = Settings(nid_server_url="http://nid.test", nid_server_api_key="secret")
    return HttpNidRegistry(settings, http=httpx.Client(transport=httpx.MockTransport(handler)))


def test_match_sends_the_details_with_the_api_key_and_parses_citizens():
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["key"] = request.headers["X-API-Key"]
        seen["body"] = json.loads(request.content)
        match = {"citizen": citizen("4613300001", "Rafiqul Islam"), "score": 97.0}
        return httpx.Response(200, json={"matches": [match], "unique": True})

    found = registry(handler).match(
        name="Rafiqul Islam",
        father_name="Abdul Karim",
        date_of_birth=date(1994, 6, 2),
        permanent_district="Rangpur",
    )
    assert seen["url"] == "http://nid.test/v1/citizens/match"
    assert seen["key"] == "secret"
    assert seen["body"]["date_of_birth"] == "1994-06-02"
    assert found is not None and [c.nid for c in found] == ["4613300001"]
    assert found[0].phones == ["01811223344"]
    assert found[0].age_on(date(2026, 6, 1)) == 31


def test_unreachable_or_failing_registry_is_none_not_no_match():
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    def broken(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    assert registry(down).match(name="x", father_name="y", district="Rangpur") is None
    assert registry(broken).family("1") is None
    assert registry(broken).sim_owner("01811223344") is None
    assert registry(broken).citizen("1") is None


def test_family_and_sim_lookups():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/citizens/4613300001/family":
            mother = citizen("4613300000", "Rahima Khatun", gender="female")
            return httpx.Response(200, json={"mother": mother, "siblings": []})
        if request.url.path == "/v1/sims/01811223344":
            return httpx.Response(200, json={"msisdn": "01811223344", "nid": "4613300001"})
        if request.url.path == "/v1/citizens/4613300001":
            return httpx.Response(200, json=citizen("4613300001", "Rafiqul Islam"))
        return httpx.Response(404, json={"detail": "not found"})

    reg = registry(handler)
    family = reg.family("4613300001")
    assert family is not None and isinstance(family.mother, Citizen)
    assert family.mother.name.en == "Rahima Khatun" and family.father is None
    assert reg.sim_owner("01811223344") == "4613300001"
    assert reg.sim_owner("01999999999") == ""
    assert reg.family("999").siblings == []  # type: ignore[union-attr]
    owner = reg.citizen("4613300001")
    assert owner is not None and owner.name.en == "Rafiqul Islam"
    assert reg.citizen("999") is None
