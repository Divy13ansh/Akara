"""akara-api — FastAPI app assembling all routers (plan §9)."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(".env.local")
load_dotenv()

logging.basicConfig(level=logging.INFO)

from services.api.config import settings
from services.api.routers import (
    activity,
    auth,
    concepts,
    curriculum,
    diagnostics,
    explanations,
    internal,
    languages,
    library,
    progress,
    users,
    webhooks,
)

logger = logging.getLogger("akara.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Plan §3c: verify schema + seed-if-empty before serving traffic.

    The advisory lock makes concurrent api/worker boots safe; the seed only
    does work on a genuinely empty catalog.
    """
    from services.api.boot import run_boot_init

    # Fail fast on EC2 when secrets are missing/weak (no open prod deploys).
    settings.validate_prod()
    await run_boot_init()
    logger.info("boot init complete")
    yield


_is_prod = settings.is_prod
app = FastAPI(
    title="akara-api",
    version="1.0.0",
    lifespan=lifespan,
    # Never expose interactive docs or the OpenAPI schema on a public host.
    # Dev keeps /docs; prod serves API traffic only (nginx proxies /api/*).
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.web_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "same-origin"
    return resp


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": settings.app_name}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(curriculum.router)
app.include_router(library.router)
app.include_router(concepts.router)
app.include_router(explanations.router)
app.include_router(progress.router)
app.include_router(activity.router)
app.include_router(diagnostics.router)
app.include_router(languages.router)
app.include_router(webhooks.router)
app.include_router(internal.router)
