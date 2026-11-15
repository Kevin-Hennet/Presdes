from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    openai_api_key: SecretStr = SecretStr("")
    openai_model: str = "gpt-5.5"
    mongodb_uri: SecretStr = SecretStr("")
    mongodb_database: str = "presdes"
    mongodb_session_secret: SecretStr = SecretStr("")

    @property
    def mongo_configured(self) -> bool:
        return bool(
            self.mongodb_uri.get_secret_value()
            and len(self.mongodb_session_secret.get_secret_value()) >= 32
        )


settings = Settings()
