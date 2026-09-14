"""API settings loaded from .env.local / environment."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _split_origins(raw: str) -> list[str]:
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


@dataclass
class Settings:
    app_name: str = "akara-api"

    # auth
    jwt_secret: str = field(default_factory=lambda: os.getenv("JWT_SECRET", "dev-insecure-secret"))
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 7

    # google OAuth (GIS id_token flow — only the client id is needed).
    # GOOGLE_CLIENT_IDS (comma-separated) allows for web + localhost + extra
    # OAuth clients; every id_token/access_token audience is checked against
    # this list so a frontend/backend client-id mismatch fails closed with a
    # clear log instead of a bare 400.
    google_client_id: str = field(default_factory=lambda: os.getenv("GOOGLE_CLIENT_ID", ""))
    google_client_ids: list[str] = field(
        default_factory=lambda: [
            c.strip()
            for c in (
                os.getenv("GOOGLE_CLIENT_IDS", "") + "," + os.getenv("GOOGLE_CLIENT_ID", "")
            ).split(",")
            if c.strip()
        ]
    )

    # CORS (irrelevant in composed mode where nginx proxies same-origin /api)
    web_origins: list[str] = field(
        default_factory=lambda: _split_origins(
            os.getenv("WEB_ORIGIN", "http://localhost:3000,http://localhost")
        )
    )

    # webhooks / internal calls
    webhook_secret: str = field(default_factory=lambda: os.getenv("WEBHOOK_SECRET", ""))

    # video service
    video_service_url: str = field(
        default_factory=lambda: os.getenv("VIDEO_SERVICE_URL", "http://video:8001")
    )

    # R2 / CDN
    r2_account_id: str = field(default_factory=lambda: os.getenv("R2_ACCOUNT_ID", ""))
    r2_endpoint: str = field(default_factory=lambda: os.getenv("R2_ENDPOINT", ""))
    r2_access_key_id: str = field(default_factory=lambda: os.getenv("R2_ACCESS_KEY_ID", ""))
    r2_secret_access_key: str = field(default_factory=lambda: os.getenv("R2_SECRET_ACCESS_KEY", ""))
    r2_bucket: str = field(default_factory=lambda: os.getenv("R2_BUCKET", "akara"))
    media_cdn_base: str = field(default_factory=lambda: os.getenv("MEDIA_CDN_BASE", "").rstrip("/"))

    # caching TTLs (seconds) — plan §3b
    cache_ttl_global: int = 600  # curriculum/library/media payloads
    cache_ttl_user: int = 60  # per-user mastery overlays
    cache_ttl_genstatus: int = 2  # generation-status polls

    # rate limits (requests per window) — plan §3b
    rl_login_per_min: int = 10
    rl_signup_per_min: int = 5
    rl_evaluate_per_min: int = 20
    rl_langreq_per_day: int = 5
    rl_heartbeat_per_min: int = 2

    # mastery gate (docs/database.md §6)
    mastery_threshold: float = 0.7

    # render retry budget per (concept, lang) — plan Phase 5
    render_max_auto_retries: int = 2

    # a pending job with no progress for this long is considered dead
    # (video container restarted / crashed before callback) — genstatus sweeps it
    render_stale_minutes: int = 20


settings = Settings()
