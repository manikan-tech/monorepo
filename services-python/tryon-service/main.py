# FastAPI application configuration and Virtual Try-On HTTP routes.
import hmac
import hashlib
import logging
import os
import time as _time
from pathlib import Path
from typing import Dict, Optional, Tuple

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import httpx

from services.vton_client import is_client_initialized, run_tryon_with_retry
from utils.category_mapper import map_category
from utils.image_handler import cleanup_files, download_url_to_temp, save_upload_to_temp

logger = logging.getLogger(__name__)
TEMP_DIR = str(Path(__file__).resolve().parent / "tmp")
os.makedirs(TEMP_DIR, exist_ok=True)

# Shared secret the Store's server-side proxy must present on every billable
# request. Same pattern as body-service's BODY_SERVICE_KEY: CORS/origin checks
# only constrain browsers, this is what actually stops a server-to-server
# caller (or anyone who finds this URL) from reaching this service directly
# and bypassing the Store's API-key/subscription/quota gate. Read via
# services.vton_client's load_dotenv() import above, same as HF_TOKEN.
TRYON_SERVICE_KEY = os.getenv("TRYON_SERVICE_KEY")
TRYON_SERVICE_KEY_PREVIOUS = os.getenv("TRYON_SERVICE_KEY_PREVIOUS")

SUPPORTED_CATEGORIES = ["blouse", "shirt", "jacket", "pants", "skirt", "dress"]
MIN_HUMAN_IMAGE_WIDTH = 400
MIN_HUMAN_IMAGE_HEIGHT = 600
MIN_GARMENT_IMAGE_WIDTH = 300
MIN_GARMENT_IMAGE_HEIGHT = 300
MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024

# In-memory dedup cache: key → (result_path, expires_at)
# Entries expire after 5 minutes to prevent memory growth
_DEDUP_CACHE: Dict[str, Tuple[str, float]] = {}
_DEDUP_TTL_SECONDS = 300  # 5 minutes


def _raise_vton_http_error(status_code: int, code: str, message: str) -> None:
    raise HTTPException(status_code=status_code, detail={"code": code, "error": message})


def _validation_error_from_message(message: str) -> tuple[int, str]:
    normalized = message.lower()
    if "category" in normalized or "cloth type" in normalized:
        return 422, "UNSUPPORTED_CATEGORY"
    if "too small" in normalized:
        return 422, "IMAGE_TOO_SMALL"
    if "human_image" in normalized:
        return 400, "INVALID_HUMAN_IMAGE"
    if "garment_image_url" in normalized:
        return 400, "INVALID_GARMENT_IMAGE_URL"
    return 400, "INVALID_INPUT"


def _make_dedup_key(garment_image_url: str, category: str, session_id: str | None) -> str:
    """Create a cache key from the request inputs."""
    raw = f"{garment_image_url}:{category}:{session_id or ''}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _cleanup_expired_cache() -> None:
    """Remove expired entries and their cached result files from the dedup cache."""
    now = _time.time()
    expired = [key for key, (_, expires_at) in _DEDUP_CACHE.items() if expires_at < now]
    for key in expired:
        result_path, _ = _DEDUP_CACHE.pop(key)
        cleanup_files([result_path])

# Comma-separated allowed origins. Default "*" for local dev; set an explicit
# list (e.g. the Store service origin) in production. Same convention as
# body-service's CORS_ORIGINS.
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

