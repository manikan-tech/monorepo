from functools import lru_cache
from typing import List, Optional
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    gemini_api_key_1: Optional[str] = None
    gemini_api_key_2: Optional[str] = None

    bedrock_api_key: Optional[str] = None
    bedrock_base_url: Optional[str] = None

    deepseek_api_key: Optional[str] = None

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    # Optional Store Service RAG endpoint. When unset, the graph uses the
    # compact request catalog as its backwards-compatible retrieval source.
    store_service_base_url: Optional[str] = None
    store_service_rag_timeout_seconds: float = 5.0

    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Keep the Store and service on the same canonical name. The shorter
    # aliases preserve compatibility with existing local service .env files.
    recommend_service_key: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("RECOMMENDATION_SERVICE_KEY", "RECOMMEND_SERVICE_KEY"),
    )
    recommend_service_key_previous: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("RECOMMENDATION_SERVICE_KEY_PREVIOUS", "RECOMMEND_SERVICE_KEY_PREVIOUS"),
    )

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


@lru_cache
def get_settings() -> Settings:
    """Load environment-backed settings once per process."""
    return Settings()
