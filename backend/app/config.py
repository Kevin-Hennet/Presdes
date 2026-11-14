from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    openai_api_key: str = ""
    openai_model: str = "gpt-5.5"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    mongodb_uri: str = ""
    mongodb_db: str = "labellens"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    max_upload_mb: int = 12
    model_config = SettingsConfigDict(
    env_file=Path(__file__).resolve().parents[1] / ".env",
    extra="ignore"
)

settings = Settings()
