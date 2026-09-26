"""Application settings, read from the environment (and `.env` in development)."""

from functools import lru_cache
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "DLAS Backend"
    environment: str = "development"
    database_url: str = "sqlite:///./dlas.db"
    # The DLAO, panel lawyers', court and prison dashboards.
    cors_origins: str = (
        "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176"
    )
    # Shared bearer token for the dashboard and UDC clients. Empty disables the check.
    api_token: str = ""
    # The app's own log lines. DEBUG also shows what callers said and the replies:
    # sensitive, for local testing only.
    log_level: str = "INFO"

    # Secret key for hashing National ID numbers. Must be set (and kept) in production.
    nid_hash_key: str = "dev-only-nid-key"

    office_district: str = "Rangpur"
    timezone: str = "Asia/Dhaka"

    # Which model the agents consult: Claude ("anthropic") or OpenAI ("openai").
    # Without the chosen provider's key, the agents stay rule-based.
    llm_provider: Literal["anthropic", "openai"] = "anthropic"
    llm_timeout_seconds: float = 60.0

    # Claude. The SDK also reads ANTHROPIC_API_KEY itself; we only need to know
    # whether one is configured so agents can fall back to their rule-based path.
    anthropic_api_key: str = ""
    llm_model: str = "claude-opus-5"

    # OpenAI: the agents' model when LLM_PROVIDER=openai, and live speech-to-text
    # for the phone lines whenever a key is set.
    openai_api_key: str = ""
    openai_model: str = "gpt-6-luna"
    openai_stt_model: str = "gpt-live-transcribe"
    # "minimal" | "low" | "medium" | "high" | "xhigh": earlier text or a more accurate one.
    openai_stt_delay: str = "low"
    openai_realtime_url: str = "wss://api.openai.com/v1/realtime?intent=transcription"

    # Our own voice activity detection on call audio (gpt-live-transcribe has none).
    # A turn ends after this much silence; while the caller is telling what happened
    # (before any question), after the longer pause, since a story has pauses in it.
    stt_end_of_turn_ms: int = 700
    stt_story_end_of_turn_ms: int = 1200
    # Loudness (RMS of 16-bit samples) below which audio never counts as speech.
    # Raise it if line noise interrupts the replies; lower it for quiet callers.
    stt_min_speech_rms: int = 500

    public_base_url: str = "http://localhost:8000"
    twilio_auth_token: str = ""
    twilio_validate_signatures: bool = False

    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""
    # Must speak the line's language: eleven_v3 has Bangla; the flash and turbo
    # models do not (they read Bangla script with a Hindi accent).
    elevenlabs_model_id: str = "eleven_v3"
    elevenlabs_base_url: str = "https://api.elevenlabs.io"
    # A reply with no audio after this long is requested again (0 turns it off).
    elevenlabs_first_audio_timeout_s: float = 2.5
    # How much faster than generated the line speaks, at the same pitch. Done on our
    # side (services.audio.TempoChanger): eleven_v3 ignores ElevenLabs' own speed.
    voice_speed: float = Field(default=1.2, ge=0.5, le=2.0)
    # Audio held back at the start of each reply so the line plays it without gaps
    # (eleven_v3 streams in bursts). 0 sends audio as it comes.
    voice_start_buffer_s: float = Field(default=0.6, ge=0.0, le=3.0)

    adnsms_api_key: str = ""
    adnsms_api_secret: str = ""
    adnsms_base_url: str = "https://portal.adnsms.com"
    sms_dry_run: bool = True
    # Comma-separated numbers. When set, only these get real SMS; any other
    # number is a dry run. For testing with the dummy NID registry, whose
    # fictional numbers may belong to real subscribers.
    sms_allowlist: str = ""

    upload_dir: str = "./uploads"

    # The NID registry (nid-server/). Empty: callers cannot be verified by phone
    # and applications are recorded as unverified.
    nid_server_url: str = ""
    nid_server_api_key: str = ""

    # The AI query helpline printed in SMS: point it at the number whose Twilio
    # voice webhook is /telephony/voice?line=helpline.
    helpline_number: str = "16430"

    # T1 alert thresholds: a panel lawyer reports at least this often, and within
    # HEARING_REPORT_HOURS of each hearing.
    lawyer_inactivity_days: int = 14
    hearing_report_hours: int = 72
    # T2: a case referred this many times (or bounced back to an office it
    # already left) is escalated instead of being passed on again.
    referral_escalation_hops: int = 2

    # Mediation: a party who misses this many sessions in a row is looked for
    # through their Union Digital Centre, which is sent the next date.
    mediation_no_show_limit: int = Field(default=2, ge=1, le=10)
    # How long a court's or jail's e-KYC check can be used for an application.
    ekyc_check_valid_minutes: int = Field(default=120, ge=5, le=24 * 60)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def sms_allowlist_numbers(self) -> set[str]:
        from app.services.adnsms import normalize_bd_mobile

        return {normalize_bd_mobile(n) for n in self.sms_allowlist.split(",") if n.strip()}

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)

    @property
    def llm_enabled(self) -> bool:
        if self.llm_provider == "openai":
            return bool(self.openai_api_key)
        return bool(self.anthropic_api_key)

    @property
    def stt_enabled(self) -> bool:
        return bool(self.openai_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
