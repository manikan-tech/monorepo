"""
Manikan Virtual Try-On Telegram Bot
====================================
A conversational bot that lets users send two photos (person + clothing),
pick a garment category, and receive an AI-generated image of the person
wearing the clothing item.

Flow:
  /start → send person photo → pick category → send clothing photo → result

Uses python-telegram-bot v20 async API with ConversationHandler.
Talks to the Manikan VTON FastAPI service at POST /api/vton/2d.
"""

import logging

import httpx
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ConversationHandler,
    MessageHandler,
    ContextTypes,
    filters,
)
from telegram.request import HTTPXRequest

from config import TELEGRAM_BOT_TOKEN, FASTAPI_URL, FASTAPI_TIMEOUT, TRYON_SERVICE_KEY

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

# ── Conversation states ──────────────────────────────────────────────────────
WAITING_PERSON, WAITING_CATEGORY, WAITING_CLOTHING = range(3)

# ── Garment categories supported by the VTON service ────────────────────────
CATEGORIES = ["blouse", "shirt", "jacket", "pants", "skirt", "dress"]

CATEGORY_KEYBOARD = InlineKeyboardMarkup([
    [InlineKeyboardButton(cat.capitalize(), callback_data=f"cat:{cat}")]
    for cat in CATEGORIES
])


# ── /start command ───────────────────────────────────────────────────────────
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Begin the try-on flow by asking for the person's photo."""
    context.user_data.clear()

    await update.message.reply_text(
        "Welcome to Manikan! 👋\n\n"
        "Send me your photo first 📸"
    )
    return WAITING_PERSON


# ── /help command ────────────────────────────────────────────────────────────
async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Explain what the bot does."""
    await update.message.reply_text(
        "🤖 *Manikan Virtual Try-On Bot*\n\n"
        "I let you see how clothes look on you using AI!\n\n"
        "*How to use:*\n"
        "1️⃣ Send /start\n"
        "2️⃣ Send a photo of yourself\n"
        "3️⃣ Pick the clothing category\n"
        "4️⃣ Send a photo of the clothing item\n"
        "5️⃣ Wait a moment and get your result!\n\n"
        "Send /cancel at any time to start over.",
        parse_mode="Markdown",
    )


# ── /cancel command ─────────────────────────────────────────────────────────
async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Cancel the current session and end the conversation."""
    context.user_data.clear()
    await update.message.reply_text("Cancelled. Send /start to try again.")
    return ConversationHandler.END


# ── Step 1: Receive person photo ─────────────────────────────────────────────
async def receive_person_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Store the person photo file_id and ask to pick a category."""
    photo = update.message.photo[-1]
    context.user_data["person_photo_file_id"] = photo.file_id

    logger.info("Received person photo (file_id=%s)", photo.file_id)

    await update.message.reply_text(
        "Got it! Now pick the clothing category 👇",
        reply_markup=CATEGORY_KEYBOARD,
    )
    return WAITING_CATEGORY


# ── Step 2: Receive category selection ───────────────────────────────────────
async def receive_category(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Store the selected garment category and ask for the clothing photo."""
    query = update.callback_query
    await query.answer()

    category = query.data.replace("cat:", "")
    context.user_data["category"] = category

    logger.info("Category selected: %s", category)

    await query.edit_message_text(
        f"Category: *{category.capitalize()}* ✅\n\n"
        "Now send me the clothing item photo 👕",
        parse_mode="Markdown",
    )
    return WAITING_CLOTHING


