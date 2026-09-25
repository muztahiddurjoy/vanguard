"""Optional Claude access for the agents.

Every agent works without it: the rule-based path is the default, and Claude
is consulted only where rules are weak (ambiguous narratives, free-form
drafting, reading scanned documents). Any failure (no key, network, refusal,
invalid output) returns ``None`` and the agent carries on with its rules.
"""

import logging
from typing import Any, Literal, Protocol, TypeVar

import anthropic
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


_default: StructuredLLM | None = None


def default_llm() -> StructuredLLM | None:
    """The shared Claude client when ANTHROPIC_API_KEY is set, else None."""
    global _default
    if not get_settings().llm_enabled:
        return None
    if _default is None:
        _default = ClaudeLLM()
    return _default
