"""
Manikan Virtual Try-On Telegram Bot
====================================
A conversational bot that authenticates shoppers via their Manikan ID,
enforces a monthly generation quota, and lets users send two photos
(person + clothing) to receive an AI-generated virtual try-on result.

Flow:
  /start → (auto-detect or ask Manikan ID) → quota check →
  send person photo → pick category → send clothing photo → result

Uses python-telegram-bot v20 async API with ConversationHandler.
Talks to the Manikan VTON FastAPI service at POST /api/vton/2d.
Validates users via the Next.js store API at GET/POST /api/bot/user.
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

from config import (
    TELEGRAM_BOT_TOKEN,
    FASTAPI_URL,
    FASTAPI_TIMEOUT,
    TRYON_SERVICE_KEY,
    STORE_API_URL,
    BOT_API_SECRET,
    CHECKOUT_URL,
)

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

# ── Conversation states ──────────────────────────────────────────────────────
WAITING_MANIKAN_ID, WAITING_PERSON, WAITING_CATEGORY, WAITING_CLOTHING = range(4)

# ── Garment categories supported by the VTON service ────────────────────────
CATEGORIES = ["blouse", "shirt", "jacket", "pants", "skirt", "dress"]

CATEGORY_KEYBOARD = InlineKeyboardMarkup([
    [InlineKeyboardButton(cat.capitalize(), callback_data=f"cat:{cat}")]
    for cat in CATEGORIES
])

# ── Store API headers ───────────────────────────────────────────────────────
STORE_HEADERS = {"x-bot-secret": BOT_API_SECRET}


# ── Helpers ──────────────────────────────────────────────────────────────────
async def lookup_by_chat_id(chat_id: str) -> dict | None:
    """Check if this Telegram chat_id is already linked to a Manikan account."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                STORE_API_URL,
                params={"telegramChatId": chat_id},
                headers=STORE_HEADERS,
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("found"):
                return data
    except Exception as exc:
        logger.error("Store API lookup by chat_id failed: %s", exc)
    return None


async def lookup_by_manikan_id(manikan_id: str) -> dict | None:
    """Validate a Manikan customer ID via the store API."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                STORE_API_URL,
                params={"manikanId": manikan_id},
                headers=STORE_HEADERS,
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("found"):
                return data
    except Exception as exc:
        logger.error("Store API lookup by manikanId failed: %s", exc)
    return None


async def link_telegram(customer_id: str, chat_id: str) -> dict:
    """Link a Telegram chat_id to a Manikan customer account."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            STORE_API_URL,
            json={
                "action": "link",
                "customerId": customer_id,
                "telegramChatId": chat_id,
            },
            headers=STORE_HEADERS,
        )
        resp.raise_for_status()
        return resp.json()


async def unlink_telegram(customer_id: str) -> dict:
    """Unlink a Telegram chat_id from a Manikan customer account."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            STORE_API_URL,
            json={"action": "unlink", "customerId": customer_id},
            headers=STORE_HEADERS,
        )
        resp.raise_for_status()
        return resp.json()


async def use_credit(customer_id: str) -> dict:
    """Deduct 1 generation credit for the customer."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            STORE_API_URL,
            json={"action": "use_credit", "customerId": customer_id},
            headers=STORE_HEADERS,
        )
        resp.raise_for_status()
        return resp.json()


# ── /start command ───────────────────────────────────────────────────────────
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Begin the try-on flow. Auto-detect linked accounts, or ask for ID."""
    context.user_data.clear()
    chat_id = str(update.effective_chat.id)

    # Check if this Telegram user is already linked
    user_data = await lookup_by_chat_id(chat_id)

    if user_data:
        # ── Returning user ───────────────────────────────────────────
        context.user_data["customer_id"] = user_data["customerId"]
        credits = user_data.get("creditsRemaining", 0)

        if credits <= 0:
            await update.message.reply_text(
                f"Hey {user_data['firstName']}! 👋\n\n"
                "You've used all your free credits this month.\n"
                f"Subscribe for more: {CHECKOUT_URL}",
            )
            return ConversationHandler.END

        await update.message.reply_text(
            f"Welcome back, {user_data['firstName']}! 👋\n"
            f"You have *{credits}* credits remaining this month.\n\n"
            "Send me your photo 📸",
            parse_mode="Markdown",
        )
        return WAITING_PERSON

    # ── New user — ask for Manikan ID ────────────────────────────────
    await update.message.reply_text(
        "Welcome to Manikan! 👋\n\n"
        "To get started, please paste your *Manikan ID*.\n"
        "You can find it on your profile page at manikan.store/account",
        parse_mode="Markdown",
    )
    return WAITING_MANIKAN_ID


# ── Step 0: Receive and validate Manikan ID ──────────────────────────────────
async def receive_manikan_id(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Validate the pasted Manikan ID, link the account, check quota."""
    manikan_id = update.message.text.strip()
    chat_id = str(update.effective_chat.id)

    # Validate the ID
    user_data = await lookup_by_manikan_id(manikan_id)

    if not user_data:
        await update.message.reply_text(
            "❌ This ID doesn't exist.\n\n"
            "Make sure you copied it from your Manikan profile page.\n"
            "Send /start to try again.",
        )
        return ConversationHandler.END

    # Check if this Manikan account is already linked to a DIFFERENT Telegram user
    if user_data.get("alreadyLinked"):
        await update.message.reply_text(
            "❌ This Manikan account is already linked to another Telegram user.\n\n"
            "If you think this is a mistake, contact support.\n"
            "Send /start to try again.",
        )
        return ConversationHandler.END

    # Link the account
    link_result = await link_telegram(user_data["customerId"], chat_id)
    if not link_result.get("success"):
        error = link_result.get("error", "")
        if error == "ALREADY_LINKED_OTHER":
            await update.message.reply_text(
                "❌ This Manikan account is already linked to another Telegram user.\n\n"
                "If you think this is a mistake, contact support.",
            )
        else:
            await update.message.reply_text(
                "Something went wrong linking your account. Please try again later.",
            )
        return ConversationHandler.END

    # Store the customer ID and check quota
    context.user_data["customer_id"] = user_data["customerId"]
    credits = user_data.get("creditsRemaining", 0)

    if credits <= 0:
        await update.message.reply_text(
            f"Account linked! ✅ Hey {user_data['firstName']}! 👋\n\n"
            "But you've already used all your free credits this month.\n"
            f"Subscribe for more: {CHECKOUT_URL}",
        )
        return ConversationHandler.END

    await update.message.reply_text(
        f"Account linked! ✅ Welcome, {user_data['firstName']}! 🎉\n"
        f"You have *{credits}* credits remaining this month.\n\n"
        "Send me your photo 📸",
        parse_mode="Markdown",
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
        "2️⃣ Paste your Manikan ID (first time only)\n"
        "3️⃣ Send a photo of yourself\n"
        "4️⃣ Pick the clothing category\n"
        "5️⃣ Send a photo of the clothing item\n"
        "6️⃣ Wait a moment and get your result!\n\n"
        "Send /cancel at any time to start over.\n"
        "Send /unlink to disconnect your Manikan account.",
        parse_mode="Markdown",
    )


