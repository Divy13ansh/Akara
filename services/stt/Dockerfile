# VEXYL-STT — self-hosted STT wrapping ai4bharat/indic-conformer-600m-multilingual.
# Vendored from the upstream repo (Apache-2.0, see LICENSE.vexyl-stt) so the
# Akara repo is self-contained: `docker compose up` needs nothing outside it.
#
# Model strategy (VPS-friendly):
#   The gated ~2.4GB model is downloaded at CONTAINER START into the
#   `stt_models` volume (HF_HOME=/models/hf), using HF_TOKEN from the
#   environment. It is NOT baked into the image — no build-time secret, no
#   token in image layers, and the 2.4GB sits in a volume you can back up.
#   First boot downloads it (~5–15 min depending on link); later boots are
#   cache hits and load in ~15s.
FROM python:3.11-slim

# libgomp1: PyTorch OpenMP · libsndfile1: soundfile · ffmpeg: batch MP3/M4A
RUN apt-get update && \
    apt-get install -y --no-install-recommends libgomp1 libsndfile1 ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU-only torch first so the big layer caches independently.
RUN pip install --no-cache-dir \
    torch torchaudio \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY vexyl_stt_server.py entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Persistent model cache lives outside the container filesystem.
ENV HF_HOME=/models/hf \
    VEXYL_STT_HOST=0.0.0.0 \
    PORT=8091 \
    VEXYL_STT_DEVICE=cpu

EXPOSE 8091

HEALTHCHECK --interval=15s --timeout=10s --retries=20 --start-period=60s \
    CMD curl -fsS http://localhost:8091/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
