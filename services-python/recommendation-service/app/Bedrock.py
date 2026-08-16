import asyncio
import json
import re
import logging

import httpx

from .config import get_settings
from .schemas import RecommendationOutput

logger = logging.getLogger("manikan.agent")

BEDROCK_MODEL_ID = "deepseek.v3.2"

_MAX_ATTEMPTS = 2
_PER_ATTEMPT_TIMEOUT = 6
_BACKOFF_SECONDS = 1

_JSON_SCHEMA_INSTRUCTION = """
Respond with ONLY a single valid JSON object, no prose, no markdown code fences.
It must match this exact shape:
{
  "action": one of "ask_measurements" | "provide_recommendation" | "fetch_products" | "redirect_to_product" | "request_data",
  "message": string (your natural-language reply to show the user),
  "recommended_size": string or null (NEVER invent one - only fill this with a
      size the user explicitly gave, or one computed from real measurements),
  "confidence_score": number between 0 and 1, or null,
  "explanation": string or null,
  "matched_category": string or null (ONLY when action is "fetch_products" - must be
      copied EXACTLY from the available categories list given in the system prompt,
      regardless of what language the user asked in; null if no confident match)
}
"""


async def check_bedrock_allowed_models() -> list[str]:
    settings = get_settings()
    headers = {"Authorization": f"Bearer {settings.bedrock_api_key}"}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{settings.bedrock_base_url}/student/me", headers=headers)
        resp.raise_for_status()
        return resp.json().get("allowed_models", [])


def _strip_json_fences(text: str) -> str:
    return re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()


async def _raw_chat(messages: list[dict]) -> str:
    settings = get_settings()
    if not settings.bedrock_api_key or not settings.bedrock_base_url:
        raise RuntimeError("Bedrock gateway not configured (missing base_url or api_key)")

    payload = {
        "model_id": BEDROCK_MODEL_ID,
        "messages": messages,
        "max_tokens": 500,
    }
    headers = {
        "Authorization": f"Bearer {settings.bedrock_api_key}",
        "Content-Type": "application/json",
    }

    last_error: Exception | None = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            async with httpx.AsyncClient(timeout=_PER_ATTEMPT_TIMEOUT, follow_redirects=True) as client:
                resp = await client.post(
                    f"{settings.bedrock_base_url}/student/chat",
                    headers=headers,
                    json=payload,
                )
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"Bedrock gateway raw response: {data}")
            return data["output_text"]
        except Exception as e:
            last_error = e
            if attempt < _MAX_ATTEMPTS - 1:
                await asyncio.sleep(_BACKOFF_SECONDS)
            continue
    raise last_error


async def _call_bedrock_gateway(messages: list[dict]) -> RecommendationOutput:
    augmented_messages = messages + [{"role": "user", "content": _JSON_SCHEMA_INSTRUCTION}]

    raw = await _raw_chat(augmented_messages)
    try:
        parsed = json.loads(_strip_json_fences(raw))
    except json.JSONDecodeError:
        retry_messages = augmented_messages + [
            {"role": "assistant", "content": raw},
            {"role": "user", "content": "That was not valid JSON. Return ONLY the corrected valid JSON object, nothing else."},
        ]
        raw_retry = await _raw_chat(retry_messages)
        parsed = json.loads(_strip_json_fences(raw_retry))

    return RecommendationOutput.model_validate(parsed)