import pytest

MOYURI = "4613802741"
KARIM = "19618514962000317"
YOUNGER_ABDUL_KARIM = "3065817294"
RAFIQUL = "5830192746"
RAHIMA_BEGUM = "6390284417"
ROHIMA_BEGUM = "8524179052"
ANWAR = "7025846193"

TOO_FEW = {"detail": "Give at least two details besides the name"}


def match(client, **body):
    r = client.post("/v1/citizens/match", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def matched_nids(result):
    return [m["citizen"]["nid"] for m in result["matches"]]


def test_self_verification_matches_uniquely(client):
    result = match(
        client,
        name="Moyuri Akter",
        father_name="Abdul Hamid",
        permanent_district="Rangpur",
        date_of_birth="1997-02-14",
    )
    assert result["unique"] is True
    [only] = result["matches"]
    assert only["citizen"]["nid"] == MOYURI
    assert only["citizen"]["sims"][0]["msisdn"] == "01712345318"
    assert only["score"] == 100.0
    assert only["matched"] == ["name", "father_name", "date_of_birth", "permanent_district"]


def test_bangla_names_match(client):
    result = match(client, name="ময়ূরী আক্তার", father_name="আব্দুল হামিদ", district="রংপুর")
    assert result["unique"] is True
    assert matched_nids(result) == [MOYURI]


def test_bangla_precomposed_ya_matches_the_decomposed_spelling(client):
    # U+09DF (precomposed য়) and U+09AF U+09BC are the same letter after NFC.
    result = match(client, name="ময়ূরী আক্তার", father_name="আব্দুল হামিদ", district="রংপুর")
    assert matched_nids(result) == [MOYURI]


@pytest.mark.parametrize(
    "name",
    [
        "Mohammad Abdul Karim",
        "Md Abdul Karim",
        "MD. ABDUL KARIM",
        "মোহাম্মদ আব্দুল করিম",
        "মো: আব্দুল করিম",
    ],
)
def test_honorific_variants_match(client, name):
    result = match(client, name=name, date_of_birth="1961-04-10", permanent_district="Rangpur")
    assert result["unique"] is True
    assert matched_nids(result) == [KARIM]
    assert result["matches"][0]["score"] == 100.0


def test_late_marker_on_a_parent_is_ignored(client):
    result = match(client, name="Abdul Malek", father_name="Late Abdul Kader", district="Rangpur")
    assert result["unique"] is True
    assert result["matches"][0]["citizen"]["nid"].endswith("0936")

    bangla = match(client, name="আব্দুল মালেক", father_name="মৃত আব্দুল কাদের", district="রংপুর")
    assert matched_nids(bangla) == matched_nids(result)


def test_one_letter_typo_matches_with_a_lower_score(client):
    result = match(
        client, name="Rafikul Islam", mother_name="Rahima Khatun", date_of_birth="1987-01-15"
    )
    assert result["unique"] is True
    [only] = result["matches"]
    assert only["citizen"]["nid"] == RAFIQUL
    assert 85 <= only["score"] < 100


def test_wrong_date_of_birth_does_not_match(client):
    result = match(
        client,
        name="Moyuri Akter",
        father_name="Abdul Hamid",
        permanent_district="Rangpur",
        date_of_birth="1997-02-15",
    )
    assert result == {"matches": [], "unique": False}


def test_wrong_father_does_not_match(client):
    result = match(
        client, name="Moyuri Akter", father_name="Abdul Kader", date_of_birth="1997-02-14"
    )
    assert result["matches"] == []


@pytest.mark.parametrize(
    "extra",
    [
        {},
        {"district": "Rangpur"},
        {"father_name": "Abdul Hamid"},
        {"date_of_birth": "1997-02-14", "father_name": "   "},
        {"district": "Rangpur", "mother_name": None, "permanent_district": ""},
    ],
)
def test_name_with_fewer_than_two_details_is_refused(client, extra):
    r = client.post("/v1/citizens/match", json={"name": "Moyuri Akter", **extra})
    assert r.status_code == 422
    assert r.json() == TOO_FEW


@pytest.mark.parametrize("body", [{"district": "Rangpur"}, {"name": "", "district": "Rangpur"}])
def test_missing_or_blank_name_is_a_validation_error(client, body):
    r = client.post("/v1/citizens/match", json={**body, "date_of_birth": "1997-02-14"})
    assert r.status_code == 422


def test_limit_is_bounded(client):
    body = {"name": "Rahima Begum", "district": "Rangpur", "permanent_district": "Rangpur"}
    assert client.post("/v1/citizens/match", json={**body, "limit": 11}).status_code == 422
    assert client.post("/v1/citizens/match", json={**body, "limit": 0}).status_code == 422


def test_rahima_and_rohima_are_both_returned_and_not_unique(client):
    result = match(client, name="Rahima Begum", permanent_district="Rangpur", district="Rangpur")
    assert result["unique"] is False
    assert matched_nids(result) == [RAHIMA_BEGUM, ROHIMA_BEGUM]  # exact spelling first
    scores = [m["score"] for m in result["matches"]]
    assert scores[0] == 100.0
    assert 85 <= scores[1] < 100

    by_mother = match(client, name="Rahima Begum", mother_name="Amena Khatun", district="Rangpur")
    assert set(matched_nids(by_mother)) == {RAHIMA_BEGUM, ROHIMA_BEGUM}
    assert by_mother["unique"] is False


def test_limit_caps_the_list_but_not_uniqueness(client):
    result = match(
        client, name="Rahima Begum", permanent_district="Rangpur", district="Rangpur", limit=1
    )
    assert matched_nids(result) == [RAHIMA_BEGUM]
    assert result["unique"] is False


def test_a_date_of_birth_separates_rahima_from_rohima(client):
    result = match(client, name="Rahima Begum", district="Rangpur", date_of_birth="1999-05-06")
    assert result["unique"] is True
    assert matched_nids(result) == [ROHIMA_BEGUM]


def test_same_name_different_people(client):
    result = match(client, name="Abdul Karim", permanent_district="Rangpur", district="Rangpur")
    assert set(matched_nids(result)) == {KARIM, YOUNGER_ABDUL_KARIM}
    assert result["unique"] is False


@pytest.mark.parametrize("district", ["Chittagong", "chattogram", "চট্টগ্রাম", "Chittagong District"])
def test_district_matches_present_address_through_aliases(client, district):
    result = match(client, name="Anwar Hossain", district=district, date_of_birth="1984-09-30")
    assert matched_nids(result) == [ANWAR]


def test_permanent_district_ignores_the_present_address(client):
    # Anwar works in Chattogram; his permanent address is in Kurigram.
    result = match(
        client, name="Anwar Hossain", permanent_district="Chittagong", date_of_birth="1984-09-30"
    )
    assert result["matches"] == []
    result = match(
        client, name="Anwar Hossain", permanent_district="Kurigram", date_of_birth="1984-09-30"
    )
    assert matched_nids(result) == [ANWAR]


@pytest.mark.parametrize(
    ("alias", "name"), [("Bogra", "Farida Yasmin"), ("Rongpur", "Jahanara Parvin")]
)
def test_old_district_spellings(client, alias, name):
    result = match(client, name=name, permanent_district=alias, district=alias)
    assert result["unique"] is True
    assert result["matches"][0]["citizen"]["name"]["en"] == name


def test_names_one_letter_apart_need_another_detail(client):
    # Jamal Hossain and Kamal Hossain both live in Rangpur district.
    both = match(client, name="Jamal Hossain", permanent_district="Rangpur", district="Rangpur")
    assert [m["citizen"]["name"]["en"] for m in both["matches"]] == [
        "Jamal Hossain",
        "Kamal Hossain",
    ]
    assert both["unique"] is False

    one = match(client, name="Jamal Hossain", district="Rangpur", father_name="Md. Abdul Karim")
    assert one["unique"] is True


def test_score_is_the_mean_of_the_name_fields(client):
    result = match(
        client,
        name="Rafiqul Islam",
        father_name="Md. Abdul Karim",
        mother_name="Rahima Khatunn",
        district="Dhaka",
    )
    [only] = result["matches"]
    assert only["citizen"]["nid"] == RAFIQUL
    # name 100, father 100, mother 96.3 -> 98.8
    assert only["score"] == pytest.approx(98.8, abs=0.05)
    assert only["matched"] == ["name", "father_name", "mother_name", "district"]
