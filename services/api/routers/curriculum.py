"""Curriculum endpoints (contract §3): subjects for a class, chapter lists,
chapter detail with the nested topic-group shape the constellation needs.

Mastery overlays are per-user; global content payloads are cached (plan §3b)."""

from __future__ import annotations

from akara_db.models import (
    Chapter,
    Concept,
    Misconception,
    Subject,
    UserConceptMastery,
)
from fastapi import APIRouter, Query
from sqlalchemy import func, select

from services.api.config import settings
from services.api.deps import CurrentUser, DbSession
from services.api.redis_client import cache_get_json, cache_set_json

router = APIRouter(prefix="/api/curriculum", tags=["curriculum"])

MASTERED = "mastered"


async def _mastery_map(session, student_id: str) -> dict[str, dict]:
    rows = (
        await session.execute(
            select(UserConceptMastery).where(UserConceptMastery.student_id == student_id)
        )
    ).scalars().all()
    return {r.concept_id: r for r in rows}


def _status_of(m: UserConceptMastery | None) -> str:
    return m.status if m else "locked"


@router.get("/subjects")
async def get_subjects(
    class_param: int | None = Query(None, alias="class"),
    user: CurrentUser = None,
    session: DbSession = None,
):
    """Subjects for the user's class (or ?class= override). Global payload cached."""
    cls = class_param or user.class_
    if cls is None:
        from fastapi import HTTPException

        raise HTTPException(400, "No class set on profile and no ?class= param")

    cache_key = f"cache:curriculum:subjects:{cls}"
    cached = await cache_get_json(cache_key)
    if cached is not None:
        # Re-attach per-user mastery counts (cheap; global part was cached).
        mastery = await _mastery_map(session, user.id)
        mastered_ids = {cid for cid, m in mastery.items() if m.status == MASTERED}
        for s in cached["subjects"]:
            s["mastered_concepts"] = len(mastered_ids & set(s["_concept_ids"]))
            s.pop("_concept_ids", None)
        return {"class": cls, "subjects": cached["subjects"]}

    subjects = (
        await session.execute(
            select(Subject)
            .where(Subject.class_min <= cls, Subject.class_max >= cls)
            .order_by(Subject.id)
        )
    ).scalars().all()

    # Concept ids per subject (one query, grouped in python)
    rows = (
        await session.execute(
            select(Concept.subject_id, Concept.id)
            .join(Chapter, Chapter.id == Concept.chapter_id)
            .where(Chapter.class_ == cls)
        )
    ).all()
    concept_ids_by_subject: dict[str, list[str]] = {}
    for subject_id, concept_id in rows:
        concept_ids_by_subject.setdefault(subject_id, []).append(concept_id)

    out = []
    for s in subjects:
        ids = concept_ids_by_subject.get(s.id, [])
        out.append(
            {
                "id": s.id,
                "name": s.name,
                "code": s.code,
                "description": s.description or "",
                "total_chapters": 0,  # filled below
                "total_concepts": len(ids),
                "_concept_ids": ids,
            }
        )

    chapter_counts = (
        await session.execute(
            select(Chapter.subject_id, func.count(Chapter.id))
            .where(Chapter.class_ == cls)
            .group_by(Chapter.subject_id)
        )
    ).all()
    ch_map = {sid: int(n) for sid, n in chapter_counts}
    for s in out:
        s["total_chapters"] = ch_map.get(s["id"], 0)

    await cache_set_json(cache_key, {"subjects": out}, settings.cache_ttl_global)

    mastery = await _mastery_map(session, user.id)
    mastered_ids = {cid for cid, m in mastery.items() if m.status == MASTERED}
    for s in out:
        s["mastered_concepts"] = len(mastered_ids & set(s["_concept_ids"]))
        s.pop("_concept_ids", None)
    return {"class": cls, "subjects": out}


