"""The Claude helper against the real Anthropic SDK, with a mocked HTTP transport."""

import json

import anthropic
import httpx2

from app.agents.llm import FALLBACK_BETA, ClaudeLLM
from app.agents.t8_triage import LLMCategory


def message(content_text: str | None, stop_reason: str = "end_turn", **extra) -> dict:
    return {
        "id": "msg_1",
        "type": "message",
        "role": "assistant",
        "model": "claude-opus-5",
        "content": [{"type": "text", "text": content_text}] if content_text is not None else [],
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {"input_tokens": 10, "output_tokens": 5},
        **extra,
    }


def llm_with(handler) -> ClaudeLLM:
    client = anthropic.Anthropic(
        api_key="test-key",
        max_retries=0,
        http_client=anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(handler)),
    )
    return ClaudeLLM(client=client, model="claude-opus-5")


def test_structured_request_shape_and_parsed_result():
    seen: dict = {}

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen["beta"] = request.headers.get("anthropic-beta")
        seen["body"] = json.loads(request.content)
        return httpx2.Response(200, json=message('{"category": "landDispute", "confidence": 0.9}'))

    result = llm_with(handler).structured(
        system="Categorize.", content="জমি দখল করেছে", schema=LLMCategory
    )
    assert result == LLMCategory(category="landDispute", confidence=0.9)
    body = seen["body"]
    assert FALLBACK_BETA in seen["beta"]
    assert body["fallbacks"] == "default"
    assert body["model"] == "claude-opus-5"
    assert body["output_config"]["effort"] == "low"
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert body["messages"] == [{"role": "user", "content": "জমি দখল করেছে"}]


def test_refusal_returns_none():
    def handler(request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(
            200,
            json=message(
                None,
                stop_reason="refusal",
                stop_details={"type": "refusal", "category": None, "explanation": None},
            ),
        )

    assert llm_with(handler).structured(system="x", content="y", schema=LLMCategory) is None


def test_api_errors_return_none():
    for status in (400, 401, 429, 500):

        def handler(request: httpx2.Request, status=status) -> httpx2.Response:
            return httpx2.Response(
                status, json={"type": "error", "error": {"type": "api_error", "message": "nope"}}
            )

        assert llm_with(handler).structured(system="x", content="y", schema=LLMCategory) is None


def test_connection_error_returns_none():
    def handler(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("offline")

    assert llm_with(handler).structured(system="x", content="y", schema=LLMCategory) is None
