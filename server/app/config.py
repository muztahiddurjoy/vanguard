"""Application settings, read from the environment (and `.env` in development)."""

from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "DLAS Backend"
    environment: str = "development"
    database_url: str = "sqlite:///./dlas.db"
    cors_origins: str = "http://localhost:5173"
    # Shared bearer token for the dashboard and UDC clients. Empty disables the check.
    api_token: str = ""

    # Secret key for hashing National ID numbers. Must be set (and kept) in production.
    nid_hash_key: str = "dev-only-nid-key"

    office_district: str = "Rangpur"
    timezone: str = "Asia/Dhaka"

    # Claude. The SDK also reads ANTHROPIC_API_KEY itself; we only need to know
    # whether one is configured so agents can fall back to their rule-based path.
    anthropic_api_key: str = ""
    llm_model: str = "claude-opus-5"
    llm_timeout_seconds: float = 60.0

    public_base_url: str = "http://localhost:8000"
    twilio_auth_token: str = ""
    twilio_validate_signatures: bool = False

    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""
    elevenlabs_model_id: str = "eleven_flash_v2_5"
    elevenlabs_ws_base: str = "wss://api.elevenlabs.io"

    adnsms_api_key: str = ""
    adnsms_api_secret: str = ""
    adnsms_base_url: str = "https://portal.adnsms.com"
    sms_dry_run: bool = True

    upload_dir: str = "./uploads"

    # T1 alert thresholds
    lawyer_inactivity_days: int = 14
    # T2: a case referred this many times (or bounced back to an office it
    # already left) is escalated instead of being passed on again.
    referral_escalation_hops: int = 2

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)

    @property
    def llm_enabled(self) -> bool:
        return bool(self.anthropic_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
