"""Concept media endpoints (contract §9): generation-status (with the D-6/D-16
gate + render trigger) and the unified media bundle."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from akara_db.enums import MasteryStatus, MediaStatus
from akara_db.models import (
    Chapter,
    Concept,
    ConceptMedia,
    ConceptQuiz,
    Subject,
    UserConceptMastery,
    VideoRenderJob,
)
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from services.api.config import settings
from services.api.deps import CurrentUser, DbSession
from services.api.r2 import public_url, video_key
from services.api.redis_client import (
    cache_get_json,
    cache_set_json,
    distributed_lock,
)
from services.api.video_client import trigger_render

router = APIRouter(prefix="/api/concepts", tags=["concepts"])

# Stage weights for progress estimation (sums to 100).
STAGE_WEIGHTS = {
    "scene_planning": (0, 10),
    "manim_rendering": (10, 65),
    "script_generation": (65, 75),
    "tts_generation": (75, 90),
    "stitch_and_mux": (90, 99),
    "sadtalker": (99, 100),
}
# Typical total render minutes — used only for the ETA shown to students.
EST_TOTAL_SECONDS = 900


async def _concept_or_404(session, concept_id: str) -> Concept:
    concept = await session.get(Concept, concept_id)
    if concept is None:
        raise HTTPException(404, "Unknown concept")
    return concept


async def _prereq_unlocked(session, user_id: str, concept: Concept) -> bool:
    if not concept.prerequisite_id:
        return True
    # A concept the student already progressed past stays accessible (mastered,
    # needs-revisit) even if its own prereq chain was satisfied long ago.
    own = await session.get(UserConceptMastery, (user_id, concept.id))
    if own is not None and own.status != MasteryStatus.LOCKED:
        return True
    m = await session.get(UserConceptMastery, (user_id, concept.prerequisite_id))
    return m is not None and m.status == MasteryStatus.MASTERED


async def _available_languages(session, concept_id: str) -> list[str]:
    cached = await cache_get_json(f"cache:media:{concept_id}:langs")
    if cached is not None:
        return cached
    rows = (
        await session.execute(
            select(ConceptMedia.lang).where(
                ConceptMedia.concept_id == concept_id,
                ConceptMedia.status == MediaStatus.COMPLETE,
            )
        )
    ).scalars().all()
    langs = sorted(set(rows))
    await cache_set_json(f"cache:media:{concept_id}:langs", langs, settings.cache_ttl_global)
    return langs


def _status_payload(status: str, concept_id: str, lang: str, langs: list[str],
                    progress: int = 0, stage: str | None = None,
                    eta: int = 0, queue_position: int = 0) -> dict:
    out = {
        "status": status,
        "progress_percent": progress,
        "available_languages": langs,
        "concept_id": concept_id,
        "language": lang,
    }
    if stage:
        out["current_stage"] = stage
    if eta:
        out["estimated_seconds_remaining"] = eta
    if queue_position:
        out["queue_position"] = queue_position
    return out


@router.get("/{concept_id}/generation-status")
async def generation_status(concept_id: str, lang: str = "hi", user: CurrentUser = None, session: DbSession = None):
    concept = await _concept_or_404(session, concept_id)
    langs = await _available_languages(session, concept_id)

    # 1. Prerequisite gate (D-6): locked students get a locked response.
    if not await _prereq_unlocked(session, user.id, concept):
        return _status_payload("locked", concept_id, lang, langs)

    # 2. Complete → instant (cached briefly; polls are hot in a classroom).
    cache_key = f"cache:genstatus:{concept_id}:{lang}"
    cached = await cache_get_json(cache_key)
    if cached is not None:
        cached["available_languages"] = langs
        return cached

    media = (
        await session.execute(
            select(ConceptMedia).where(
                ConceptMedia.concept_id == concept_id, ConceptMedia.lang == lang
            )
        )
    ).scalar_one_or_none()

    if media is not None and media.status == MediaStatus.COMPLETE:
        payload = _status_payload("instant", concept_id, lang, langs, progress=100)
        await cache_set_json(cache_key, payload, settings.cache_ttl_genstatus)
        return payload

    # 3. Running/pending job → processing shape. A pending job that has shown
    # no progress for render_stale_minutes is dead (the video container restarted
    # or crashed before the callback) — sweep it and fall through to re-trigger.
    if media is not None and media.status in (MediaStatus.PROCESSING, MediaStatus.PENDING):
        job = (
            await session.execute(
                select(VideoRenderJob)
                .where(
                    VideoRenderJob.concept_id == concept_id,
                    VideoRenderJob.lang == lang,
                    VideoRenderJob.status.in_(["pending", "processing"]),
                )
                .order_by(VideoRenderJob.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        stale_cutoff = datetime.now(UTC) - timedelta(minutes=settings.render_stale_minutes)
        if (
            job is not None
            and job.status == "pending"
            and job.created_at is not None
            and job.created_at < stale_cutoff
        ):
            job.status = "failed"
            job.error = "stale: no progress from video service"
            media.status = MediaStatus.FAILED
            await session.commit()
        elif job is not None:
            stage = job.current_stage or media.current_stage or "queued"
            lo, hi = STAGE_WEIGHTS.get(stage, (0, 5))
            progress = max(media.progress_percent, min(hi, lo + 5))
            eta = max(0, EST_TOTAL_SECONDS - int((progress / 100) * EST_TOTAL_SECONDS))
            payload = _status_payload(
                "generating_first_time" if media.status == MediaStatus.PENDING else "finishing_dub",
                concept_id, lang, langs, progress=progress, stage=stage, eta=eta,
            )
            await cache_set_json(cache_key, payload, settings.cache_ttl_genstatus)
            return payload

    # 4. Nothing usable (missing or failed) → auto-trigger under the dedup lock.
    async with distributed_lock(f"render:{concept_id}:{lang}", ttl_seconds=600) as mine:
        if not mine:
            # Someone else is creating the job right now — report as generating.
            return _status_payload("generating_first_time", concept_id, lang, langs,
                                   progress=1, stage="queued", eta=EST_TOTAL_SECONDS)

        # Re-check inside the lock (double-create guard across workers).
        media = (
            await session.execute(
                select(ConceptMedia).where(
                    ConceptMedia.concept_id == concept_id, ConceptMedia.lang == lang
                )
            )
        ).scalar_one_or_none()
        if media is not None and media.status in (MediaStatus.COMPLETE, MediaStatus.PROCESSING):
            payload = _status_payload(
                "instant" if media.status == MediaStatus.COMPLETE else "finishing_dub",
                concept_id, lang, langs, progress=100 if media.status == MediaStatus.COMPLETE else 5,
            )
            return payload

        failed_before = 0
        if media is not None:
            failed_before = getattr(media, "retry_count", 0)
            if failed_before >= settings.render_max_auto_retries:
                return _status_payload("failed", concept_id, lang, langs,
                                       stage=media.current_stage)

        # D-16 global render cap: when all render slots are busy, report a
        # queue position instead of piling more Manim jobs onto the machine.
        from services.api.redis_client import acquire_render_slot, release_render_slot

        if not await acquire_render_slot():
            # All render slots busy — everyone attaches to the queue instead.
            payload = _status_payload(
                "generating_first_time", concept_id, lang, langs,
                progress=1, stage="queued", eta=EST_TOTAL_SECONDS, queue_position=2,
            )
            return payload

        video_id = f"vid-{uuid.uuid4().hex[:12]}"
        if media is None:
            media = ConceptMedia(
                concept_id=concept_id, lang=lang,
                status=MediaStatus.PENDING, current_stage="queued",
                progress_percent=0,
            )
            session.add(media)
            await session.flush()
        else:
            media.status = MediaStatus.PENDING
            media.current_stage = "queued"
            media.error = None

        job = VideoRenderJob(
            id=video_id, concept_id=concept_id, lang=lang, media_id=media.id,
            status="pending", current_stage="queued",
        )
        session.add(job)
        await session.commit()

        ok = await trigger_render(concept_id, concept.name, lang, video_id)
        if not ok:
            await release_render_slot()
            job.status = "failed"
            job.error = "video service unreachable"
            media.status = "failed"
            media.error = "video service unreachable"
            await session.commit()
            raise HTTPException(502, "Video service unreachable; try again later")

        payload = _status_payload("generating_first_time", concept_id, lang, langs,
                                  progress=1, stage="queued", eta=EST_TOTAL_SECONDS)
        await cache_set_json(cache_key, payload, settings.cache_ttl_genstatus)
        return payload


@router.get("/{concept_id}/media")
async def get_media(concept_id: str, lang: str | None = None, user: CurrentUser = None, session: DbSession = None):
    """Unified bundle: video URL + script + quiz + scene graph + mentor prompt."""
    concept = await _concept_or_404(session, concept_id)
    language = lang or user.default_language or "hi"

    media = (
        await session.execute(
            select(ConceptMedia).where(
                ConceptMedia.concept_id == concept_id, ConceptMedia.lang == language
            )
        )
    ).scalar_one_or_none()
    if media is None or media.status != MediaStatus.COMPLETE:
        raise HTTPException(404, "Media not ready for this concept/language")

    quiz_row = (
        await session.execute(
            select(ConceptQuiz).where(
                ConceptQuiz.concept_id == concept_id, ConceptQuiz.lang == language
            )
        )
    ).scalar_one_or_none()

    chapter = await session.get(Chapter, concept.chapter_id)
    subject = await session.get(Subject, concept.subject_id)
    langs = await _available_languages(session, concept_id)

    duration = media.duration_seconds or 0
    video_url = public_url(video_key(concept_id, language, media.source_video_id or "current", "final.mp4")) \
        if False else public_url(media.video_r2_key) if media.video_r2_key else None

    return {
        "concept_id": concept_id,
        "concept_name": concept.name,
        "ncert_citation": concept.ncert_citation or f"NCERT — Class {concept.class_} {subject.name if subject else ''} · Chapter {chapter.name if chapter else ''}",
        "language": language,
        "available_languages": langs,
        "video": {
            "title": f"{concept.name} — Full Explainer",
            "url": video_url,
            "duration_seconds": duration,
            "duration_formatted": f"{duration // 60}:{duration % 60:02d}",
            "size_bytes": media.size_bytes,
        },
        "script": {
            "full_transcript": concept.script or "",
            **(quiz_row.summary if quiz_row and quiz_row.summary else {}),
        },
        "scene_graph": quiz_row.scene_graph if quiz_row else None,
        "quiz": quiz_row.quiz if quiz_row else [],
        "mentor_prompt": quiz_row.mentor_prompt if quiz_row else None,
    }
