from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEMO_ORG = "demo-org"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://jev:jev@localhost:5432/jev"
    redis_url: str = "redis://localhost:6379/0"

    github_app_id: str = ""
    github_app_slug: str = ""
    github_private_key: str = ""
    github_webhook_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    session_secret: str = "dev-only-change-me"

    decision_backend: str = "jev"  # jev | anthropic
    typesafe_api_key: str = ""
    jev_base_url: str = "https://api.typesafe.ai"
    jev_model: str = "jev-1.13.0"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-5-5"

    public_url: str = "http://localhost:8000"
    dashboard_url: str = "http://localhost:3000"
    dry_run: bool = False
    cron_secret: str = ""  # Vercel cron sends "Authorization: Bearer $CRON_SECRET" (demo reset)
    demo_mode: bool = False  # DEMO_MODE=true: sign in as "demo", no GitHub calls, every action dry-run
    backfill_limit: int = 500
    retention_days: int = 365

    @field_validator("github_private_key")
    @classmethod
    def _unescape(cls, v: str) -> str:
        return v.replace("\\n", "\n")


settings = Settings()
