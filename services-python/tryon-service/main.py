import os
import shutil
import uuid
from typing import Optional, List
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from gradio_client import Client, handle_file

# Load environment variables from .env file
load_dotenv()

# Retrieve and validate HF_TOKEN
HF_TOKEN = os.getenv("HF_TOKEN")
if not HF_TOKEN:
    raise ValueError("HF_TOKEN is not set in the environment variables.")

# Initialize the FastAPI App
app = FastAPI(
    title="Manikan Tryon Service",
    description="Backend service for Virtual Try-On integration with Hugging Face IDM-VTON",
    version="1.0.0"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict this to specific origins in a strict production environment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure the local tmp directory exists for storing temporary uploads (Zero-Retention Policy)
TEMP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tmp")
os.makedirs(TEMP_DIR, exist_ok=True)

# Initialize Gradio Client globally
try:
    client = Client("yisol/IDM-VTON", token=HF_TOKEN)
except Exception as e:
    print(f"Warning: Failed to initialize Gradio client on startup: {e}")
    client = None

def cleanup_files(paths: List[str]):
    """Background task to delete temporary files to satisfy the Zero-Retention Policy."""
    for path in paths:
        if path and os.path.exists(path):
            try:
                if os.path.isdir(path):
                    shutil.rmtree(path)
                else:
                    os.remove(path)
                print(f"Successfully cleaned up temporary path: {path}")
            except Exception as e:
                print(f"Error cleaning up path {path}: {e}")

@app.get("/")
def read_root():
    return {
        "service": "tryon-service",
        "status": "active",
        "model": "yisol/IDM-VTON",
        "client_initialized": client is not None
    }

@app.post("/api/vton/2d")
async def tryon_2d(
    background_tasks: BackgroundTasks,
    human_image: UploadFile = File(...),
    garment_image_url: str = Form(...),
    category: str = Form(...),
    description: Optional[str] = Form(None)
):
    """
    Virtual Try-On 2D API Endpoint.
    Accepts human body photo upload, garment URL, category, and optional garment description.
    Processes the request via Hugging Face yisol/IDM-VTON and cleans files immediately.
    """
    # Enforce strict validation on categories as expected by the model
    # Allowed categories: 'upper_body' (tops/blouses), 'lower_body' (pants/skirts), 'dress' (full-body dresses)
    allowed_categories = {"upper_body", "lower_body", "dress"}
    if category not in allowed_categories:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category '{category}'. Must be one of: {list(allowed_categories)}"
        )

    # Resolve Gradio client if initialization on startup was deferred or failed
    global client
    if client is None:
        try:
            client = Client("yisol/IDM-VTON", token=HF_TOKEN)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Gradio client is unavailable and failed to initialize: {e}"
            )

    # 1. Save the uploaded human image to a temporary file locally
    file_ext = os.path.splitext(human_image.filename)[1] or ".png"
    temp_filename = f"{uuid.uuid4()}{file_ext}"
    temp_human_path = os.path.join(TEMP_DIR, temp_filename)

    try:
        with open(temp_human_path, "wb") as buffer:
            shutil.copyfileobj(human_image.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded image: {e}")

    # Initialize task-specific cleanup list
    files_to_cleanup = [temp_human_path]

    try:
        # Map parameters for client prediction
        # IDM-VTON Model expects either 'upper_body', 'lower_body', or 'dress' ('dresses')
        # We pass category directly as it accepts upper_body, lower_body, and dress/dresses.
        # Let's map 'dress' to 'dresses' if IDM-VTON expectations prefer 'dresses'
        api_category = "dresses" if category == "dress" else category

        # 2. Call the IDM-VTON model via gradio_client
        # We wrap the local user photo with handle_file, but supply the remote garment URL directly.
        prediction_result = client.predict(
            dict={
                "background": handle_file(temp_human_path),
                "layers": [],
                "composite": None
            },
            garm_img=garment_image_url,
            garment_des=description or "",
            is_checked=True,
            is_checked_crop=True,
            denoise_steps=30.0,
            seed=42.0,
            api_name="/tryon"
        )

        # 3. Retrieve output paths from the prediction result
        # The space typically returns a tuple: (result_image_path, mask_image_path)
        if isinstance(prediction_result, (list, tuple)) and len(prediction_result) > 0:
            result_image_path = prediction_result[0]
        elif isinstance(prediction_result, str):
            result_image_path = prediction_result
        else:
            raise HTTPException(
                status_code=502,
                detail=f"Unexpected response format from try-on model: {prediction_result}"
            )

        if not result_image_path or not os.path.exists(result_image_path):
            raise HTTPException(
                status_code=502,
                detail="The try-on model succeeded but did not return a valid result image path."
            )

        # We also queue the Gradio-downloaded result image for cleanup after it is sent
        files_to_cleanup.append(result_image_path)
        if isinstance(prediction_result, (list, tuple)) and len(prediction_result) > 1:
            files_to_cleanup.append(prediction_result[1])

        # 4. Schedule background deletion of temporary files to comply with Zero-Retention Policy
        background_tasks.add_task(cleanup_files, files_to_cleanup)

        # 5. Return the generated image response
        return FileResponse(
            path=result_image_path,
            media_type="image/png",
            filename="tryon_result.png"
        )

    except Exception as e:
        # Clean up files immediately in case of prediction failure
        cleanup_files(files_to_cleanup)
        raise HTTPException(
            status_code=500,
            detail=f"Gradio try-on prediction failed: {str(e)}"
        )
