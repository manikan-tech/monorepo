# Tryon Service

FastAPI microservice for virtual try-on models and Replicate API integration.

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
   uvicorn app.main:app --reload --port 8003
   ```
