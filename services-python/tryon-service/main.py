# FastAPI application configuration and Virtual Try-On HTTP routes.
import logging
import os
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from gradio_client.exceptions import AppError

from services.vton_client import is_client_initialized, run_tryon_with_retry
from utils.category_mapper import map_category
from utils.image_handler import cleanup_files, download_url_to_temp, save_upload_to_temp

logger = logging.getLogger(__name__)
TEMP_DIR = str(Path(__file__).resolve().parent / "tmp")
os.makedirs(TEMP_DIR, exist_ok=True)

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


@app.post("/api/vton/2d", response_class=FileResponse)
async def tryon_2d(
    background_tasks: BackgroundTasks,
    human_image: UploadFile = File(...),
    garment_image_url: str = Form(...),
    category: str = Form(...),
    session_id: Optional[str] = Form(default=None),
) -> FileResponse:
    """Generate an OOTDiffusion result and delete all images after delivery."""
    del session_id
    files_to_cleanup: list[str] = []

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
        logger.error("OOTDiffusion processing failed: %s", error)
        raise HTTPException(status_code=502, detail="OOTDiffusion processing failed.") from error
    except ValueError as error:
        cleanup_files(files_to_cleanup)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        cleanup_files(files_to_cleanup)
        logger.error("OOTDiffusion processing failed: %s", error)
        raise HTTPException(status_code=502, detail="OOTDiffusion processing failed.") from error
    except OSError as error:
        cleanup_files(files_to_cleanup)
        logger.error("Temporary image processing failed: %s", error)
        raise HTTPException(status_code=500, detail="Temporary image processing failed.") from error

    background_tasks.add_task(cleanup_files, files_to_cleanup)
    return FileResponse(
        path=result_image_path,
        media_type="image/png",
        filename="tryon_result.png",
        background=background_tasks,
    )
