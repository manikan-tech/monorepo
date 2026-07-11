import os
import shutil
import uuid
import time
from typing import Optional, List, Any
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

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "tryon-service",
        "version": "1.0.0",
        "model": "yisol/IDM-VTON",
        "client_initialized": client is not None
    }

def predict_with_retry(*args: Any, **kwargs: Any) -> Any:
    """
    Invokes client.predict with retry logic.
    Only retries on RuntimeError, queue errors, or 503 errors.
    """
    max_retries = 3
    wait_seconds = 10
    
    # Remove category if passed so it does not cause TypeError in client.predict
    kwargs.pop("category", None)

    for attempt in range(1, max_retries + 1):
        try:
            return client.predict(*args, **kwargs)
        except Exception as e:
            err_str = str(e)
            
            # Check if this error is retryable
            is_runtime = isinstance(e, RuntimeError) or "RuntimeError" in err_str
            is_queue = "queue" in err_str.lower()
            is_503 = "503" in err_str
            
            should_retry = is_runtime or is_queue or is_503
            
            # Never retry on user input validation errors or parameter errors
            if "validation" in err_str.lower() or "ValueError" in err_str:
                should_retry = False

            if should_retry and attempt < max_retries:
                print(f"Prediction attempt {attempt} failed: {err_str}. Retrying in {wait_seconds}s...")
                time.sleep(wait_seconds)
            else:
                if should_retry:
                    print(f"Prediction attempt {attempt} failed: {err_str}. All retries exhausted.")
                raise e

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
    # Enforce strict validation on categories as expected by the model mapping
    # Accepts both friendly names (blouse, shirt, etc.) and direct model categories (upper_body, lower_body, dress)
    category_map = {
        "blouse": "upper_body",
        "shirt": "upper_body",
        "jacket": "upper_body",
        "upper_body": "upper_body",
        "pants": "lower_body",
        "skirt": "lower_body",
        "lower_body": "lower_body",
        "dress": "dresses",
    }
    if category not in category_map:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category '{category}'. Must be one of: {list(category_map.keys())}"
        )
    mapped_category = category_map[category]

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

    # 1.5. Download/Save garment image locally if it's a URL
    temp_garment_path = None
    if garment_image_url.startswith("http://") or garment_image_url.startswith("https://"):
        try:
            import requests
            r = requests.get(garment_image_url, stream=True, timeout=10)
            r.raise_for_status()
            
            ext = ".png"
            if "." in garment_image_url.split("/")[-1]:
                potential_ext = os.path.splitext(garment_image_url.split("/")[-1])[1]
                if potential_ext.lower() in [".jpg", ".jpeg", ".png", ".webp"]:
                    ext = potential_ext
            
            temp_g_filename = f"{uuid.uuid4()}{ext}"
            temp_garment_path = os.path.join(TEMP_DIR, temp_g_filename)
            with open(temp_garment_path, "wb") as f:
                shutil.copyfileobj(r.raw, f)
            files_to_cleanup.append(temp_garment_path)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to fetch garment image from URL '{garment_image_url}': {e}"
            )
    else:
        # If it's a relative path, resolve it relative to the monorepo's store public folder
        try:
            monorepo_base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            local_path = os.path.join(monorepo_base, "apps", "store", "public", garment_image_url.lstrip("/"))
            if os.path.exists(local_path):
                temp_garment_path = local_path
        except Exception as e:
            print(f"Warning: Failed to resolve local garment path: {e}")

    try:
        # 2. Call the IDM-VTON model via gradio_client with retry logic
        # We wrap both the local user photo and the downloaded garment image with handle_file.
        garm_input = handle_file(temp_garment_path) if temp_garment_path else garment_image_url
        prediction_result = predict_with_retry(
            dict={
                "background": handle_file(temp_human_path),
                "layers": [],
                "composite": None
            },
            garm_img=garm_input,
            garment_des=description or "",
            is_checked=True,
            is_checked_crop=False,  # True triggers a RuntimeError on the HF Space for most inputs
            denoise_steps=30.0,
            seed=42.0,
            api_name="/tryon",
            category=mapped_category
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
        print(f"ERROR: Try-on prediction failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Gradio try-on prediction failed: {str(e)}"
        )
