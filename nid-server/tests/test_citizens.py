import pytest

MOYURI = "4613802741"
JALAL = "2854106397"
ABDUL_HAMID = "19668517341000562"
NURJAHAN = "7302619845"
SOHEL = "5519273046"
ABDUL_MALEK = "3712580936"
KARIM = "19618514962000317"
RAHIMA_KHATUN = "2967405183"
RAFIQUL = "5830192746"
SHIRIN_AKTER = "9105374628"
JAMAL = "4287659013"


def nids(citizens):
    return [c["nid"] for c in citizens]


def test_get_citizen_returns_the_full_record(client):
    r = client.get(f"/v1/citizens/{MOYURI}")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == {"en": "Moyuri Akter", "bn": "ময়ূরী আক্তার"}
    assert body["gender"] == "female"
    assert body["date_of_birth"] == "1997-02-14"
    assert body["father"] == {
        "name": {"en": "Abdul Hamid", "bn": "আব্দুল হামিদ"},
        "nid": ABDUL_HAMID,
    }
    assert body["spouse"]["nid"] == JALAL
    assert body["permanent_address"]["village"]["en"] == "Shyampur"
    assert body["permanent_address"]["upazila"]["en"] == "Pirgachha"
    assert body["present_address"]["district"] == {"en": "Rangpur", "bn": "রংপুর"}
    assert body["sims"] == [
        {"msisdn": "01712345318", "operator": "Grameenphone", "registered_on": "2016-04-12"}
    ]


@pytest.mark.parametrize("formatted", ["4613 802 741", "4613-8027-41", "৪৬১৩৮০২৭৪১"])
def test_get_citizen_accepts_formatted_nids(client, formatted):
    r = client.get(f"/v1/citizens/{formatted}")
    assert r.status_code == 200
    assert r.json()["nid"] == MOYURI


def test_old_format_nid_is_served(client):
    r = client.get(f"/v1/citizens/{KARIM}")
    assert r.status_code == 200
    assert r.json()["name"]["en"] == "Md. Abdul Karim"


@pytest.mark.parametrize("nid", ["1234567890", "not-a-nid"])
def test_unknown_nid_is_404(client, nid):
    r = client.get(f"/v1/citizens/{nid}")
    assert r.status_code == 404
    assert r.json() == {"detail": "No citizen with that NID"}


def test_family_of_a_karim_child(client):
    r = client.get(f"/v1/citizens/{JAMAL}/family")
    assert r.status_code == 200
    family = r.json()
    assert family["father"]["nid"] == KARIM
    assert family["mother"]["nid"] == RAHIMA_KHATUN
    assert family["spouse"] is None
    assert nids(family["siblings"]) == [RAFIQUL, SHIRIN_AKTER]  # eldest first
    assert family["children"] == []


def test_family_of_the_karim_parents(client):
    family = client.get(f"/v1/citizens/{KARIM}/family").json()
    assert family["spouse"]["nid"] == RAHIMA_KHATUN
    assert nids(family["children"]) == [RAFIQUL, SHIRIN_AKTER, JAMAL]
    assert family["father"] is None  # his parents are not registered
    assert family["siblings"] == []

    mother = client.get(f"/v1/citizens/{RAHIMA_KHATUN}/family").json()
    assert mother["spouse"]["nid"] == KARIM
    assert nids(mother["children"]) == [RAFIQUL, SHIRIN_AKTER, JAMAL]


def test_family_of_moyuri(client):
    family = client.get(f"/v1/citizens/{MOYURI}/family").json()
    assert family["spouse"]["nid"] == JALAL
    assert family["spouse"]["name"]["en"] == "Jalal Uddin"
    assert len(family["spouse"]["sims"]) == 2
    assert family["father"]["nid"] == ABDUL_HAMID
    assert family["mother"]["nid"] == NURJAHAN
    assert nids(family["siblings"]) == [SOHEL]
    assert family["children"] == []

    husband = client.get(f"/v1/citizens/{JALAL}/family").json()
    assert husband["spouse"]["nid"] == MOYURI


def test_unregistered_parent_is_null(client):
    family = client.get(f"/v1/citizens/{ABDUL_MALEK}/family").json()
    assert family["father"] is None
    assert family["mother"] is None
    assert family["spouse"]["name"]["en"] == "Monowara Begum"

    record = client.get(f"/v1/citizens/{ABDUL_MALEK}").json()
    assert record["father"] == {"name": {"en": "Abdul Kader", "bn": "আব্দুল কাদের"}, "nid": None}


def test_family_of_unknown_nid_is_404(client):
    r = client.get("/v1/citizens/1234567890/family")
    assert r.status_code == 404
    assert r.json() == {"detail": "No citizen with that NID"}
