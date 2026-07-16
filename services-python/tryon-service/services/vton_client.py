# OOTDiffusion Gradio client setup and inference retry behavior.
import logging
import os
import time
from typing import Optional

from dotenv import load_dotenv
from gradio_client import Client, handle_file
from gradio_client.exceptions import AppError
from httpx import HTTPError

SPACE_ID = "levihsu/OOTDiffusion"
logger = logging.getLogger(__name__)

load_dotenv()
HF_TOKEN = os.getenv("HF_TOKEN")
client: Optional[Client]

try:
    client = Client(SPACE_ID, token=HF_TOKEN)
except (AppError, HTTPError, OSError, RuntimeError, ValueError) as error:
    logger.warning("OOTDiffusion client could not initialize: %s", error)
    client = None


def is_client_initialized() -> bool:
    """Return whether the OOTDiffusion client initialized successfully."""
    return client is not None


def run_tryon(human_img_path: str, garment_img_path: str, cloth_type: str) -> str:
    """Submit one image pair to OOTDiffusion and return its local result path."""
    if client is None:
        raise RuntimeError("OOTDiffusion client is unavailable.")

    category = _map_cloth_type_to_ootd_category(cloth_type)
    if category == 0:
        result = client.predict(
            handle_file(human_img_path),
            handle_file(garment_img_path),
            1,
            20,
            2.0,
            -1,
            api_name="/process_hd",
        )
    else:
        result = client.predict(
            handle_file(human_img_path),
            handle_file(garment_img_path),
            _map_category_label(category),
            1,
            20,
            2.0,
            -1,
            api_name="/process_dc",
        )

    result_path = _extract_result_path(result)
    if result_path is None:
        raise ValueError(f"Unexpected result format from OOTDiffusion: {result}")
    return result_path


def _map_cloth_type_to_ootd_category(cloth_type: str) -> int:
    """Map the service cloth type to the OOTDiffusion category index."""
    if cloth_type == "upperbody":
        return 0
    if cloth_type == "lowerbody":
        return 1
    if cloth_type == "dress":
        return 2
    raise ValueError(f"Unsupported cloth type for OOTDiffusion: {cloth_type}")


def _map_category_label(category: int) -> str:
    """Map the OOTDiffusion category index to the Gradio dropdown label."""
    if category == 0:
        return "Upper-body"
    if category == 1:
        return "Lower-body"
    if category == 2:
        return "Dress"
    raise ValueError(f"Unsupported OOTDiffusion category: {category}")


def _extract_result_path(result: object) -> str | None:
    """Extract the first generated image path from an OOTDiffusion response."""
    if isinstance(result, str):
        return result
    if isinstance(result, dict):
        for key in ("path", "image", "url"):
            value = result.get(key)
            if isinstance(value, str):
                return value
        for value in result.values():
            nested = _extract_result_path(value)
            if nested is not None:
                return nested
    if isinstance(result, (list, tuple)):
        for item in result:
            nested = _extract_result_path(item)
            if nested is not None:
                return nested
    return None


def _is_retryable(error: RuntimeError | AppError) -> bool:
    """Return whether an OOTDiffusion failure is safe to retry."""
    message = str(error).lower()
    if "validation" in message or "valueerror" in message:
        return False
    return isinstance(error, (RuntimeError, AppError)) or "quota" in message or "503" in message


def run_tryon_with_retry(
    human_img_path: str,
    garment_img_path: str,
    cloth_type: str,
    max_retries: int = 3,
    wait_seconds: int = 10,
) -> str:
    """Run OOTDiffusion, retrying only transient application failures."""
    for attempt in range(1, max_retries + 1):
        try:
            return run_tryon(human_img_path, garment_img_path, cloth_type)
        except (RuntimeError, AppError) as error:
            if not _is_retryable(error) or attempt == max_retries:
                raise
            logger.warning(
                "OOTDiffusion attempt %d/%d failed; retrying in %d seconds: %s",
                attempt,
                max_retries,
                wait_seconds,
                error,
            )
            time.sleep(wait_seconds)

    raise RuntimeError("OOTDiffusion retry loop ended unexpectedly.")