# ── Step 3: Receive clothing photo and call VTON service ─────────────────────
async def receive_clothing_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """
    Download the person photo, get the clothing photo's Telegram URL,
    and forward both to the VTON FastAPI service.
    """
    clothing_photo = update.message.photo[-1]
    person_file_id = context.user_data.get("person_photo_file_id")
    category = context.user_data.get("category", "shirt")

    logger.info("Received clothing photo (file_id=%s)", clothing_photo.file_id)

    # Let the user know we're working on it
    await update.message.reply_text("Generating your look... ⏳")

    try:
        # ── Download person photo as bytes (VTON expects a file upload) ──
        person_file = await context.bot.get_file(person_file_id)
        person_bytes = bytes(await person_file.download_as_bytearray())

        # ── Get the clothing photo's public Telegram URL ─────────────────
        # The VTON service expects garment_image_url as a URL string,
        # not a file upload. Telegram file URLs are publicly accessible.
        clothing_file = await context.bot.get_file(clothing_photo.file_id)
        garment_url = clothing_file.file_path
        # file_path might be relative; build the full URL if needed
        if not garment_url.startswith("http"):
            garment_url = f"https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}/{garment_url}"

        logger.info("Garment URL: %s", garment_url)

        # ── Forward to the VTON FastAPI service ──────────────────────────
        async with httpx.AsyncClient(timeout=FASTAPI_TIMEOUT) as client:
            response = await client.post(
                FASTAPI_URL,
                headers={"X-Manikan-Internal-Key": TRYON_SERVICE_KEY},
                data={
                    "garment_image_url": garment_url,
                    "category": category,
                },
                files={
                    "human_image": ("person.jpg", person_bytes, "image/jpeg"),
                },
            )
            response.raise_for_status()

        # ── Send the result image back to the user ───────────────────────
        await update.message.reply_photo(
            photo=response.content,
            caption="Here's your look! Try another? Send /start 🎉",
        )

    except httpx.TimeoutException:
        logger.error("VTON request timed out after %ds", FASTAPI_TIMEOUT)
        await update.message.reply_text(
            "The generation is taking too long. Please try again in a moment 🙏"
        )

    except httpx.HTTPStatusError as exc:
        logger.error("VTON request failed (HTTP %d): %s", exc.response.status_code, exc.response.text)
        # Give a more specific error message if we know what it is
        try:
            error_data = exc.response.json()
            error_detail = error_data.get("detail", {})
            if isinstance(error_detail, dict) and "error" in error_detail:
                await update.message.reply_text(f"Oops! {error_detail['error']}")
            else:
                await update.message.reply_text("Our server is busy, please try again in a moment 🙏")
        except Exception:
            await update.message.reply_text("Our server is busy, please try again in a moment 🙏")

    except (httpx.ConnectError, httpx.RequestError) as exc:
        logger.error("VTON request failed: %s", exc)
        await update.message.reply_text(
            "Our server is busy, please try again in a moment 🙏"
        )

    finally:
        context.user_data.clear()

    return ConversationHandler.END


# ── Fallback: user sends non-photo when a photo is expected ──────────────────
async def non_photo_fallback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Remind the user we need a photo, not text or stickers."""
    await update.message.reply_text("Please send a photo 📸")


# ── Application setup ───────────────────────────────────────────────────────
def main() -> None:
    """Build and run the Telegram bot."""
    if not TELEGRAM_BOT_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN is not set. Check your .env file.")
        return

    # Use generous timeouts for the Telegram API connection.
    # The default 5s is too short on networks where Telegram is throttled.
    request = HTTPXRequest(
        connect_timeout=30.0,
        read_timeout=30.0,
        write_timeout=30.0,
        connection_pool_size=8,
    )

    app = (
        ApplicationBuilder()
        .token(TELEGRAM_BOT_TOKEN)
        .request(request)
        .get_updates_request(HTTPXRequest(
            connect_timeout=30.0,
            read_timeout=30.0,
            write_timeout=30.0,
        ))
        .build()
    )

    # ── Conversation handler for the 3-step flow ─────────────────────
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states={
            WAITING_PERSON: [
                MessageHandler(filters.PHOTO, receive_person_photo),
                MessageHandler(~filters.COMMAND, non_photo_fallback),
            ],
            WAITING_CATEGORY: [
                CallbackQueryHandler(receive_category, pattern=r"^cat:"),
            ],
            WAITING_CLOTHING: [
                MessageHandler(filters.PHOTO, receive_clothing_photo),
                MessageHandler(~filters.COMMAND, non_photo_fallback),
            ],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )

    app.add_handler(conv_handler)
    app.add_handler(CommandHandler("help", help_command))

    logger.info("Manikan bot is starting...")
    app.run_polling()


if __name__ == "__main__":
    main()
