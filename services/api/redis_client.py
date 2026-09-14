"""Redis helpers: shared pool, cache-aside, distributed lock, rate limiting.

All shared state lives in Redis, never in process memory — the API runs
multiple uvicorn workers (plan §3b).
"""

from __future__ import annotations

import json
import os
import time
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import Any

from redis import asyncio as aioredis


@lru_cache
def get_redis() -> aioredis.Redis:
    url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    return aioredis.from_url(url, decode_responses=True)


# ------------------------------------------------------------------ cache


async def cache_get_json(key: str) -> Any | None:
    try:
        r = get_redis()
        raw = await r.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None  # Redis down ⇒ fall through to Postgres (plan §3b)


async def cache_set_json(key: str, value: Any, ttl: int) -> None:
    try:
        r = get_redis()
        await r.set(key, json.dumps(value, default=str), ex=ttl)
    except Exception:
        pass


async def cache_invalidate(*keys: str) -> None:
    try:
        r = get_redis()
        if keys:
            await r.delete(*keys)
    except Exception:
        pass


async def cache_invalidate_pattern(pattern: str) -> None:
    """Delete all keys matching a glob (e.g. 'cache:curriculum:*')."""
    try:
        r = get_redis()
        cur: str | int = 0
        while True:
            cur, keys = await r.scan(cursor=cur, match=pattern, count=200)
            if keys:
                await r.delete(*keys)
            if cur == 0:
                break
    except Exception:
        pass


# ------------------------------------------------------------------ locks


@asynccontextmanager
async def distributed_lock(name: str, ttl_seconds: int = 600):
    """SET NX PX lock. Yields True if WE hold the lock, False if someone else
    does. Callers must handle the False branch (attach-and-poll instead of
    create). Not reentrant; releases on exit if held."""
    r = get_redis()
    token = f"{time.time_ns()}"
    key = f"lock:{name}"
    acquired = False
    try:
        acquired = await r.set(key, token, nx=True, px=ttl_seconds * 1000)
        yield acquired
    finally:
        if acquired:
            # Release only if we still own it (compare-and-delete).
            try:
                if await r.get(key) == token:
                    await r.delete(key)
            except Exception:
                pass


# ------------------------------------------------------------------ rate limit


async def rate_limit(route: str, identifier: str, limit: int, window_seconds: int) -> bool:
    """Fixed-window counter. Returns True if allowed, False if over limit.
    Fails open (returns True) if Redis is unavailable (plan §3b)."""
    try:
        r = get_redis()
        now = int(time.time())
        window = now // window_seconds
        key = f"rl:{route}:{identifier}:{window}"
        count = await r.incr(key)
        if count == 1:
            await r.expire(key, window_seconds + 5)
        return count <= limit
    except Exception:
        return True


async def render_slots_max() -> int:
    """D-16 global render concurrency cap (1 by default). Overridable via env
    so the pilot can scale the video container without a code change."""
    try:
        return max(1, int(os.getenv("RENDER_MAX_CONCURRENT", "1")))
    except ValueError:
        return 1


async def acquire_render_slot() -> bool:
    """Global render semaphore (D-16): at most N renders machine-wide. Fails
    OPEN if Redis is down — the per-(concept, lang) dedup lock still guards
    correctness; this only throttles load."""
    try:
        r = get_redis()
        running = int(await r.get("render:running") or 0)
        if running >= await render_slots_max():
            return False
        await r.incr("render:running")
        await r.expire("render:running", 3600)  # safety expiry; decremented on release
        return True
    except Exception:
        return True


async def release_render_slot() -> None:
    try:
        r = get_redis()
        running = int(await r.get("render:running") or 0)
        if running > 1:
            await r.decr("render:running")
        else:
            await r.delete("render:running")
    except Exception:
        pass
