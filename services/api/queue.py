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


async def enqueue_scoring(session_id: str) -> bool:
    global _queue
    try:
        if _queue is None:
            _queue = await create_pool(_redis_settings())
        await _queue.enqueue_job("score_session", session_id, _job_id=f"score:{session_id}")
        return True
    except Exception as e:
        # Redis down: transcript is already persisted; the worker's startup
        # sweep will re-enqueue unscored sessions (plan §3b failure stance).
        logger.error("enqueue failed (worker sweep will recover): %s", e)
        return False
