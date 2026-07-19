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

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        extra="ignore"
    )

def get_settings():
    return Settings()