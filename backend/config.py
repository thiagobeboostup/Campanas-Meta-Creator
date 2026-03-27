from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Meta Ads
    meta_app_id: str = ""
    meta_app_secret: str = ""
    meta_access_token: str = ""

    # Google Drive
    google_service_account_file: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""

    # Claude API
    anthropic_api_key: str = ""

    # App
    encryption_key: str = ""
    database_url: str = "sqlite+aiosqlite:///./meta_ads_builder.db"
    cors_origins: str = "http://localhost:5173"
    storage_path: str = "./storage"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
