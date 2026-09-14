# API + worker image (shared). Build context: repo root.
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY services/api/requirements.txt /app/services/api/requirements.txt
RUN pip install --no-cache-dir -r /app/services/api/requirements.txt

# Copy what the api + worker need (no .venv, no node_modules)
COPY packages /app/packages
COPY services/api /app/services/api
COPY services/worker /app/services/worker
COPY services/scorer /app/services/scorer
COPY alembic.ini /app/alembic.ini
COPY alembic /app/alembic
COPY scripts /app/scripts

ENV PYTHONPATH=/app:/app/packages:/app/services
ENV PYTHONUNBUFFERED=1

# Migrate + idempotent seed on every boot (plan §3c), then run.
# The actual server/worker command comes from compose.
CMD ["uvicorn", "services.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
