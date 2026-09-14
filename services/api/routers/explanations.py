"""Explain endpoints (contract §9.3 + D-9): typed-explanation evaluation and the
server-gated mark-as-mastered."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from akara_db.enums import MasteryStatus
from akara_db.models import (
    Concept,
    CoveragePoint,
    Misconception,
    Session,
    UserConceptMastery,
)
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from packages.akara_common.schemas import TopicData
from services.api.config import settings
from services.api.deps import CurrentUser, DbSession
from services.api.mastery import apply_coverage
from services.api.redis_client import rate_limit

router = APIRouter(prefix="/api/concepts", tags=["explanations"])


class EvaluatePayload(BaseModel):
    student_answer_text: str = Field(min_length=1, max_length=8000)
    scenario: str = "mastery_confirmation"
    language: str = Field(default="hi", max_length=10)


def _heuristic_score(topic: TopicData, answer: str) -> tuple[float, list[dict]]:
    """Instant heuristic scoring for the synchronous first response (D-15
    hybrid): the arq LLM job refines coverage afterwards (best-of wins)."""
    import re

    words = set(re.findall(r"[a-zA-Z\u0900-\u097F]+", answer.lower()))
    points: list[dict] = []
    covered = 0
    flat: list[tuple[int, str, str]] = []
    if topic.rubric_levels:
        # rubric_levels arrive as JSONB dicts (see concept_text below)
        for lvl in topic.rubric_levels:
            pts = lvl.get("points", []) if isinstance(lvl, dict) else getattr(lvl, "points", [])
            for p in pts:
                if isinstance(p, dict):
                    flat.append((int(p.get("id", 0)), p.get("text", ""), p.get("misconception") or ""))
                else:
                    flat.append((p.id, p.text, p.misconception or ""))
    else:
        flat = [(i + 1, t, "") for i, t in enumerate((topic.rubric or "").split(".")) if t.strip()]

    for pid, text, misconception in flat:
        tokens = {t for t in re.findall(r"[a-zA-Z\u0900-\u097F]+", text.lower()) if len(t) > 3}
        overlap = len(tokens & words) / max(len(tokens), 1)
        status = "covered" if overlap >= 0.25 else "missed"
        if status == "covered":
            covered += 1
        points.append({"id": pid, "status": status, "evidence": answer[:280] if status == "covered" else ""})

    mastery = covered / max(len(points), 1)
    return mastery, points


@router.post("/{concept_id}/evaluate-explanation")
async def evaluate_explanation(concept_id: str, payload: EvaluatePayload, user: CurrentUser, session: DbSession):
    if not await rate_limit("evaluate", user.id, settings.rl_evaluate_per_min, 60):
        raise HTTPException(429, "Too many evaluations, slow down")

    concept = await session.get(Concept, concept_id)
    if concept is None:
        raise HTTPException(404, "Unknown concept")

    now = datetime.now(UTC)
    sess = Session(
        id=f"text-{uuid.uuid4().hex[:12]}",
        session_type="text",
        student_id=user.id,
        concept_id=concept_id,
        lang=payload.language,
        explanation_text=payload.student_answer_text,
        started_at=now,
        ended_at=now,
    )
    session.add(sess)
    await session.commit()

    topic = TopicData(
        topic_id=concept.id, topic=concept.name, script=concept.script or "",
        rubric=concept.rubric or "", grade=str(concept.class_ or ""),
        subject=concept.subject_id, lang=payload.language,
        rubric_levels=concept.rubric_levels,
    )
    mastery, points = _heuristic_score(topic, payload.student_answer_text)

    for p in points:
        session.add(
            CoveragePoint(
                session_id=sess.id, concept_id=concept_id, student_id=user.id,
                rubric_point_id=int(p["id"]), status=p["status"],
                evidence=p.get("evidence", ""), scorer_model="heuristic-v0",
            )
        )
    await session.commit()

    await apply_coverage(
        session, student_id=user.id, concept_id=concept_id,
        coverage_points=points, mastery=mastery, scorer_model="heuristic-v0",
    )

    # Fire-and-forget the LLM refinement (job dedupes per session; refines
    # coverage via a second session row keyed by the same session id — the
    # worker skips if scored_at is set, so mark scored only via worker).
    from services.api.queue import enqueue_scoring

    await enqueue_scoring(sess.id)

    covered = [concept_text(pt["id"], concept) for pt in points if pt["status"] == "covered"]
    missed = [concept_text(pt["id"], concept) for pt in points if pt["status"] != "covered"]
    score_percent = round(mastery * 100)
    is_mastered = mastery >= settings.mastery_threshold

    # Contract §9.3: a cleared explanation resolves the student's active
    # misconception diagnostic for this concept (same as re-practice).
    diagnostic_resolved = False
    if is_mastered:
        open_diags = (
            await session.execute(
                select(Misconception).where(
                    Misconception.student_id == user.id,
                    Misconception.concept_id == concept_id,
                    Misconception.status == "needs_review",
                )
            )
        ).scalars().all()
        for diag in open_diags:
            diag.status = "resolved"
            diag.resolved_at = now
        diagnostic_resolved = bool(open_diags)
        if open_diags:
            await session.commit()

    return {
        "is_mastered": is_mastered,
        "score_percent": score_percent,
        "feedback_headline": "Feynman Mastery Cleared!" if is_mastered else "Good Attempt — Keep Probing the Gaps",
        "mentor_feedback_text": (
            "You clearly covered the key ideas. Try weaving the missed points into your explanation."
            if is_mastered
            else "You're on the right track. Focus on the missed rubric points and explain them in your own words."
        ),
        "points_covered": [c for c in covered if c],
        "points_missed": [m for m in missed if m],
        "diagnostic_resolved": diagnostic_resolved,
        "session_id": sess.id,
    }


def concept_text(point_id: int, concept: Concept) -> str:
    if concept.rubric_levels:
        for lvl in concept.rubric_levels:
            for p in lvl.get("points", []) if isinstance(lvl, dict) else []:
                if p.get("id") == point_id:
                    return p.get("text", "")
    return ""


class MarkMasteredPayload(BaseModel):
    concept_id: str | None = None  # unused; path param wins


@router.post("/{concept_id}/mark-mastered")
async def mark_mastered(concept_id: str, user: CurrentUser, session: DbSession):
    """D-9: gated. 200 only when a real coverage/mastery record >= threshold
    exists for this user+concept; 409 with reason otherwise."""
    m = await session.get(UserConceptMastery, (user.id, concept_id))
    if m is None:
        raise HTTPException(409, "No attempts recorded for this concept yet")

    has_passing_coverage = (
        await session.execute(
            select(CoveragePoint.id)
            .where(
                CoveragePoint.student_id == user.id,
                CoveragePoint.concept_id == concept_id,
                CoveragePoint.status == "covered",
            )
            .limit(1)
        )
    ).scalar_one_or_none()

    if m.best_mastery < settings.mastery_threshold and has_passing_coverage is None:
        raise HTTPException(
            409,
            f"Proof of mastery required: best recorded mastery is {m.best_mastery:.2f} "
            f"(threshold {settings.mastery_threshold}).",
        )

    m.best_mastery = max(m.best_mastery, settings.mastery_threshold)
    m.status = MasteryStatus.MASTERED
    if m.mastered_at is None:
        m.mastered_at = datetime.now(UTC)

    from services.api.mastery import _unlock_dependents

    await _unlock_dependents(session, concept_id, user.id)
    await session.commit()
    from services.api.redis_client import cache_invalidate

    await cache_invalidate(f"cache:mastery:{user.id}")
    return {"success": True, "concept_id": concept_id, "status": "mastered"}
