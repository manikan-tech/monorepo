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

    # CORS - comma-separated list of allowed origins. Defaults to local dev
    # only; set ALLOWED_ORIGINS in .env to the real store domain(s) before
    # any real deployment.
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Shared-secret key the widget must send on every /recommend request.
    # If left unset, the check is skipped (permissive) - useful for local
    # dev before this is configured, but should be set before any real
    # deployment.
    recommend_api_key: Optional[str] = None

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
        # Ordered list of configured Gemini keys, skipping any that are empty
        return [k for k in (self.gemini_api_key_1, self.gemini_api_key_2) if k]

    @property
    def bedrock_full_url(self) -> Optional[str]:
        if self.bedrock_base_url and self.bedrock_chat_endpoint:
            return f"{self.bedrock_base_url.rstrip('/')}{self.bedrock_chat_endpoint}"
        return None


def get_settings() -> Settings:
    return Settings()