# ── /unlink command ─────────────────────────────────────────────────────────
async def unlink_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Unlink the user's Telegram account from their Manikan account."""
    chat_id = str(update.effective_chat.id)
    
    # Check if they are actually linked
    user_data = await lookup_by_chat_id(chat_id)
    if not user_data:
        await update.message.reply_text("Your account is not linked to any Manikan ID.")
        return ConversationHandler.END

    try:
        await unlink_telegram(user_data["customerId"])
        context.user_data.clear()
        await update.message.reply_text("Your Telegram account has been unlinked from Manikan! ✅\nSend /start to link a different account.")
    except Exception as exc:
        logger.error("Failed to unlink account: %s", exc)
        await update.message.reply_text("Something went wrong trying to unlink your account. Please try again later.")

    return ConversationHandler.END


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
    Only deducts a credit on success.
    """
    clothing_photo = update.message.photo[-1]
    person_file_id = context.user_data.get("person_photo_file_id")
    category = context.user_data.get("category", "shirt")
    customer_id = context.user_data.get("customer_id")

    logger.info("Received clothing photo (file_id=%s)", clothing_photo.file_id)

    # Let the user know we're working on it
    await update.message.reply_text("Generating your look... ⏳")

    try:
        # ── Download person photo as bytes (VTON expects a file upload) ──
        person_file = await context.bot.get_file(person_file_id)
        person_bytes = bytes(await person_file.download_as_bytearray())

        # ── Get the clothing photo's public Telegram URL ─────────────────
        clothing_file = await context.bot.get_file(clothing_photo.file_id)
        garment_url = clothing_file.file_path
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

        # ── Deduct credit ONLY on success ────────────────────────────────
        if customer_id:
            credit_result = await use_credit(customer_id)
            remaining = credit_result.get("creditsRemaining", "?")
            caption = f"Here's your look! 🎉 ({remaining} credits left)\nTry another? Send /start"
        else:
            caption = "Here's your look! Try another? Send /start 🎉"

        # ── Send the result image back to the user ───────────────────────
        await update.message.reply_photo(
            photo=response.content,
            caption=caption,
        )

    except httpx.TimeoutException:
        logger.error("VTON request timed out after %ds", FASTAPI_TIMEOUT)
        await update.message.reply_text(
            "The generation is taking too long. Please try again in a moment 🙏\n"
            "No credit was deducted."
        )

    except httpx.HTTPStatusError as exc:
        logger.error("VTON request failed (HTTP %d): %s", exc.response.status_code, exc.response.text)
        try:
            error_data = exc.response.json()
            error_detail = error_data.get("detail", {})
            if isinstance(error_detail, dict) and "error" in error_detail:
                await update.message.reply_text(
                    f"Oops! {error_detail['error']}\nNo credit was deducted."
                )
            else:
                await update.message.reply_text(
                    "Our server is busy, please try again in a moment 🙏\n"
                    "No credit was deducted."
                )
        except Exception:
            await update.message.reply_text(
                "Our server is busy, please try again in a moment 🙏\n"
                "No credit was deducted."
            )

    except (httpx.ConnectError, httpx.RequestError) as exc:
        logger.error("VTON request failed: %s", exc)
        await update.message.reply_text(
            "Our server is busy, please try again in a moment 🙏\n"
            "No credit was deducted."
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

    # ── Conversation handler for the 4-step flow ─────────────────────
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states={
            WAITING_MANIKAN_ID: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, receive_manikan_id),
            ],
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
        fallbacks=[
            CommandHandler("cancel", cancel),
            CommandHandler("unlink", unlink_command),
        ],
    )

    app.add_handler(conv_handler)
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("unlink", unlink_command))

    logger.info("Manikan bot is starting...")
    app.run_polling()


if __name__ == "__main__":
    main()
