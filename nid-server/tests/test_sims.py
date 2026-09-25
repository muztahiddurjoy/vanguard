import pytest

MOYURI = "4613802741"
RAHIMA_BEGUM = "6390284417"


@pytest.mark.parametrize(
    "msisdn",
    ["01712345318", "+8801712345318", "8801712345318", "+880 1712-345318", "1712345318"],
)
def test_sim_lookup_accepts_common_formats(client, msisdn):
    r = client.get(f"/v1/sims/{msisdn}")
    assert r.status_code == 200
    assert r.json() == {
        "msisdn": "01712345318",
        "nid": MOYURI,
        "operator": "Grameenphone",
        "registered_on": "2016-04-12",
    }


def test_shared_household_phone_resolves_to_its_registered_owner(client):
    # Rohima Begum called from this phone, but it is registered to Rahima Begum.
    r = client.get("/v1/sims/01713554482")
    assert r.status_code == 200
    assert r.json()["nid"] == RAHIMA_BEGUM


@pytest.mark.parametrize("msisdn", ["01799999999", "01212345678", "12345", "not-a-number"])
def test_unknown_or_invalid_sim_is_404(client, msisdn):
    r = client.get(f"/v1/sims/{msisdn}")
    assert r.status_code == 404
    assert r.json() == {"detail": "SIM not registered"}
