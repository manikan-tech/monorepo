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

# Next.js store API for user validation and credit tracking
STORE_API_URL: str = os.getenv("STORE_API_URL", "http://localhost:3000/api/bot/user")

# Shared secret to authenticate bot → store API calls
BOT_API_SECRET: str = os.getenv("BOT_API_SECRET", "")

# Monthly quota (free generations per calendar month)
BOT_MONTHLY_QUOTA: int = int(os.getenv("BOT_MONTHLY_QUOTA", "5"))

# URL to send users to when they exhaust their credits
CHECKOUT_URL: str = os.getenv("CHECKOUT_URL", "https://manikan.store/checkout/bot-credits")
