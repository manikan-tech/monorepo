# FastAPI application configuration and Virtual Try-On HTTP routes.
import logging
import os
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from gradio_client.exceptions import AppError

from services.vton_client import is_client_initialized, run_tryon_with_retry
from utils.category_mapper import map_category
from utils.image_handler import cleanup_files, download_url_to_temp, save_upload_to_temp

logger = logging.getLogger(__name__)
TEMP_DIR = str(Path(__file__).resolve().parent / "tmp")
os.makedirs(TEMP_DIR, exist_ok=True)

SUPPORTED_CATEGORIES = ["blouse", "shirt", "jacket", "pants", "skirt", "dress"]
MIN_HUMAN_IMAGE_WIDTH = 400
MIN_HUMAN_IMAGE_HEIGHT = 600
MIN_GARMENT_IMAGE_WIDTH = 300
MIN_GARMENT_IMAGE_HEIGHT = 300
MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024


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

app = FastAPI(title="Manikan VTON Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str | bool]:
    """Return service and OOTDiffusion client health details."""
    return {
        "status": "ok",
        "service": "tryon-service",
        "version": "1.0.0",
        "model": "levihsu/OOTDiffusion",
        "client_initialized": is_client_initialized(),
    }


@app.get("/capabilities")
def capabilities() -> dict[str, object]:
    """Return model and validation capabilities for the frontend."""
    return {
        "service": "tryon-service",
        "model": "levihsu/OOTDiffusion",
        "supported_categories": SUPPORTED_CATEGORIES,
        "min_image_dimensions": {
            "human": {"width": MIN_HUMAN_IMAGE_WIDTH, "height": MIN_HUMAN_IMAGE_HEIGHT},
            "garment": {"width": MIN_GARMENT_IMAGE_WIDTH, "height": MIN_GARMENT_IMAGE_HEIGHT},
        },
        "max_upload_size_bytes": MAX_UPLOAD_SIZE_BYTES,
        "client_initialized": is_client_initialized(),
    }


@app.post("/api/vton/2d", response_class=FileResponse)
async def tryon_2d(
    request: Request,
    background_tasks: BackgroundTasks,
    human_image: UploadFile = File(...),
    garment_image_url: str = Form(...),
    category: str = Form(...),
    session_id: Optional[str] = Form(default=None),
) -> FileResponse:
    """Generate an OOTDiffusion result and delete all images after delivery."""
    del session_id
    files_to_cleanup: list[str] = []
    request_id = request.headers.get("x-request-id", "unknown")

    try:
        cloth_type = map_category(category)
        human_image_path = save_upload_to_temp(human_image, TEMP_DIR)
        files_to_cleanup.append(human_image_path)
        garment_image_path = download_url_to_temp(garment_image_url, TEMP_DIR)
        files_to_cleanup.append(garment_image_path)
        result_image_path = run_tryon_with_retry(
            human_img_path=human_image_path,
            garment_img_path=garment_image_path,
            cloth_type=cloth_type,
        )
        files_to_cleanup.append(result_image_path)
    except AppError as error:
        cleanup_files(files_to_cleanup)
        logger.error("OOTDiffusion processing failed [%s]: %s", request_id, error)
        _raise_vton_http_error(502, "OOTDIFFUSION_FAILURE", "OOTDiffusion processing failed.")
    except ValueError as error:
        cleanup_files(files_to_cleanup)
        status_code, error_code = _validation_error_from_message(str(error))
        _raise_vton_http_error(status_code, error_code, str(error))
    except RuntimeError as error:
        cleanup_files(files_to_cleanup)
        logger.error("OOTDiffusion processing failed [%s]: %s", request_id, error)
        _raise_vton_http_error(502, "OOTDIFFUSION_FAILURE", "OOTDiffusion processing failed.")
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
