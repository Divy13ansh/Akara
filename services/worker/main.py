"""arq worker (D-15): scoring queue consumer + crash-recovery sweep.

Run: arq services.worker.main.WorkerSettings
(max_jobs=4; scoring happens off the request path — plan §3b)."""

from __future__ import annotations

import asyncio
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "packages"))
sys.path.insert(0, str(ROOT / "services"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env.local")

logger = logging.getLogger("akara-worker")


async def score_session(ctx, session_id: str) -> dict:
    """Score one session: run the LLM scorer, write coverage, apply mastery."""
    from akara_db.base import get_sessionmaker
    from akara_db.models import (
        Concept,
        CoveragePoint,
        Session,
        Transcript,
        TranscriptTurn,
    )
    from sqlalchemy import select

    from packages.akara_common.schemas import TopicData
    from packages.akara_common.schemas import Transcript as TData
    from packages.akara_common.schemas import TranscriptTurn as TTurn

    sessionmaker = get_sessionmaker()
    async with sessionmaker() as db:
        sess = await db.get(Session, session_id)
        if sess is None:
            return {"skipped": "session not found"}
        if sess.scored_at is not None:
            return {"skipped": "already scored"}
        if sess.concept_id is None:
            sess.scored_at = datetime.now(UTC)
            await db.commit()
            return {"skipped": "no concept on session"}

        concept = await db.get(Concept, sess.concept_id)
        transcript_row = (
            await db.execute(select(Transcript).where(Transcript.session_id == session_id))
        ).scalar_one_or_none()

        # Typed (text) sessions keep their answer in explanation_text; voice
        # sessions come from transcript_turns.
        turns_rows = []
        if transcript_row is not None:
            turns_rows = (
                await db.execute(
                    select(TranscriptTurn)
                    .where(TranscriptTurn.transcript_id == transcript_row.id)
                    .order_by(TranscriptTurn.turn_index)
                )
            ).scalars().all()
        turns = [TTurn(role=t.role, text=t.text, ts=t.ts) for t in turns_rows]
        if not turns and sess.explanation_text:
            turns = [TTurn(role="student", text=sess.explanation_text, ts=0.0)]

        topic = TopicData(
            topic_id=concept.id,
            topic=concept.name,
            script=concept.script or "",
            rubric=concept.rubric or "",
            grade=str(concept.class_ or ""),
            subject=concept.subject_id,
            lang=sess.lang or "hi",
            rubric_levels=concept.rubric_levels,
        )
        tdata = TData(
            room_name=session_id,
            topic_id=concept.id,
            student_id=sess.student_id,
            lang=sess.lang or "hi",
            turns=turns,
        )

        # Run the existing scorer chain off the event loop (sync OpenAI SDK).
        def _score():
            try:
                from scorer.llm_scorer import score_transcript_llm

                return score_transcript_llm(tdata, topic)
            except Exception as e:
                logger.warning("LLM scorer failed (%s), heuristic fallback", e)
                from scorer.heuristic import score_transcript

                return score_transcript(tdata, topic, sess.student_id)

        result = await asyncio.to_thread(_score)

        for p in result.points:
            db.add(
                CoveragePoint(
                    session_id=session_id,
                    concept_id=concept.id,
                    student_id=sess.student_id,
                    rubric_point_id=p.id,
                    status=p.status,
                    evidence=p.evidence,
                    scorer_model=result.scorer_model,
                )
            )

        sess.scored_at = datetime.now(UTC)
        await db.commit()

        # Mastery transaction (separate session+transaction inside mastery.py).
        from services.api.mastery import apply_coverage

        async with sessionmaker() as db2:
            await apply_coverage(
                db2,
                student_id=sess.student_id,
                concept_id=concept.id,
                coverage_points=[{"id": p.id, "status": p.status, "evidence": p.evidence} for p in result.points],
                mastery=result.mastery,
                scorer_model=result.scorer_model,
            )

        logger.info(
            "scored session %s: mastery=%.2f model=%s", session_id, result.mastery, result.scorer_model
        )
        return {"mastery": result.mastery, "points": len(result.points)}


async def startup_sweep(ctx) -> None:
    """Boot init (schema check + seed-if-empty), then crash-recovery sweep:
    re-enqueue sessions with a transcript but no scored_at."""
    from services.api.boot import run_boot_init

    await run_boot_init()

    from akara_db.base import get_sessionmaker
    from akara_db.models import Session
    from sqlalchemy import select

    sessionmaker = get_sessionmaker()
    async with sessionmaker() as db:
        rows = (
            await db.execute(
                select(Session.id).where(Session.scored_at.is_(None)).limit(100)
            )
        ).scalars().all()
    for sid in rows:
        await ctx["redis"].enqueue_job("score_session", sid, _job_id=f"score:{sid}")
    if rows:
        logger.info("startup sweep re-enqueued %d unscored sessions", len(rows))


async def quiz_generation_task(ctx, concept_id: str, lang: str) -> dict:
    """On-demand quiz/scene-graph/summary/mentor-prompt generation (D-7).
    One Azure call per (concept, lang), deduped by job id + row state."""
    from services.api.quiz_gen import generate_quiz_content

    status = await generate_quiz_content(concept_id, lang)
    return {"concept_id": concept_id, "lang": lang, "status": status}


class WorkerSettings:
    functions = [score_session, quiz_generation_task]  # noqa: RUF012 — arq reads these as class attrs
    on_startup = startup_sweep
    redis_settings = None  # filled below

    max_jobs = 4
    job_timeout = 300
    max_tries = 3


def _init() -> None:
    from services.api.queue import _redis_settings

    WorkerSettings.redis_settings = _redis_settings()


_init()

if __name__ == "__main__":
    import arq.cli

    arq.cli.cli()
