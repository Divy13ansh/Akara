"""R2 upload + API render-callback for the video worker (plan Phase 5).

After a successful stitch: upload final.mp4 (+ poster + audio) to R2 with
immutable cache headers, then POST /internal/render-callback so the API flips
concept_media to complete and serves CDN URLs (D-17)."""

from __future__ import annotations

import json
import os
from pathlib import Path

import requests


def _s3_client():
    import boto3
    from botocore.client import Config

    endpoint = os.getenv("R2_ENDPOINT") or (
        f"https://{os.getenv('R2_ACCOUNT_ID', '')}.r2.cloudflarestorage.com"
        if os.getenv("R2_ACCOUNT_ID")
        else ""
    )
    if not endpoint or not os.getenv("R2_ACCESS_KEY_ID"):
        raise RuntimeError("R2 not configured (R2_ENDPOINT / R2_ACCESS_KEY_ID missing)")

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def _transfer_config():
    from boto3.s3.transfer import TransferConfig

    return TransferConfig(
        multipart_threshold=8 * 1024 * 1024,
        multipart_chunksize=8 * 1024 * 1024,
        max_concurrency=4,
        use_threads=True,
    )


def _poster_from_video(final_path: Path, out_path: Path) -> bool:
    import subprocess

    try:
        subprocess.run(
            ["ffmpeg", "-y", "-ss", "2", "-i", str(final_path),
             "-frames:v", "1", "-q:v", "3", str(out_path)],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60,
        )
        return out_path.exists()
    except Exception:
        return False


def publish_render_result(
    video_id: str,
    concept_id: str,
    lang: str,
    final_video_path: Path,
    outputs_dir: Path,
    stage_timings: dict | None = None,
) -> dict:
    """Upload artifacts to R2 and notify the API. Returns the callback payload.

    Best-effort: failures raise so the pipeline marks the job failed."""
    bucket = os.getenv("R2_BUCKET", "akara")
    base = f"videos/{concept_id}/{lang}/{video_id}"

    keys: dict[str, str] = {}
    s3 = _s3_client()
    cfg = _transfer_config()
    cache = "public, max-age=31536000, immutable"

    video_key = f"{base}/final.mp4"
    s3.upload_file(
        str(final_video_path), bucket, video_key,
        ExtraArgs={"ContentType": "video/mp4", "CacheControl": cache},
        Config=cfg,
    )
    keys["video_r2_key"] = video_key

    poster = final_video_path.parent / "poster.jpg"
    if _poster_from_video(final_video_path, poster):
        thumb_key = f"{base}/poster.jpg"
        s3.upload_file(str(poster), bucket, thumb_key,
                       ExtraArgs={"ContentType": "image/jpeg", "CacheControl": cache},
                       Config=cfg)
        keys["thumbnail_r2_key"] = thumb_key

    audio = final_video_path.parent / "audio.mp3"
    if audio.exists():
        audio_key = f"{base}/audio.mp3"
        s3.upload_file(str(audio), bucket, audio_key,
                       ExtraArgs={"ContentType": "audio/mpeg", "CacheControl": cache},
                       Config=cfg)
        keys["audio_r2_key"] = audio_key

    size_bytes = final_video_path.stat().st_size
    duration_seconds = _probe_duration(final_video_path)

    payload = {
        "video_id": video_id,
        "status": "complete",
        "concept_id": concept_id,
        "lang": lang,
        "duration_seconds": duration_seconds,
        "size_bytes": size_bytes,
        "stage_timings": stage_timings or {},
        **keys,
    }
    _post_callback(payload)
    return payload


def notify_render_failed(video_id: str, concept_id: str, lang: str, error: str) -> None:
    _post_callback({
        "video_id": video_id, "status": "failed",
        "concept_id": concept_id, "lang": lang, "error": error[:1000],
    })


def _probe_duration(path: Path) -> int | None:
    import subprocess

    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "json", str(path)],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30,
        )
        return int(float(json.loads(out.stdout)["format"]["duration"]))
    except Exception:
        return None


def _post_callback(payload: dict) -> None:
    api = os.getenv("AKARA_API_URL", "http://api:8000")
    secret = os.getenv("WEBHOOK_SECRET", "")
    try:
        r = requests.post(
            f"{api}/internal/render-callback",
            json=payload,
            headers={"X-Webhook-Secret": secret},
            timeout=15,
        )
        r.raise_for_status()
        print(f"[r2] callback ok: {payload.get('video_id')} → {payload.get('status')}")
    except Exception as e:
        print(f"[r2] callback failed (API will sweep genstatus): {e}")
