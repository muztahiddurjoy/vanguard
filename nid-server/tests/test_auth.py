import pytest
from fastapi.testclient import TestClient

MOYURI = "4613802741"
UNAUTHORIZED = {"detail": "Missing or invalid API key"}


@pytest.fixture
def secured(app_with):
    with TestClient(app_with(nid_api_key="s3cret-key")) as c:
        yield c


@pytest.mark.parametrize("headers", [{}, {"X-API-Key": "wrong"}, {"X-API-Key": ""}])
def test_v1_routes_need_the_key(secured, headers):
    for method, path, body in (
        ("GET", f"/v1/citizens/{MOYURI}", None),
        ("GET", f"/v1/citizens/{MOYURI}/family", None),
        ("GET", "/v1/sims/01712345318", None),
        ("POST", "/v1/citizens/match", {"name": "x", "district": "a", "father_name": "b"}),
    ):
        r = secured.request(method, path, headers=headers, json=body)
        assert r.status_code == 401, path
        assert r.json() == UNAUTHORIZED


def test_the_right_key_is_accepted(secured):
    r = secured.get(f"/v1/citizens/{MOYURI}", headers={"X-API-Key": "s3cret-key"})
    assert r.status_code == 200
    assert r.json()["nid"] == MOYURI


def test_health_stays_open(secured):
    assert secured.get("/health").status_code == 200


def test_no_key_configured_means_open_in_development(client):
    assert client.get(f"/v1/citizens/{MOYURI}").status_code == 200


def test_production_refuses_to_start_without_a_key(app_with):
    app = app_with(environment="production", nid_api_key="")
    with pytest.raises(RuntimeError, match="NID_API_KEY"), TestClient(app):
        pass


def test_production_starts_with_a_key(app_with):
    app = app_with(environment="production", nid_api_key="k")
    with TestClient(app) as c:
        assert c.get("/health").status_code == 200
