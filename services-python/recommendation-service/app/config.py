from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Supabase credentials
    database_url: Optional[str] = None
    direct_url: Optional[str] = None
    next_public_supabase_url: Optional[str] = None
    next_public_supabase_publishable_key: Optional[str] = None
    supabase_service_key: Optional[str] = None

    # Google AI Studio (Gemini) - primary provider, two keys for redundancy
    gemini_api_key_1: Optional[str] = None
    gemini_api_key_2: Optional[str] = None

    # Bedrock Gateway - custom ITI endpoint, request/response shape not confirmed yet
    bedrock_api_key: Optional[str] = None
    bedrock_base_url: Optional[str] = None
    bedrock_chat_endpoint: Optional[str] = None

    # Ollama - local fallback, always last resort
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def gemini_keys(self) -> List[str]:
        # Ordered list of configured Gemini keys, skipping any that are empty
        return [k for k in (self.gemini_api_key_1, self.gemini_api_key_2) if k]

    @property
    def bedrock_full_url(self) -> Optional[str]:
        if self.bedrock_base_url and self.bedrock_chat_endpoint:
            return f"{self.bedrock_base_url.rstrip('/')}{self.bedrock_chat_endpoint}"
        return None


def get_settings() -> Settings:
    return Settings()