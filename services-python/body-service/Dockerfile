# ── Manikan Body Service (SMPL engine) ──────────────────────────────────
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8001 \
    BODY_MODEL_DIR=/app/models

WORKDIR /app

# torch/smplx/trimesh/scipy all ship manylinux wheels for py3.11 — no compiler
# toolchain needed, which keeps the image lean.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code. The licensed SMPL .pkl files are excluded via .dockerignore and
# must be provided at runtime (e.g. mounted volume or a secret store):
#   docker run -v "$(pwd)/models/smpl:/app/models/smpl" -p 8001:8001 body-service
COPY . .

EXPOSE 8001
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
