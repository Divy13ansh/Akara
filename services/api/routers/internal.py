"""Internal endpoints (plan Phase 5): render-callback from the video worker and
the legacy /token minting endpoint for the voice flow."""

from __future__ import annotations

import json
import logging
import time
from datetime import UTC, datetime

from akara_db.enums import MasteryStatus, MediaStatus
from akara_db.models import Concept, ConceptMedia, UserConceptMastery, VideoRenderJob
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from services.api.config import settings
from services.api.deps import DbSession, require_webhook_secret
from services.api.redis_client import cache_invalidate, cache_invalidate_pattern, cache_set_json

logger = logging.getLogger("akara-internal")

router = APIRouter(tags=["internal"])


@router.post("/internal/render-callback", dependencies=[Depends(require_webhook_secret)])
async def render_callback(payload: dict, session: DbSession):
    """Video worker → API after upload to R2 (or on failure).

    Expected payload: {video_id, status: complete|failed, concept_id, lang,
    video_r2_key?, thumbnail_r2_key?, audio_r2_key?, duration_seconds?,
    size_bytes?, stage_timings?, error?}"""
    video_id = payload.get("video_id")
    if not video_id:
        raise HTTPException(400, "video_id required")

    job = await session.get(VideoRenderJob, video_id)
    if job is None:
        raise HTTPException(404, "Unknown render job")
    concept_id = payload.get("concept_id") or job.concept_id
    lang = payload.get("lang") or job.lang
    status = payload.get("status", "failed")

    job.status = status
    job.current_stage = "done" if status == "complete" else "error"
    if payload.get("stage_timings"):
        job.stage_timings = payload["stage_timings"]
    if status == "complete":
        job.finished_at = datetime.now(UTC)
    if payload.get("error"):
        job.error = payload["error"]

    media = (
        await session.execute(
            select(ConceptMedia).where(
                ConceptMedia.concept_id == concept_id, ConceptMedia.lang == lang
            )
        )
    ).scalar_one_or_none()

    if media is not None:
        # The render is terminal — free the D-16 global render slot.
        from services.api.redis_client import release_render_slot

        await release_render_slot()
        if status == "complete":
            media.status = MediaStatus.COMPLETE
            media.current_stage = "done"
            media.progress_percent = 100
            media.video_r2_key = payload.get("video_r2_key")
            media.thumbnail_r2_key = payload.get("thumbnail_r2_key")
            media.audio_r2_key = payload.get("audio_r2_key")
            media.duration_seconds = payload.get("duration_seconds")
            media.size_bytes = payload.get("size_bytes")
            media.error = None
            media.completed_at = datetime.now(UTC)
        else:
            media.status = MediaStatus.FAILED
            media.error = payload.get("error", "render failed")

    await session.commit()

    # Refresh caches: genstatus + media langs + library language map.
    await cache_invalidate(
        f"cache:genstatus:{concept_id}:{lang}",
        f"cache:media:{concept_id}:langs",
        "cache:library:langs",
    )
    await cache_invalidate_pattern("cache:library:concepts")
    if concept_id:
        await cache_set_json(
            f"cache:genstatus:{concept_id}:{lang}",
            {
                "status": "instant" if status == "complete" else "failed",
                "progress_percent": 100 if status == "complete" else 0,
                "concept_id": concept_id,
                "language": lang,
            },
            settings.cache_ttl_genstatus,
        )

    logger.info("render callback: %s → %s", video_id, status)
    return {"ok": True, "video_id": video_id, "status": status}


@router.get("/token")
async def token(
    student_id: str,
    topic_id: str,
    lang: str = "hi",
    session: DbSession = None,
):
    """LiveKit token minting (legacy route; also proxied by nginx at /token).
    Checks concept unlock + media (soft warnings only — voice works without
    video)."""
    concept = await session.get(Concept, topic_id)
    if concept is None:
        raise HTTPException(404, f"unknown topic_id: {topic_id}")

    warnings = []
    m = (
        await session.execute(
            select(UserConceptMastery).where(
                UserConceptMastery.student_id == student_id,
                UserConceptMastery.concept_id == topic_id,
            )
        )
    ).scalar_one_or_none()
    if m is None or m.status == MasteryStatus.LOCKED:
        warnings.append("concept not yet unlocked for this student")

    media = (
        await session.execute(
            select(ConceptMedia).where(
                ConceptMedia.concept_id == topic_id,
                ConceptMedia.lang == lang,
                ConceptMedia.status == MediaStatus.COMPLETE,
            )
        )
    ).scalar_one_or_none()
    if media is None:
        warnings.append(f"no complete video for lang={lang}; voice will run script-only")

    url = settings_livekit_url()
    key, secret = settings_livekit_creds()
    room = f"{topic_id}-{student_id}-{int(time.time())}"
    metadata = {
        "topic": {
            "topic_id": concept.id,
            "topic": concept.name,
            "script": concept.script or "",
            "rubric": concept.rubric or "",
            "grade": str(concept.class_ or ""),
            "subject": concept.subject_id,
            "lang": lang,
            "rubric_levels": concept.rubric_levels or None,
        },
        "student_id": student_id,
        "room_name": room,
    }

    if url and key and secret:
        from livekit import api as lk_api

        token_obj = (
            lk_api.AccessToken(key, secret)
            .with_identity(student_id)
            .with_grants(lk_api.VideoGrants(room_join=True, room=room))
            .with_room_config(
                lk_api.RoomConfiguration(
                    agents=[
                        lk_api.RoomAgentDispatch(
                            agent_name="akara-voice", metadata=json.dumps(metadata)
                        )
                    ]
                )
            )
            .to_jwt()
        )
        jwt_token = token_obj
    else:
        jwt_token = "dev." + json.dumps(metadata)[:2000]

    return {"token": jwt_token, "room": room, "url": url, "topic": metadata["topic"], "warnings": warnings}


def settings_livekit_url() -> str:
    import os

    return os.getenv("LIVEKIT_URL", "")


def settings_livekit_creds() -> tuple[str, str]:
    import os

    return os.getenv("LIVEKIT_API_KEY", ""), os.getenv("LIVEKIT_API_SECRET", "")
