# Voice worker image. Build context: repo root.
# NOTE: requires the VEXYL-STT server reachable — see docs/vexyl-stt.md.
# Part of the default stack: docker compose up -d (no --profile needed)
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY services/voice/requirements.txt /app/services/voice/requirements.txt
RUN pip install --no-cache-dir -r /app/services/voice/requirements.txt

COPY packages /app/packages
COPY services/voice /app/services/voice

ENV PYTHONPATH=/app:/app/packages:/app/services
ENV PYTHONUNBUFFERED=1

WORKDIR /app/services/voice

# `python agent.py start` runs the LiveKit agent worker (production mode).
CMD ["python", "agent.py", "start"]
