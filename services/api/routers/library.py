"""Library endpoints (contract §8): summary counters, concept search, hierarchy.

available_languages = languages with status='complete' in concept_media."""

from __future__ import annotations

from akara_db.models import (
    Chapter,
    Concept,
    ConceptMedia,
    Misconception,
    Subject,
    UserConceptMastery,
)
from fastapi import APIRouter
from sqlalchemy import select

from services.api.config import settings
from services.api.deps import CurrentUser, DbSession
from services.api.redis_client import cache_get_json, cache_set_json

router = APIRouter(prefix="/api/library", tags=["library"])


async def _lang_map(session) -> dict[str, list[str]]:
    """concept_id -> sorted list of complete languages. Global; cached."""
    cached = await cache_get_json("cache:library:langs")
    if cached is not None:
        return cached
    rows = (
        await session.execute(
            select(ConceptMedia.concept_id, ConceptMedia.lang).where(
                ConceptMedia.status == "complete"
            )
        )
    ).all()
    out: dict[str, list[str]] = {}
    for concept_id, lang in rows:
        out.setdefault(concept_id, []).append(lang)
    out = {k: sorted(v) for k, v in out.items()}
    await cache_set_json("cache:library:langs", out, settings.cache_ttl_global)
    return out


async def _concept_rows(session) -> list[dict]:
    """Global concept catalog rows (cached, no per-user data)."""
    cached = await cache_get_json("cache:library:concepts")
    if cached is not None:
        return cached

    rows = (
        await session.execute(
            select(Concept, Chapter, Subject)
            .join(Chapter, Chapter.id == Concept.chapter_id)
            .join(Subject, Subject.id == Concept.subject_id)
            .order_by(Concept.subject_id, Concept.chapter_id, Concept.order_index)
        )
    ).all()
    langs = await _lang_map(session)

    out = []
    for concept, chapter, subject in rows:
        cl = langs.get(concept.id, [])
        out.append(
            {
                "id": concept.id,
                "name": concept.name,
                "short_description": concept.short_description or "",
                "subject_id": subject.id,
                "subject_name": subject.name,
                "domain": concept.domain or "",
                "chapter_id": chapter.id,
                "chapter_name": chapter.name,
                "topic_name": concept.topic_name or "",
                "class": concept.class_,
                "order": concept.order_index,
                "available_languages": cl,
                "language_count": len(cl),
                "total_generated_videos": len(cl),
                "video_duration_minutes": (concept.media_duration_minutes if hasattr(concept, "media_duration_minutes") else None) or 12,
                "prerequisite_id": concept.prerequisite_id,
            }
        )
    await cache_set_json("cache:library:concepts", out, settings.cache_ttl_global)
    return out


def _tier(count: int) -> str:
    if count >= 12:
        return "full"
    if count >= 8:
        return "high"
    if count >= 4:
        return "moderate"
    return "low"


@router.get("/summary")
async def summary(session: DbSession):
    concepts = await _concept_rows(session)
    total_videos = sum(c["total_generated_videos"] for c in concepts)
    supported = len({l for c in concepts for l in c["available_languages"]})
    tiers = {"full": 0, "high": 0, "moderate": 0, "low": 0}
    for c in concepts:
        tiers[_tier(c["language_count"])] += 1
    n = len(concepts)
    return {
        "total_generated_videos": total_videos,
        "total_concepts": n,
        "total_languages_supported": supported,
        "average_languages_per_concept": round(total_videos / n, 1) if n else 0,
        "coverage_tiers": tiers,
    }


@router.get("/concepts")
async def concepts(
    q: str | None = None,
    subject: str | None = None,
    user: CurrentUser = None,
    session: DbSession = None,
):
    rows = await _concept_rows(session)
    needle = (q or "").strip().lower()
    subj = (subject or "all").strip().lower()

    # Per-user overlays (NOT cached globally).
    mastery = {}
    misconcept = {}
    if user is not None:
        mrows = (
            await session.execute(
                select(UserConceptMastery).where(UserConceptMastery.student_id == user.id)
            )
        ).scalars().all()
        mastery = {m.concept_id: m.status for m in mrows}
        misconcept = set(
            (
                await session.execute(
                    select(Misconception.concept_id).where(
                        Misconception.student_id == user.id,
                        Misconception.status == "needs_review",
                    )
                )
            ).scalars().all()
        )

    out = []
    for c in rows:
        if subj not in ("all", "") and c["subject_id"] != subj and c["domain"].lower() != subj:
            continue
        if needle:
            hay = " ".join(
                [c["name"], c["short_description"], c["domain"], c["chapter_name"], c["topic_name"]]
            ).lower()
            if needle not in hay:
                continue
        item = {**c}
        status = mastery.get(c["id"], "locked")
        if c["id"] in misconcept:
            status = "needs-revisit"
        item["student_progress"] = status
        out.append(item)

    return {"concepts": out, "total_results": len(out)}


@router.get("/hierarchy")
async def hierarchy(
    subject: str | None = None,
    user: CurrentUser = None,
    session: DbSession = None,
):
    rows = await _concept_rows(session)
    subj = (subject or "all").strip().lower()
    if subj not in ("all", ""):
        rows = [c for c in rows if c["subject_id"] == subj]

    # per-user statuses
    mastery = {}
    misconcept = set()
    if user is not None:
        mrows = (
            await session.execute(
                select(UserConceptMastery).where(UserConceptMastery.student_id == user.id)
            )
        ).scalars().all()
        mastery = {m.concept_id: m.status for m in mrows}
        misconcept = set(
            (
                await session.execute(
                    select(Misconception.concept_id).where(
                        Misconception.student_id == user.id,
                        Misconception.status == "needs_review",
                    )
                )
            ).scalars().all()
        )

    sections: dict[str, dict] = {}
    for c in rows:
        sec = sections.setdefault(
            c["subject_id"],
            {"subject_id": c["subject_id"], "subject_name": c["subject_name"], "domains": {}},
        )
        dom = sec["domains"].setdefault(
            c["domain"] or "General",
            {"domain_name": c["domain"] or "General", "subject_id": c["subject_id"],
             "subject_name": c["subject_name"], "concepts": []},
        )
        item = {**c}
        status = mastery.get(c["id"], "locked")
        if c["id"] in misconcept:
            status = "needs-revisit"
        item["student_progress"] = status
        dom["concepts"].append(item)

    out = []
    for sec in sections.values():
        domains = list(sec["domains"].values())
        out.append(
            {
                "subject_id": sec["subject_id"],
                "subject_name": sec["subject_name"],
                "total_concepts": sum(len(d["concepts"]) for d in domains),
                "domains": domains,
            }
        )
    return {"sections": out}
