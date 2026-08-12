import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str
    direct_url: str
    next_public_supabase_url: str
    next_public_supabase_publishable_key: str
    supabase_service_key: str
    
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"
    
    openai_api_key: str
    openai_model: str = "anthropic.claude-sonnet-4-6"

    # Shared secret the Store's server-side proxy must present on every
    # billable request. CORS only constrains browsers -- this is what stops a
    # server-to-server caller (or anyone who finds this URL) from reaching
    # this service directly and bypassing the Store's API-key/subscription/
    # quota gate. Same pattern as body-service's BODY_SERVICE_KEY and
    # tryon-service's TRYON_SERVICE_KEY. Unset in local dev is allowed (the
    # request-time check fails closed instead); every non-local deployment
    # must set it.
    recommendation_service_key: str | None = None
    recommendation_service_key_previous: str | None = None

    # Comma-separated allowed origins. Default "*" for local dev; set an
    # explicit list (e.g. the Store service origin) in production. Same
    # convention as body-service's CORS_ORIGINS.
    cors_origins: str = "*"

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        extra="ignore"
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

def get_settings():
    return Settings()