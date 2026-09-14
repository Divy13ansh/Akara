"""Client for the video render service (plan Phase 5)."""

from __future__ import annotations

import logging

import httpx

from services.api.config import settings

logger = logging.getLogger("akara-video-client")


async def trigger_render(concept_id: str, topic: str, language: str, video_id: str) -> bool:
    """POST /explain on the video service (async mode). Returns True if accepted."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{settings.video_service_url}/explain",
                json={
                    "topic_id": concept_id,
                    "topic": topic,
                    "language": language,
                    "sync": False,
                    "video_id": video_id,  # echo our render-job id back on /internal/render-callback
                },
                headers={"X-Webhook-Secret": settings.webhook_secret},
            )
            if r.status_code in (200, 201, 202):
                logger.info("Render triggered for %s (%s) → video_id=%s", concept_id, language, video_id)
                return True
            logger.error("Render trigger failed (%s): %s", r.status_code, r.text[:300])
            return False
    except Exception as e:
        logger.error("Render trigger error: %s", e)
        return False
