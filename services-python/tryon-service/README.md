# Manikan Try-On Service

FastAPI microservice for OOTDiffusion virtual try-on processing. Uploaded and downloaded
images are kept only in `tmp` during processing and are deleted after the response.

## Getting Started

1. Set up a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the development server:
   ```bash
   uvicorn main:app --reload --port 8003
   ```
