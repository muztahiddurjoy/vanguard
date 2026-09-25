def test_health_reports_the_registry_size(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "citizens": 40}
