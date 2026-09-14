#!/bin/sh
# Download the gated IndicConformer model into the HF cache volume, then start.
# Requires HF_TOKEN in the environment (compose passes it from .env.local).
# See docs/backend-api-mapping.md + docs/vexyl-stt.md for the VPS checklist.
set -e

MODEL_ID="${STT_MODEL_ID:-ai4bharat/indic-conformer-600m-multilingual}"

echo "[stt] ensuring model ${MODEL_ID} is in ${HF_HOME} ..."
python - "$MODEL_ID" <<'PY'
import os
import sys

from huggingface_hub import snapshot_download

model_id = sys.argv[1]
token = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN")
try:
    snapshot_download(model_id, token=token)
    print(f"[stt] model ready: {model_id}")
except Exception as exc:  # noqa: BLE001 - entrypoint must explain itself
    print(
        f"[stt] FATAL: could not download {model_id}.\n"
        f"       reason: {exc}\n"
        f"       The model repo is GATED. Create a HuggingFace token with access at\n"
        f"       https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual\n"
        f"       and set HF_TOKEN in .env.local, then re-run docker compose up stt.",
        flush=True,
    )
    sys.exit(1)
PY

echo "[stt] starting VEXYL-STT server ..."
exec python -u vexyl_stt_server.py
