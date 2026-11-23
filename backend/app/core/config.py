"""Application settings. All secrets come from environment variables / backend/.env (never committed)."""
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "CauseLine"
    environment: str = "development"  # development | production | test

    # Database: SQLite by default; set postgresql+psycopg://user:pass@host/db for Postgres/Supabase.
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'causeline.db').as_posix()}"

    # Auth
    jwt_secret: str = Field(default="", description="REQUIRED. Long random string.")
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 480
    cookie_name: str = "causeline_session"
    cookie_secure: bool = False  # set true behind HTTPS

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Uploads
    upload_dir: Path = BACKEND_DIR / "storage" / "uploads"
    max_upload_mb: int = 25

    # ML artifact locations (original packages are referenced in place, never modified)
    nlp_dir: Path = REPO_ROOT / "AI_COMPLAINT_INTELLIGENCE" / "HACKATHON_MEMBER2_NLP_HANDOVER"
    ml_dir: Path = REPO_ROOT / "ml_predictive_analytics (1)" / "ml_predictive_analytics"
    reproduced_dir: Path = REPO_ROOT / "ml_project" / "reproduced"
    enable_sbert: bool = True
    sbert_model_name: str = "all-MiniLM-L6-v2"

    # Notifications (optional SMTP for demo-booking alerts)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    admin_notify_email: str = ""

    @field_validator("database_url", mode="before")
    @classmethod
    def _default_db(cls, v):  # an empty DATABASE_URL in .env means "use the SQLite default"
        return v or f"sqlite:///{(BACKEND_DIR / 'data' / 'causeline.db').as_posix()}"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if not s.jwt_secret:
        if s.environment == "production":
            raise RuntimeError("JWT_SECRET must be set in production")
        # Development fallback: per-process random secret (sessions reset on restart).
        import secrets
        s.jwt_secret = secrets.token_urlsafe(48)
    return s
