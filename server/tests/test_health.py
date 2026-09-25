def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["llm"] is False
    assert r.json()["llm_provider"] == "anthropic"
    assert r.json()["speech_to_text"] is False
