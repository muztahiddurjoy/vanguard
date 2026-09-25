"""Optional model access for the agents: Claude or OpenAI (``LLM_PROVIDER``).

Every agent works without it: the rule-based path is the default, and the
model is consulted only where rules are weak (ambiguous narratives, free-form
drafting, reading scanned documents). Any failure (no key, network, refusal,
invalid output) returns ``None`` and the agent carries on with its rules.

Agents pass content in Anthropic's block format (text, base64 ``image`` and
``document`` blocks); the OpenAI adapter converts it.
"""

import logging
from typing import Any, Literal, Protocol, TypeVar

import anthropic
import openai
import pydantic
from pydantic import BaseModel

from app.config import get_settings

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)
Effort = Literal["low", "medium", "high", "xhigh", "max"]

# Server-side refusal fallback: a declined request is re-run on Anthropic's
# recommended fallback model inside the same call.
FALLBACK_BETA = "server-side-fallback-2026-07-01"


class StructuredLLM(Protocol):
    def structured(
        self,
        *,
        system: str,
        content: str | list[dict[str, Any]],
        schema: type[T],
        effort: Effort = "low",
        max_tokens: int = 4000,
    ) -> T | None: ...


class ClaudeLLM:
    def __init__(self, client: anthropic.Anthropic | None = None, model: str | None = None):
        settings = get_settings()
        self.model = model or settings.llm_model
        self.client = client or anthropic.Anthropic(
            api_key=settings.anthropic_api_key or None,
            timeout=settings.llm_timeout_seconds,
            max_retries=2,
        )

    def structured(
        self,
        *,
        system: str,
        content: str | list[dict[str, Any]],
        schema: type[T],
        effort: Effort = "low",
        max_tokens: int = 4000,
    ) -> T | None:
        try:
            response = self.client.beta.messages.parse(
                model=self.model,
                max_tokens=max_tokens,
                betas=[FALLBACK_BETA],
                fallbacks="default",
                output_config={"effort": effort},
                output_format=schema,
                system=system,
                messages=[{"role": "user", "content": content}],  # type: ignore[typeddict-item]
            )
        except anthropic.BadRequestError as exc:
            log.error("Claude rejected the request (%s): %s", exc.status_code, exc.message)
            return None
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
            log.error("Claude credentials rejected: %s", exc.message)
            return None
        except anthropic.RateLimitError:
            log.warning("Claude rate limited; using rule-based result")
            return None
        except anthropic.APIStatusError as exc:
            log.warning("Claude API error %s; using rule-based result", exc.status_code)
            return None
        except anthropic.APIConnectionError as exc:
            log.warning("Claude unreachable (%s); using rule-based result", exc)
            return None

        if response.stop_reason == "refusal":
            category = response.stop_details.category if response.stop_details else None
            log.warning("Claude declined (category=%s); using rule-based result", category)
            return None
        if response.stop_reason == "max_tokens":
            log.warning("Claude output hit max_tokens; using rule-based result")
            return None
        return response.parsed_output


def openai_content(content: str | list[dict[str, Any]]) -> str | list[dict[str, Any]]:
    """Anthropic-style content blocks as Responses API input parts."""
    if isinstance(content, str):
        return content
    parts: list[dict[str, Any]] = []
    for block in content:
        kind = block.get("type")
        if kind == "text":
            parts.append({"type": "input_text", "text": block["text"]})
        elif kind in ("image", "document"):
            source = block["source"]
            data_url = f"data:{source['media_type']};base64,{source['data']}"
            if kind == "image":
                # Documents are read word for word, so the model gets full resolution.
                parts.append({"type": "input_image", "image_url": data_url, "detail": "high"})
            else:
                parts.append(
                    {"type": "input_file", "filename": "document.pdf", "file_data": data_url}
                )
        else:
            raise ValueError(f"Unsupported content block type: {kind!r}")
    return parts


class OpenAILLM:
    def __init__(self, client: openai.OpenAI | None = None, model: str | None = None):
        settings = get_settings()
        self.model = model or settings.openai_model
        self.client = client or openai.OpenAI(
            api_key=settings.openai_api_key or None,
            timeout=settings.llm_timeout_seconds,
            max_retries=2,
        )

    def structured(
        self,
        *,
        system: str,
        content: str | list[dict[str, Any]],
        schema: type[T],
        effort: Effort = "low",
        max_tokens: int = 4000,
    ) -> T | None:
        message: dict[str, Any] = {"role": "user", "content": openai_content(content)}
        try:
            response = self.client.responses.parse(
                model=self.model,
                instructions=system,
                input=[message],  # type: ignore[list-item]
                text_format=schema,
                reasoning={"effort": effort},
                # Includes reasoning tokens.
                max_output_tokens=max_tokens,
                # Applications carry personal and sensitive details: nothing is kept.
                store=False,
            )
        except openai.BadRequestError as exc:
            log.error("OpenAI rejected the request (%s): %s", exc.status_code, exc.message)
            return None
        except (openai.AuthenticationError, openai.PermissionDeniedError) as exc:
            log.error("OpenAI credentials rejected: %s", exc.message)
            return None
        except openai.RateLimitError:
            log.warning("OpenAI rate limited; using rule-based result")
            return None
        except openai.APIStatusError as exc:
            log.warning("OpenAI API error %s; using rule-based result", exc.status_code)
            return None
        except openai.APIConnectionError as exc:
            log.warning("OpenAI unreachable (%s); using rule-based result", exc)
            return None
        except pydantic.ValidationError:
            # Truncated or malformed JSON despite the schema.
            log.warning("OpenAI output did not match the schema; using rule-based result")
            return None

        if response.status == "incomplete":
            reason = response.incomplete_details.reason if response.incomplete_details else None
            log.warning("OpenAI response incomplete (%s); using rule-based result", reason)
            return None
        parsed = response.output_parsed
        if parsed is None:
            log.warning("OpenAI declined or returned no answer; using rule-based result")
        return parsed


_default: StructuredLLM | None = None


def default_llm() -> StructuredLLM | None:
    """The shared client for LLM_PROVIDER when that provider's key is set, else None."""
    global _default
    settings = get_settings()
    if not settings.llm_enabled:
        return None
    if _default is None:
        _default = OpenAILLM() if settings.llm_provider == "openai" else ClaudeLLM()
    return _default
