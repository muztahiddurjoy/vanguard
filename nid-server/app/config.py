"""Application settings, read from the environment (and `.env` in development)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DATA_FILE = Path(__file__).resolve().parent / "data" / "citizens.json"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "NID Registry"
    environment: str = "development"
    # Shared key the calling backend sends as X-API-Key. Empty disables the check,
    # which is only allowed outside production.
    nid_api_key: str = ""
    # rapidfuzz token_sort_ratio (0-100) a name must reach to count as the same name.
    name_match_threshold: float = 85.0
    data_file: Path = DEFAULT_DATA_FILE


@lru_cache
def get_settings() -> Settings:
    return Settings()