@router.get("/subjects/{subject_id}/chapters")
async def get_chapters(
    subject_id: str,
    class_param: int | None = Query(None, alias="class"),
    user: CurrentUser = None,
    session: DbSession = None,
):
    """Chapters of one subject for a class. The catalog now spans classes 6-12
    per subject, so a class filter is mandatory: ?class= wins, else the user's
    profile class, else 400."""
    cls = class_param or user.class_
    if cls is None:
        from fastapi import HTTPException

        raise HTTPException(400, "No class set on profile and no ?class= param")

    cache_key = f"cache:curriculum:chapters:{subject_id}:{cls}"
    cached = await cache_get_json(cache_key)
    if cached is not None:
        mastery = await _mastery_map(session, user.id)
        mastered_ids = {cid for cid, m in mastery.items() if m.status == MASTERED}
        for ch in cached["chapters"]:
            ch["mastered_concepts"] = len(mastered_ids & set(ch["_concept_ids"]))
            ch.pop("_concept_ids", None)
        return {**cached, "chapters": cached["chapters"]}

    subject = await session.get(Subject, subject_id)
    if subject is None:
        from fastapi import HTTPException

        raise HTTPException(404, "Unknown subject")

    chapters = (
        await session.execute(
            select(Chapter)
            .where(Chapter.subject_id == subject_id, Chapter.class_ == cls)
            .order_by(Chapter.chapter_number)
        )
    ).scalars().all()

    rows = (
        await session.execute(select(Concept.chapter_id, Concept.id).where(Concept.subject_id == subject_id))
    ).all()
    concepts_by_chapter: dict[str, list[str]] = {}
    for chapter_id, concept_id in rows:
        concepts_by_chapter.setdefault(chapter_id, []).append(concept_id)

    ch_out = []
    for c in chapters:
        ids = concepts_by_chapter.get(c.id, [])
        ch_out.append(
            {
                "id": c.id,
                "subject_id": c.subject_id,
                "chapter_number": c.chapter_number,
                "name": c.name,
                "class": c.class_,
                "total_concepts": len(ids),
                "mastered_concepts": 0,
                "_concept_ids": ids,
            }
        )

    payload = {
        "subject_id": subject_id,
        "subject_name": subject.name,
        "class": cls,
    }
    await cache_set_json(cache_key, {**payload, "chapters": ch_out}, settings.cache_ttl_global)

    mastery = await _mastery_map(session, user.id)
    mastered_ids = {cid for cid, m in mastery.items() if m.status == MASTERED}
    for ch in ch_out:
        ch["mastered_concepts"] = len(mastered_ids & set(ch["_concept_ids"]))
        ch.pop("_concept_ids", None)
    return {**payload, "chapters": ch_out}


@router.get("/subjects/{subject_id}/chapters/{chapter_id}")
async def get_chapter_detail(subject_id: str, chapter_id: str, user: CurrentUser, session: DbSession):
    """Chapter detail for the constellation: concepts grouped into topic groups
    (concepts.topic_name) with statuses from user_concept_mastery."""
    chapter = await session.get(Chapter, chapter_id)
    if chapter is None or chapter.subject_id != subject_id:
        from fastapi import HTTPException

        raise HTTPException(404, "Unknown chapter")

    concepts = (
        await session.execute(
            select(Concept)
            .where(Concept.chapter_id == chapter_id)
            .order_by(Concept.topic_name.nulls_first(), Concept.order_index)
        )
    ).scalars().all()

    mastery = await _mastery_map(session, user.id)

    # Needs-revisit override: unresolved misconceptions flip the status.
    misconception_concepts = set(
        (
            await session.execute(
                select(Misconception.concept_id).where(
                    Misconception.student_id == user.id,
                    Misconception.status == "needs_review",
                    Misconception.concept_id.in_([c.id for c in concepts] or ["-"]),
                )
            )
        ).scalars().all()
    )

    topic_groups: dict[str, list[dict]] = {}
    total = mastered = 0
    for c in concepts:
        m = mastery.get(c.id)
        status = _status_of(m)
        if m is None and not c.prerequisite_id:
            # Chain entry points are open by design: no bootstrap mastery rows
            # are created at signup, so a missing row on a prerequisite-free
            # concept means "available", not "locked".
            status = "available"
        if c.id in misconception_concepts:
            status = "needs-revisit"
        total += 1
        if status == MASTERED:
            mastered += 1
        key = c.topic_name or "Concepts"
        topic_groups.setdefault(key, []).append(
            {
                "id": c.id,
                "order": c.order_index,
                "name": c.name,
                "short_description": c.short_description or "",
                "status": status,
                "topic_id": key,
                "topic_number": 0,  # set after grouping below
                "topic_name": key,
                "prerequisite_id": c.prerequisite_id,
                "available_languages": [],  # filled by /media & generation-status
            }
        )

    topics = []
    for idx, (tname, clist) in enumerate(topic_groups.items(), start=1):
        for node in clist:
            node["topic_number"] = idx
        topics.append(
            {
                "id": f"topic-{idx}",
                "topic_number": idx,
                "name": tname,
                "description": "",
                "concepts": clist,
            }
        )

    return {
        "id": chapter.id,
        "subject_id": chapter.subject_id,
        "chapter_number": chapter.chapter_number,
        "name": chapter.name,
        "class": chapter.class_,
        "total_concepts": total,
        "mastered_concepts": mastered,
        "topics": topics,
    }
