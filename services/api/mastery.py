"""Mastery transaction — the single source of truth for progress updates.

Applies a CoverageResult to user_concept_mastery + misconceptions:
- SELECT ... FOR UPDATE + atomic GREATEST() so parallel scorers never lose a
  bump (plan §3b race #2)
- status transitions + prereq unlocking (locked → available)
- misconception upsert / auto-resolve lifecycle (docs/architecture/database.md §6)
- invalidates the per-user mastery cache

Callers run this INSIDE an open AsyncSession transaction after inserting
coverage_points."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from akara_db.enums import MasteryStatus
from akara_db.models import (
    Concept,
    Misconception,
    RubricPoint,
    UserConceptMastery,
)
from sqlalchemy import select, update

from services.api.config import settings
from services.api.redis_client import cache_invalidate

logger = logging.getLogger("akara-mastery")

WEIGHTS = {"covered": 1.0, "missed": 0.0, "misconceived": 0.0, "bonus": 0.5}


async def apply_coverage(
    session,
    *,
    student_id: str,
    concept_id: str,
    coverage_points: list[dict],
    mastery: float,
    scorer_model: str,
) -> UserConceptMastery:
    """Apply scoring results to mastery + misconceptions. Commits."""
    now = datetime.now(UTC)

    # 1. Row-locked mastery upsert.
    row = (
        await session.execute(
            select(UserConceptMastery)
            .where(
                UserConceptMastery.student_id == student_id,
                UserConceptMastery.concept_id == concept_id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()

    if row is None:
        row = UserConceptMastery(
            student_id=student_id,
            concept_id=concept_id,
            status=MasteryStatus.LEARNING,
            best_mastery=0.0,
            attempts=0,
        )
        session.add(row)
        await session.flush()

    prev_best = row.best_mastery
    # Atomic max — belt and braces on top of FOR UPDATE.
    await session.execute(
        update(UserConceptMastery)
        .where(
            UserConceptMastery.student_id == student_id,
            UserConceptMastery.concept_id == concept_id,
        )
        .values(
            best_mastery=func_greatest(mastery, UserConceptMastery.best_mastery),
            attempts=UserConceptMastery.attempts + 1,
            last_session_at=now,
        )
    )
    await session.refresh(row)

    newly_mastered = (
        prev_best < settings.mastery_threshold
        and max(prev_best, mastery) >= settings.mastery_threshold
    )
    if newly_mastered:
        row.mastered_at = now
        row.status = MasteryStatus.MASTERED
    elif row.status not in (MasteryStatus.MASTERED, MasteryStatus.AVAILABLE):
        row.status = (
            MasteryStatus.NEEDS_REVISIT if mastery < settings.mastery_threshold and prev_best >= settings.mastery_threshold
            else MasteryStatus.LEARNING
        )
    row.updated_at = now

    # 2. Misconception lifecycle.
    rubric_rows = (
        await session.execute(
            select(RubricPoint).where(RubricPoint.concept_id == concept_id)
        )
    ).scalars().all()
    rubric = {p.id: p for p in rubric_rows}

    for cp in coverage_points:
        pid = int(cp.get("id", 0))
        status = cp.get("status", "missed")
        rp = rubric.get(pid)

        if status == "misconceived":
            await _upsert_misconception(
                session, student_id=student_id, concept_id=concept_id,
                rubric_point=rp, session_id=None, now=now,
            )
        elif status == "covered":
            # Covering a previously-misconceived point auto-resolves it.
            await session.execute(
                update(Misconception)
                .where(
                    Misconception.student_id == student_id,
                    Misconception.concept_id == concept_id,
                    Misconception.rubric_point_id == pid,
                    Misconception.status == "needs_review",
                )
                .values(status="resolved", resolved_at=now)
            )

    # 3. Prereq unlocking: mastered concept releases its dependents.
    if newly_mastered or row.status == MasteryStatus.MASTERED:
        await _unlock_dependents(session, concept_id, student_id)

    await session.commit()
    await cache_invalidate(f"cache:mastery:{student_id}")
    return row


async def _upsert_misconception(session, *, student_id, concept_id, rubric_point, session_id, now):
    existing = (
        await session.execute(
            select(Misconception).where(
                Misconception.student_id == student_id,
                Misconception.concept_id == concept_id,
                Misconception.rubric_point_id == rubric_point.id if rubric_point else False,
                Misconception.status == "needs_review",
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.detected_at = now  # still unresolved — bump recency
        return

    severity = "high" if rubric_point is not None else "medium"
    insight = (
        rubric_point.misconception
        if rubric_point and rubric_point.misconception
        else (rubric_point.text if rubric_point else "Misconception detected during explanation.")
    )
    session.add(
        Misconception(
            id=f"diag-{uuid.uuid4().hex[:8]}",
            student_id=student_id,
            concept_id=concept_id,
            session_id=session_id,
            rubric_point_id=rubric_point.id if rubric_point else None,
            severity=severity,
            diagnostic_insight=insight,
            actionable_hint=None,
            status="needs_review",
            detected_at=now,
        )
    )


async def _unlock_dependents(session, concept_id: str, student_id: str) -> None:
    children = (
        await session.execute(
            select(Concept.id).where(Concept.prerequisite_id == concept_id)
        )
    ).scalars().all()
    for child in children:
        m = await session.get(UserConceptMastery, (student_id, child))
        if m is None:
            session.add(
                UserConceptMastery(
                    student_id=student_id,
                    concept_id=child,
                    status=MasteryStatus.AVAILABLE,
                )
            )
        elif m.status == MasteryStatus.LOCKED:
            m.status = MasteryStatus.AVAILABLE


def func_greatest(a, b):
    from sqlalchemy import func

    return func.greatest(a, b)
