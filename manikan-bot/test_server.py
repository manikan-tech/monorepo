from fastapi import FastAPI, UploadFile, Form, File, Request
import uvicorn
from typing import Optional

app = FastAPI()

@app.post("/test")
async def test_endpoint(
    request: Request,
    human_image: UploadFile = File(...),
    garment_image_url: str = Form(...),
    category: str = Form(...),
    session_id: Optional[str] = Form(default=None),
):
    return {"status": "ok", "url": garment_image_url, "cat": category}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8004)
