"""
Configuration module for the Manikan Telegram Bot.
Loads environment variables from .env and exposes them as constants.
"""

import os
from dotenv import load_dotenv

# Load variables from .env file into the process environment
load_dotenv()

# Telegram Bot API token from @BotFather
TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")

# URL of the FastAPI virtual try-on endpoint
FASTAPI_URL: str = os.getenv("FASTAPI_URL", "http://localhost:8003/api/vton/2d")

# Timeout in seconds for the FastAPI call (image generation can be slow)
FASTAPI_TIMEOUT: int = int(os.getenv("FASTAPI_TIMEOUT", "120"))

# Internal auth key that the VTON service requires
TRYON_SERVICE_KEY: str = os.getenv("TRYON_SERVICE_KEY", "")
