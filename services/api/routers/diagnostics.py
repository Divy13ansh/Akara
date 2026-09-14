"""Diagnostics endpoints (contract §6.3/6.4): misconceptions + resolve."""

from __future__ import annotations

from datetime import UTC, datetime

from akara_db.models import Chapter, Concept, Misconception, Subject
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from services.api.deps import CurrentUser, DbSession

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])


@router.get("/misconceptions")
async def list_misconceptions(user: CurrentUser, session: DbSession):
    rows = (
        await session.execute(
            select(Misconception)
            .where(Misconception.student_id == user.id, Misconception.status == "needs_review")
            .order_by(Misconception.detected_at.desc())
        )
    ).scalars().all()

    concepts = {
        c.id: c
        for c in (
            await session.execute(select(Concept).where(Concept.id.in_([r.concept_id for r in rows] or ["-"])))
        ).scalars().all()
    }
    chapters = {
        c.id: c
        for c in (
            await session.execute(
                select(Chapter).where(Chapter.id.in_([c.chapter_id for c in concepts.values()] or ["-"]))
            )
        ).scalars().all()
    }
    subjects = {
        s.id: s
        for s in (
            await session.execute(
                select(Subject).where(Subject.id.in_([c.subject_id for c in chapters.values()] or ["-"]))
            )
        ).scalars().all()
    }

    out = []
    for r in rows:
        concept = concepts.get(r.concept_id)
        chapter = chapters.get(concept.chapter_id) if concept else None
        subject = subjects.get(chapter.subject_id) if chapter else None
        out.append(
            {
                "id": r.id,
                "concept_id": r.concept_id,
                "concept_name": concept.name if concept else r.concept_id,
                "subject_id": chapter.subject_id if chapter else None,
                "subject_name": subject.name if subject else None,
                "chapter_id": chapter.id if chapter else None,
                "chapter_name": chapter.name if chapter else None,
                "topic_name": concept.topic_name if concept else None,
                "detected_at": r.detected_at.isoformat(),
                "severity": r.severity,
                "diagnostic_insight": r.diagnostic_insight,
                "actionable_hint": r.actionable_hint or "",
                "status": r.status,
            }
        )
    return {"diagnostics": out}


@router.post("/{diagnostic_id}/resolve")
async def resolve(diagnostic_id: str, user: CurrentUser, session: DbSession):
    row = await session.get(Misconception, diagnostic_id)
    if row is None or row.student_id != user.id:
        raise HTTPException(404, "Diagnostic not found")
    row.status = "resolved"
    row.resolved_at = datetime.now(UTC)
    await session.commit()
    return {"success": True, "diagnostic_id": row.id, "status": "resolved"}