app = FastAPI(title="Manikan VTON Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_internal_key(x_manikan_internal_key: str = Header(default="")) -> None:
    """
    tryon-service has no other authentication of its own -- CORS only
    constrains browsers, not server-to-server or direct callers. Fails closed
    if no key is configured, so an unconfigured secret never means "open";
    accepts TRYON_SERVICE_KEY_PREVIOUS too for zero-downtime rotation.
    """
    key = os.getenv("TRYON_SERVICE_KEY") or TRYON_SERVICE_KEY
    prev_key = os.getenv("TRYON_SERVICE_KEY_PREVIOUS") or TRYON_SERVICE_KEY_PREVIOUS
    candidates = [k for k in (key, prev_key) if k]
    if not candidates or not any(
        hmac.compare_digest(x_manikan_internal_key, k) for k in candidates
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health() -> dict[str, str | bool]:
    """Return service and FASHN.ai client health details."""
    return {
        "status": "ok",
        "service": "tryon-service",
        "version": "1.0.0",
        "model": "fashn.ai/v1",
        "client_initialized": is_client_initialized(),
    }


@app.get("/capabilities")
def capabilities() -> dict[str, object]:
    """Return model and validation capabilities for the frontend."""
    return {
        "service": "tryon-service",
        "model": "fashn.ai/v1",
        "supported_categories": SUPPORTED_CATEGORIES,
        "min_image_dimensions": {
            "human": {"width": MIN_HUMAN_IMAGE_WIDTH, "height": MIN_HUMAN_IMAGE_HEIGHT},
            "garment": {"width": MIN_GARMENT_IMAGE_WIDTH, "height": MIN_GARMENT_IMAGE_HEIGHT},
        },
        "max_upload_size_bytes": MAX_UPLOAD_SIZE_BYTES,
        "client_initialized": is_client_initialized(),
    }


@app.post(
    "/api/vton/2d",
    response_class=FileResponse,
    dependencies=[Depends(verify_internal_key)],
)
async def tryon_2d(
    request: Request,
    background_tasks: BackgroundTasks,
    human_image: UploadFile = File(...),
    garment_image_url: str = Form(...),
    category: str = Form(...),
    session_id: Optional[str] = Form(default=None),
) -> FileResponse:
    """Generate a FASHN.ai result and delete all images after delivery."""
    files_to_cleanup: list[str] = []
    request_id = request.headers.get("x-request-id", "unknown")

    try:
        cloth_type = map_category(category)

        human_image.file.seek(0)
        image_bytes = human_image.file.read(MAX_UPLOAD_SIZE_BYTES + 1)
        human_image.file.seek(0)
        dedup_key: Optional[str] = None
        if len(image_bytes) <= MAX_UPLOAD_SIZE_BYTES:
            image_fingerprint = hashlib.sha256(image_bytes).hexdigest()
            dedup_key = _make_dedup_key(
                garment_image_url,
                category,
                f"{session_id or ''}:{image_fingerprint}",
            )
        _cleanup_expired_cache()
        cached_result = _DEDUP_CACHE.get(dedup_key) if dedup_key else None
        if cached_result:
            cached_path, _ = cached_result
            if os.path.exists(cached_path):
                return FileResponse(
                    path=cached_path,
                    media_type="image/png",
                    filename="tryon_result.png",
                )
            if dedup_key:
                _DEDUP_CACHE.pop(dedup_key, None)

        human_image_path = save_upload_to_temp(human_image, TEMP_DIR, MAX_UPLOAD_SIZE_BYTES)
        files_to_cleanup.append(human_image_path)
        garment_image_path = await download_url_to_temp(garment_image_url, TEMP_DIR, MAX_UPLOAD_SIZE_BYTES)
        files_to_cleanup.append(garment_image_path)
        result_image_path = await run_tryon_with_retry(
            human_img_path=human_image_path,
            garment_img_path=garment_image_url,  # pass the public URL directly — FASHN.ai fetches it
            cloth_type=cloth_type,
        )
        if dedup_key:
            _DEDUP_CACHE[dedup_key] = (
                result_image_path,
                _time.time() + _DEDUP_TTL_SECONDS,
            )
    except httpx.HTTPError as error:
        cleanup_files(files_to_cleanup)
        logger.error("FASHN.ai processing failed [%s]: %s", request_id, error)
        _raise_vton_http_error(502, "FASHN_API_FAILURE", "FASHN.ai processing failed.")
    except ValueError as error:
        cleanup_files(files_to_cleanup)
        status_code, error_code = _validation_error_from_message(str(error))
        _raise_vton_http_error(status_code, error_code, str(error))
    except RuntimeError as error:
        cleanup_files(files_to_cleanup)
        logger.error("FASHN.ai processing failed [%s]: %s", request_id, error)
        _raise_vton_http_error(502, "FASHN_API_FAILURE", "FASHN.ai processing failed.")
    except OSError as error:
        cleanup_files(files_to_cleanup)
        logger.error("Temporary image processing failed [%s]: %s", request_id, error)
        _raise_vton_http_error(500, "TEMPORARY_IMAGE_PROCESSING_FAILED", "Temporary image processing failed.")

    background_tasks.add_task(cleanup_files, files_to_cleanup)
    return FileResponse(
        path=result_image_path,
        media_type="image/png",
        filename="tryon_result.png",
        background=background_tasks,
    )
