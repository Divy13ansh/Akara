"""One-time boot initialization: schema check + idempotent catalog seed.

Runs inside the api and worker containers before they serve traffic (plan §3c:
"auto-runs alembic + idempotent seeds on boot"). Safe for concurrent boots —
a Postgres session-level advisory lock (class 42) on ONE pinned connection
serialises the whole check+seed, so parallel uvicorn workers and the arq
worker can never double-seed a half-empty catalog.

The DDL itself is owned by Alembic (`alembic upgrade head` at deploy time);
here we only VERIFY the schema is present and fail loud with the fix command
if someone skipped migrations.
"""

from __future__ import annotations

import logging
from pathlib import Path

log = logging.getLogger("akara.boot")

ROOT = Path(__file__).resolve().parents[1]

SEED_LOCK_KEY = 42


async def run_boot_init() -> None:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env.local")

    # 0. secrets guard (VPS safety): never boot with forgeable JWTs or an
    # open webhook/callback surface. Fresh clones must fill .env.local first
    # (see .env.example); this fails loud instead of running insecure.
    from services.api.config import settings

    if (
        not settings.jwt_secret
        or settings.jwt_secret == "dev-insecure-secret"
        or len(settings.jwt_secret) < 32
    ):
        log.critical("JWT_SECRET missing/default — generate one (openssl rand -hex 32)")
        raise RuntimeError("JWT_SECRET must be set to a strong random value in .env.local")
    if not settings.webhook_secret:
        log.critical("WEBHOOK_SECRET missing — webhooks and render callbacks are unguarded")
        raise RuntimeError("WEBHOOK_SECRET must be set in .env.local")

    from akara_db.base import get_engine
    from sqlalchemy import text

    engine = get_engine()
    # One pinned connection: advisory locks live per-connection, so the lock,
    # the emptiness check and the unlock MUST share the same connection.
    async with engine.connect() as conn:
        # 1. schema presence check (fail loud, name the fix)
        res = await conn.execute(text(
            "SELECT count(*) FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'subjects'"))
        if (res.scalar() or 0) == 0:
            log.critical(
                "Schema missing — run `alembic upgrade head` before starting the api")
            raise RuntimeError(
                "Database schema not found. Run `alembic upgrade head` first.")

        # 2. seed-if-empty under the advisory lock (blocks if another process
        # is mid-seed, then re-checks — never double-seeds).
        await conn.execute(text(f"SELECT pg_advisory_lock({SEED_LOCK_KEY})"))
        try:
            counts = await conn.execute(text(
                "SELECT (SELECT count(*) FROM subjects) AS s, "
                "(SELECT count(*) FROM concepts) AS c"))
            row = counts.mappings().first() or {}
            # Commit the check transaction BEFORE seeding: the seed TRUNCATEs
            # on other connections, and our open snapshot (AccessShare locks)
            # would block it forever — self-deadlock. Advisory locks are
            # session-level and survive COMMIT, so the seed stays serialised.
            await conn.commit()
            if (row.get("s") or 0) > 0 and (row.get("c") or 0) > 0:
                log.info("catalog present (%s subjects, %s concepts) — seed skipped",
                         row.get("s"), row.get("c"))
                return
            log.info("empty catalog — seeding full NCERT catalog from syllabus.json…")
            await _run_seeds()
            await conn.commit()
        finally:
            await conn.execute(text(f"SELECT pg_advisory_unlock({SEED_LOCK_KEY})"))

    log.info("boot seed complete")


async def _run_seeds() -> None:
    from scripts.seed_curriculum import seed as seed_curriculum

    await seed_curriculum()

    from scripts.seed_gold_topics import seed as seed_gold

    await seed_gold()
