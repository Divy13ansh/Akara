#!/bin/sh
# Download the gated IndicConformer model into the HF cache volume, then start.
# Requires HF_TOKEN in the environment (compose passes it from .env.local).
# See docs/backend-api-mapping.md + docs/vexyl-stt.md for the VPS checklist.
set -e

MODEL_ID="${STT_MODEL_ID:-ai4bharat/indic-conformer-600m-multilingual}"

echo "[stt] ensuring model ${MODEL_ID} is in ${HF_HOME} ..."
python - "$MODEL_ID" <<'PY'
import os
import shutil
import sys
from pathlib import Path

from huggingface_hub import snapshot_download

model_id = sys.argv[1]
token = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN")

# The model ships ONNX weights split into external-data files, and onnxruntime
# refuses external data reached through a symlink:
#   External data path validation failed ... escapes model directory
# huggingface_hub links every snapshot file to hub/blobs/<sha>, which is exactly
# that case. HF_HUB_DISABLE_SYMLINKS=1 (Dockerfile) makes NEW downloads copy
# instead, but a volume populated before that flag existed is still symlinked
# and snapshot_download counts a live symlink as a cache hit — so convert the
# existing pointers to real files once, in place. Costs one extra copy of the
# model on disk; nothing is re-downloaded.
cache_root = Path(os.getenv("HF_HOME", "/models/hf")) / "hub"
converted = 0
if cache_root.is_dir():
    for path in cache_root.rglob("*"):
        if not path.is_symlink():
            continue
        target = path.resolve()
        if not target.is_file():
            path.unlink(missing_ok=True)  # dangling pointer: let the download redo it
            continue
        tmp = path.with_name(path.name + ".materialize.tmp")
        shutil.copyfile(target, tmp)
        os.replace(tmp, path)
        converted += 1
    if converted:
        print(f"[stt] materialized {converted} cached files (no symlinks for onnxruntime)")

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
