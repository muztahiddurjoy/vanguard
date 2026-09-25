"""The model helpers against the real Anthropic and OpenAI SDKs, with mocked HTTP transports."""

import json

import anthropic
import httpx2
import openai

from app.agents.llm import FALLBACK_BETA, ClaudeLLM, OpenAILLM, default_llm
from app.agents.t8_triage import LLMCategory
from app.config import get_settings


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


# --- OpenAI -----------------------------------------------------------------------------


def openai_response(text: str | None, status: str = "completed", **extra) -> dict:
    content = [{"type": "output_text", "text": text, "annotations": []}] if text is not None else []
    return {
        "id": "resp_1",
        "object": "response",
        "created_at": 1790000000,
        "model": "gpt-6-luna",
        "status": status,
        "output": [
            {
                "type": "message",
                "id": "msg_1",
                "role": "assistant",
                "status": status,
                "content": content,
            }
        ],
        "parallel_tool_calls": True,
        "tool_choice": "auto",
        "tools": [],
        **extra,
    }


def openai_llm_with(handler) -> OpenAILLM:
    client = openai.OpenAI(
        api_key="test-key",
        max_retries=0,
        http_client=openai.DefaultHttpxClient(transport=httpx2.MockTransport(handler)),
    )
    return OpenAILLM(client=client, model="gpt-6-luna")


def test_openai_request_shape_and_parsed_result():
    seen: dict = {}

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen["path"] = request.url.path
        seen["body"] = json.loads(request.content)
        return httpx2.Response(
            200, json=openai_response('{"category": "landDispute", "confidence": 0.9}')
        )

    result = openai_llm_with(handler).structured(
        system="Categorize.", content="জমি দখল করেছে", schema=LLMCategory
    )
    assert result == LLMCategory(category="landDispute", confidence=0.9)
    body = seen["body"]
    assert seen["path"] == "/v1/responses"
    assert body["model"] == "gpt-6-luna"
    assert body["instructions"] == "Categorize."
    assert body["input"] == [{"role": "user", "content": "জমি দখল করেছে"}]
    assert body["reasoning"] == {"effort": "low"}
    assert body["store"] is False
    assert body["max_output_tokens"] == 4000
    fmt = body["text"]["format"]
    assert fmt["type"] == "json_schema" and fmt["strict"] is True


def test_openai_converts_document_and_image_blocks():
    seen: dict = {}

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen["body"] = json.loads(request.content)
        return httpx2.Response(
            200, json=openai_response('{"category": "other", "confidence": 0.2}')
        )

    source = {"type": "base64", "media_type": "application/pdf", "data": "JVBERi0="}
    openai_llm_with(handler).structured(
        system="Read.",
        content=[
            {"type": "document", "source": source},
            {"type": "image", "source": {**source, "media_type": "image/jpeg", "data": "/9j/"}},
            {"type": "text", "text": "Read this document."},
        ],
        schema=LLMCategory,
    )
    assert seen["body"]["input"][0]["content"] == [
        {
            "type": "input_file",
            "filename": "document.pdf",
            "file_data": "data:application/pdf;base64,JVBERi0=",
        },
        {"type": "input_image", "image_url": "data:image/jpeg;base64,/9j/", "detail": "high"},
        {"type": "input_text", "text": "Read this document."},
    ]


def test_openai_refusal_incomplete_and_bad_json_return_none():
    refusal = openai_response(None)
    refusal["output"][0]["content"] = [{"type": "refusal", "refusal": "I can't help with that."}]
    for payload in (
        refusal,
        openai_response(
            '{"category": "oth',
            status="incomplete",
            incomplete_details={"reason": "max_output_tokens"},
        ),
        openai_response('{"category": "notACategory", "confidence": 1}'),
    ):

        def handler(request: httpx2.Request, payload=payload) -> httpx2.Response:
            return httpx2.Response(200, json=payload)

        assert (
            openai_llm_with(handler).structured(system="x", content="y", schema=LLMCategory) is None
        )


def test_openai_api_and_connection_errors_return_none():
    for status in (400, 401, 403, 429, 500):

        def handler(request: httpx2.Request, status=status) -> httpx2.Response:
            return httpx2.Response(
                status, json={"error": {"message": "nope", "type": "invalid_request_error"}}
            )

        assert (
            openai_llm_with(handler).structured(system="x", content="y", schema=LLMCategory) is None
        )

    def offline(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("offline")

    assert openai_llm_with(offline).structured(system="x", content="y", schema=LLMCategory) is None


def test_default_llm_follows_the_provider(monkeypatch):
    from app.agents import llm as llm_module

    s = get_settings()
    monkeypatch.setattr(llm_module, "_default", None)
    monkeypatch.setattr(s, "llm_provider", "openai")
    assert default_llm() is None  # no OpenAI key yet
    monkeypatch.setattr(s, "openai_api_key", "sk-test")
    assert isinstance(default_llm(), OpenAILLM)

    monkeypatch.setattr(llm_module, "_default", None)
    monkeypatch.setattr(s, "llm_provider", "anthropic")
    assert default_llm() is None  # an OpenAI key alone does not enable Claude
    monkeypatch.setattr(s, "anthropic_api_key", "sk-ant-test")
    assert isinstance(default_llm(), ClaudeLLM)
