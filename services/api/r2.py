"""Cloudflare R2 client (S3 API) + public URL building (plan Phase 5, D-17)."""

from __future__ import annotations

from functools import lru_cache

from boto3.s3.transfer import TransferConfig

from services.api.config import settings


@lru_cache
def get_s3():
    import boto3
    from botocore.client import Config

    endpoint = settings.r2_endpoint or (
        f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
        if settings.r2_account_id
        else ""
    )
    if not endpoint or not settings.r2_access_key_id:
        raise RuntimeError("R2 not configured: set R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY")
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def video_transfer_config() -> TransferConfig:
    """Tuned for 50-200MB MP4s (plan §7)."""
    return TransferConfig(
        multipart_threshold=8 * 1024 * 1024,
        multipart_chunksize=8 * 1024 * 1024,
        max_concurrency=4,
        use_threads=True,
    )


def public_url(key: str) -> str:
    """MEDIA_CDN_BASE + key (D-17 public CDN URLs; DB stores keys only)."""
    return f"{settings.media_cdn_base}/{key.lstrip('/')}"


def video_key(concept_id: str, lang: str, video_id: str, filename: str) -> str:
    return f"videos/{concept_id}/{lang}/{video_id}/{filename}"
