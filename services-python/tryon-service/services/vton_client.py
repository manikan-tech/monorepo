# FASHN.ai REST API client — virtual try-on inference and retry logic.
import base64
import logging
import os
import time
import uuid
from pathlib import Path

import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv(override=True)

def get_fashn_api_key() -> str:
    return os.getenv("FASHN_API_KEY", "")

FASHN_BASE_URL = "https://api.fashn.ai/v1"

_POLL_INTERVAL_SECONDS = 3
_MAX_POLL_ATTEMPTS = 30


def is_client_initialized() -> bool:
    """Return True if a FASHN_API_KEY is present in the environment."""
    load_dotenv(override=True)
    return bool(get_fashn_api_key())


def _map_cloth_type_to_fashn_category(cloth_type: str) -> str:
    """Map internal cloth_type string to a FASHN.ai category name."""
    mapping = {
        "upperbody": "tops",
        "lowerbody": "bottoms",
        "dress": "one-pieces",
    }
    if cloth_type not in mapping:
        raise ValueError(f"Unsupported cloth type: {cloth_type}")
    return mapping[cloth_type]


def _auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {get_fashn_api_key()}"}


def run_tryon(human_img_path: str, garment_img_path: str, cloth_type: str) -> str:
    """Submit one image pair to FASHN.ai and return the local result file path.

    FASHN.ai API schema (current):
      POST /v1/run  →  { model_name, inputs: { model_image, product_image } }
      GET  /v1/status/{id}  →  { status, output: [url] }

    Steps:
    1. Build model_image value (base64 data URI for local file, URL as-is).
    2. Build product_image value (URL passed directly from main.py).
    3. POST /run — receive prediction id.
    4. Poll GET /status/{id} every 3 s, up to 30 attempts (90 s).
    5. On completion, download output[0] → save locally → return path.
    6. On failure or timeout, raise RuntimeError.
    """
    if not is_client_initialized():
        raise RuntimeError("FASHN.ai client is unavailable: FASHN_API_KEY is not set.")

    category = _map_cloth_type_to_fashn_category(cloth_type)

    # --- Step 1: encode human image ---
    with open(human_img_path, "rb") as fh:
        raw_bytes = fh.read()
    b64_data = base64.b64encode(raw_bytes).decode("utf-8")
    model_image_data_uri = f"data:image/jpeg;base64,{b64_data}"

    # FASHN.ai /run expects a public URL for garment_image.
    # If main.py passes the original URL, use it directly.
    # Fall back to base64 only when a local file path is given.
    if garment_img_path.startswith(("http://", "https://")):
        garment_payload_value = garment_img_path
    else:
        with open(garment_img_path, "rb") as fh:
            garment_bytes = fh.read()
        garment_b64 = base64.b64encode(garment_bytes).decode("utf-8")
        garment_payload_value = f"data:image/jpeg;base64,{garment_b64}"

    # --- Step 2: start prediction (new FASHN.ai schema) ---
    payload = {
        "model_name": "tryon-max",
        "inputs": {
            "model_image": model_image_data_uri,
            "product_image": garment_payload_value,
        },
    }
    logger.info("Starting FASHN.ai prediction (category=%s).", category)
    response = requests.post(
        f"{FASHN_BASE_URL}/run",
        json=payload,
        headers=_auth_headers(),
        timeout=30,
    )
    response.raise_for_status()
    run_data = response.json()

    if run_data.get("error"):
        raise RuntimeError(f"FASHN.ai /run error: {run_data['error']}")

    prediction_id = run_data.get("id")
    if not prediction_id:
        raise RuntimeError(f"FASHN.ai /run returned no prediction id: {run_data}")

    logger.info("FASHN.ai prediction started (id=%s).", prediction_id)

    # --- Step 3: poll for result ---
    for attempt in range(1, _MAX_POLL_ATTEMPTS + 1):
        time.sleep(_POLL_INTERVAL_SECONDS)
        status_response = requests.get(
            f"{FASHN_BASE_URL}/status/{prediction_id}",
            headers=_auth_headers(),
            timeout=15,
        )
        status_response.raise_for_status()
        status_data = status_response.json()
        status = status_data.get("status", "")

        logger.debug(
            "FASHN.ai poll attempt %d/%d — status=%s",
            attempt,
            _MAX_POLL_ATTEMPTS,
            status,
        )

        if status == "completed":
            output_urls = status_data.get("output", [])
            if not output_urls:
                raise RuntimeError("FASHN.ai completed but returned no output URLs.")
            result_url = output_urls[0]
            break

        if status == "failed":
            raise RuntimeError(f"FASHN.ai prediction failed: {status_data.get('error')}")

        # statuses "starting" | "in_queue" | "processing" → keep polling
    else:
        raise RuntimeError("FASHN prediction timed out.")

    # --- Step 4: download result image ---
    logger.info("FASHN.ai prediction completed; downloading result from %s.", result_url)
    img_response = requests.get(result_url, timeout=60)
    img_response.raise_for_status()

    result_filename = f"{uuid.uuid4()}.png"
    result_path = str(Path(human_img_path).parent / result_filename)
    with open(result_path, "wb") as fh:
        fh.write(img_response.content)

    logger.info("FASHN.ai result saved to %s.", result_path)
    return result_path


def run_tryon_with_retry(
    human_img_path: str,
    garment_img_path: str,
    cloth_type: str,
    max_retries: int = 3,
    wait_seconds: int = 10,
) -> str:
    """Run FASHN.ai try-on, retrying only on transient RuntimeError failures.

    ValueError (e.g. unsupported cloth type) is never retried.
    """
    for attempt in range(1, max_retries + 1):
        try:
            return run_tryon(human_img_path, garment_img_path, cloth_type)
        except RuntimeError as error:
            if attempt == max_retries:
                raise
            logger.warning(
                "FASHN.ai attempt %d/%d failed; retrying in %d seconds: %s",
                attempt,
                max_retries,
                wait_seconds,
                error,
            )
            time.sleep(wait_seconds)

    raise RuntimeError("FASHN.ai retry loop ended unexpectedly.")
