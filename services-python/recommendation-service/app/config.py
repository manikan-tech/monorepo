from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    gemini_api_key_1: Optional[str] = None
    gemini_api_key_2: Optional[str] = None

    bedrock_api_key: Optional[str] = None
    bedrock_base_url: Optional[str] = None

    deepseek_api_key: Optional[str] = None

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    recommend_api_key: Optional[str] = None
    recommend_service_key: Optional[str] = None
    recommend_service_key_previous: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def allowed_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def gemini_keys(self) -> List[str]:
        return [k for k in (self.gemini_api_key_1, self.gemini_api_key_2) if k]


def get_settings() -> Settings:
    return Settings()