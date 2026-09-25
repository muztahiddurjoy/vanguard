"""State shapes for the LangGraph workflows.

Nodes return partial updates; LangGraph merges them key by key (last write
wins, as no key here declares a reducer).
"""

from typing import Any, Literal, TypedDict

AgentKey = Literal["intake", "risk", "safety", "jurisdiction"]
Weight = Literal["high", "medium", "low"]


class TriageFactor(TypedDict):
    """Same shape as the dashboard's TriageFactor."""

    key: str
    detected: bool
    agent: AgentKey
    weight: Weight
    evidence: str | None


class TriageState(TypedDict, total=False):
    # Input
    text: str
    channel: str
    district: str | None
    office_district: str
    is_proxy: bool
    safety_level: str
    next_hearing_days: int | None
    has_respondent: bool
    # Categorization
    category: str | None
    category_confidence: float
    category_source: Literal["rules", "llm"]
    # Compliance + urgency
    factors: list[TriageFactor]
    compliance_notes: list[str]
    recommended_safety_level: str
    priority: str
    confidence: float
    rationale: dict[str, str]
    # Advice, mediation or sensitive: a mark for the officer, never a decision.
    track: str
    track_reason: dict[str, str]
    track_source: Literal["rules", "llm"]


class IntakeState(TypedDict, total=False):
    channel: str  # "hotline_16699" | "udc" | "web"
    language: Literal["bn", "en"]
    # Caller ID on phone calls, 01XXXXXXXXX.
    caller_phone: str | None
    # The caller's latest utterance (speech-to-text or typed).
    utterance: str
    # Collected answers, keyed by slot name.
    slots: dict[str, Any]
    # Everything the caller said: [{"at", "topic", "text"}]; kept as the case's call notes.
    notes: list[dict[str, str]]
    # The slot we last asked about, so a bare answer ("Rangpur") fills it.
    asking: str | None
    turns: int
    # NID checks: "pending" | "verified" | "failed" | "unavailable" for the caller;
    # the applicant and respondent statuses add "unverified", "not_found", "none", ...
    identity: str
    verify_attempts: int
    applicant_status: str
    respondent_status: str
    # Registry records (Citizen as JSON) once matched.
    caller_record: dict[str, Any]
    applicant_record: dict[str, Any]
    respondent_record: dict[str, Any]
    caller_sim_registered: bool
    # Said before the next question, e.g. "Your identity is confirmed."
    ack: str
    # What to say next, and whether the conversation is finished.
    reply: str
    complete: bool
    # Set when the caller signals danger; the call is routed to a person.
    emergency: bool
    # Set when the caller may be held by someone: never call or text them back.
    hostage: bool


class DocumentState(TypedDict, total=False):
    category: str | None
    # [{"id", "kind", "filename", "content_type", "text", "data_b64"}]
    documents: list[dict[str, Any]]
    # Per-document results: {"id": {"text", "summary", "kind", "status"}}
    results: dict[str, dict[str, Any]]
    # [{"key", "label", "label_bn", "required", "status", "document_id"}]
    checklist: list[dict[str, Any]]
    missing: list[str]


class SettlementState(TypedDict, total=False):
    case_ref: str
    category: str | None
    parties: list[dict[str, Any]]  # [{"id", "name", "role"}]
    terms: list[str]
    language: Literal["bn", "en"]
    risk_flags: list[str]
    # Officer confirmed safety despite recorded violence (audited by the router).
    risk_acknowledged: bool
    draft: str
    draft_source: Literal["template", "llm"]
    issues: list[str]
    ready_for_review: bool
