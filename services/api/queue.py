"""arq enqueue helper (D-15). Jobs carry the session id; the worker dedupes."""

from __future__ import annotations

import logging
import os

from arq import create_pool
from arq.connections import RedisSettings

logger = logging.getLogger("akara-queue")

_queue = None


def _redis_settings() -> RedisSettings:
    url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    # redis://[[user]:pwd@]host:port/db
    rest = url.split("://", 1)[1]
    hostport = rest.split("/", 1)[0]
    host, _, port = hostport.partition(":")
    db = int(rest.split("/", 1)[1]) if "/" in rest else 0
    return RedisSettings(host=host or "localhost", port=int(port or 6379), database=db)


async def _get_queue():
    global _queue
    if _queue is None:
        _queue = await create_pool(_redis_settings())
    return _queue


async def enqueue_scoring(session_id: str) -> bool:
    try:
        q = await _get_queue()
        await q.enqueue_job("score_session", session_id, _job_id=f"score:{session_id}")
        return True
    except Exception as e:
        # Redis down: transcript is already persisted; the worker's startup
        # sweep will re-enqueue unscored sessions (plan §3b failure stance).
        logger.error("enqueue failed (worker sweep will recover): %s", e)
        return False


async def enqueue_quiz_generation(concept_id: str, lang: str, fresh: bool = False) -> bool:
    """One Azure call per (concept, lang) — deduped by arq job id (D-7).

    fresh=True mints a unique job id for recovery re-enqueues: arq never
    re-runs a completed job id, so retrying a crashed run under the same id
    would silently no-op and leave the row stuck at 'generating' forever."""
    try:
        q = await _get_queue()
        job_id = f"quiz:{concept_id}:{lang}"
        if fresh:
            import uuid

            job_id = f"{job_id}:retry-{uuid.uuid4().hex[:8]}"
        await q.enqueue_job(
            "quiz_generation_task",
            concept_id,
            lang,
            _job_id=job_id,
        )
        return True
    except Exception as e:
        logger.error("quiz enqueue failed for %s [%s]: %s", concept_id, lang, e)
        return False
