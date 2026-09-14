"""Progress endpoints (contract §6): summary KPIs + learning map."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from akara_db.models import (
    Chapter,
    Concept,
    DailyActivity,
    Misconception,
    Session,
    Subject,
    UserConceptMastery,
)
from fastapi import APIRouter
from sqlalchemy import func, select

from services.api.deps import CurrentUser, DbSession

router = APIRouter(prefix="/api/progress", tags=["progress"])

TOUCHED = {"mastered", "available", "learning", "needs-revisit"}


@router.get("/summary")
async def summary(user: CurrentUser, session: DbSession):
    counts = (
        await session.execute(
            select(UserConceptMastery.status, func.count(UserConceptMastery.concept_id))
            .where(UserConceptMastery.student_id == user.id)
            .group_by(UserConceptMastery.status)
        )
    ).all()
    by_status = {status: int(n) for status, n in counts}

    # Active days this week (Mon-Sun) from sessions + heartbeats.
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    week_start = datetime(monday.year, monday.month, monday.day, tzinfo=UTC)

    session_days = (
        await session.execute(
            select(func.count(func.distinct(func.date(Session.created_at))))
            .where(Session.student_id == user.id, Session.created_at >= week_start)
        )
    ).scalar() or 0
    activity_days = (
        await session.execute(
            select(func.count(DailyActivity.date)).where(
                DailyActivity.user_id == user.id,
                DailyActivity.date >= monday,
                DailyActivity.minutes > 0,
            )
        )
    ).scalar() or 0

    return {
        "concepts_mastered": by_status.get("mastered", 0),
        "concepts_to_revisit": by_status.get("needs-revisit", 0),
        "active_days_this_week": max(int(session_days), int(activity_days)),
    }


@router.get("/learning-map")
async def learning_map(user: CurrentUser, session: DbSession):
    """Only touched concepts (mastered / available / needs-revisit), grouped by subject."""
    mrows = (
        await session.execute(
            select(UserConceptMastery).where(UserConceptMastery.student_id == user.id)
        )
    ).scalars().all()
    touched = {m.concept_id: m for m in mrows if m.status in TOUCHED}

    needs_review = set(
        (
            await session.execute(
                select(Misconception.concept_id).where(
                    Misconception.student_id == user.id,
                    Misconception.status == "needs_review",
                )
            )
        ).scalars().all()
    )

    concepts = {}
    chapters = {}
    subjects = {}
    if touched:
        concepts = {
            c.id: c
            for c in (
                await session.execute(select(Concept).where(Concept.id.in_(list(touched))))
            ).scalars().all()
        }
        chapter_ids = {c.chapter_id for c in concepts.values()}
        chapters = {
            c.id: c
            for c in (
                await session.execute(select(Chapter).where(Chapter.id.in_(list(chapter_ids) or ["-"])))
            ).scalars().all()
        }
        subject_ids = {c.subject_id for c in chapters.values()}
        subjects = {
            s.id: s
            for s in (
                await session.execute(select(Subject).where(Subject.id.in_(list(subject_ids) or ["-"])))
            ).scalars().all()
        }

    groups: dict[str, dict] = {}
    for concept_id, m in touched.items():
        concept = concepts.get(concept_id)
        if concept is None:
            continue
        chapter = chapters.get(concept.chapter_id)
        subject = subjects.get(concept.subject_id) if chapter else None
        status = m.status
        if concept_id in needs_review:
            status = "needs-revisit"
        g = groups.setdefault(
            concept.subject_id,
            {
                "subject_id": concept.subject_id,
                "subject_name": subject.name if subject else concept.subject_id,
                "mastered_count": 0,
                "revisit_count": 0,
                "available_count": 0,
                "concepts": [],
            },
        )
        g["concepts"].append(
            {
                "id": concept.id,
                "name": concept.name,
                "short_description": concept.short_description or "",
                "status": status,
                "chapter_id": concept.chapter_id,
                "chapter_name": chapter.name if chapter else "",
                "topic_name": concept.topic_name or "",
                "last_session_at": m.last_session_at.isoformat() if m.last_session_at else None,
            }
        )
        if status == "mastered":
            g["mastered_count"] += 1
        elif status == "needs-revisit":
            g["revisit_count"] += 1
        else:
            g["available_count"] += 1

    # Sort concept lists by subject then order for stable UI.
    out = []
    for g in groups.values():
        g["concepts"].sort(key=lambda c: c["id"])
        out.append(g)
    out.sort(key=lambda g: g["subject_id"])
    return {"subjects": out}
