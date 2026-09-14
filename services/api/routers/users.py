"""Profile, preferences, interests, offline chapters (contract §2, §7)."""

from __future__ import annotations

import uuid
from datetime import date

from akara_db.models import (
    Chapter,
    Concept,
    ConceptMedia,
    OfflineDownload,
    Subject,
    UserInterest,
    UserPreference,
)
from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select

from services.api.deps import CurrentUser, DbSession
from services.api.r2 import public_url

router = APIRouter(prefix="/api/users/me", tags=["users"])


# ------------------------------------------------------------------ profile


ALLOWED_PHOTO_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5MB


@router.put("/profile/photo", status_code=200)
async def upload_profile_photo(
    file: UploadFile,
    user: CurrentUser,
    session: DbSession,
):
    """Upload a profile photo to R2 and set it as the user's avatar.

    Returns the SAME profile shape as GET /profile (with the new
    profile_photo URL) so the client can update state in one round-trip.
    """
    ext = ALLOWED_PHOTO_TYPES.get(file.content_type or "")
    if ext is None:
        raise HTTPException(415, "Unsupported image type (jpeg/png/webp only)")

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Image too large (max 5MB)")

    from services.api.r2 import avatar_key, upload_bytes

    key = avatar_key(user.id, ext)
    try:
        upload_bytes(key, data, file.content_type or "image/jpeg")
    except Exception as e:
        raise HTTPException(502, f"Storage upload failed: {e}") from e

    url = public_url(key)
    user.profile_photo = url
    await session.commit()
    await session.refresh(user)  # reload server onupdate fields (updated_at)

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "profile_photo": user.profile_photo,
        "class": user.class_,
        "default_language": user.default_language,
        "onboarding_completed": user.onboarding_completed,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
    }


@router.get("/profile")
async def get_profile(user: CurrentUser):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "profile_photo": user.profile_photo,
        "class": user.class_,
        "default_language": user.default_language,
        "onboarding_completed": user.onboarding_completed,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
    }


class ProfilePatch(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    profile_photo: str | None = None
    class_: int | None = Field(default=None, ge=6, le=12, alias="class")
    default_language: str | None = Field(default=None, max_length=10)

    model_config = {"populate_by_name": True}


@router.patch("/profile")
async def patch_profile(payload: ProfilePatch, user: CurrentUser, session: DbSession):
    data = payload.model_dump(exclude_unset=True, by_alias=True)
    if data.get("name"):
        user.name = data["name"].strip()
    if "profile_photo" in data:
        user.profile_photo = data["profile_photo"]
    if "class" in data:
        user.class_ = data["class"]
    if "default_language" in data:
        user.default_language = data["default_language"]

    # Onboarding rule (contract §2.2): class + language ⇒ completed.
    if user.class_ is not None and user.default_language:
        user.onboarding_completed = True
    await session.commit()
    await session.refresh(user)  # reload server onupdate fields (updated_at)

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "profile_photo": user.profile_photo,
        "class": user.class_,
        "default_language": user.default_language,
        "onboarding_completed": user.onboarding_completed,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
    }


# ------------------------------------------------------------------ preferences


@router.get("/preferences")
async def get_preferences(user: CurrentUser, session: DbSession):
    row = await session.get(UserPreference, user.id)
    return {
        "data_saver_mode": row.data_saver_mode if row else False,
        "updated_at": row.updated_at.isoformat() if row and row.updated_at else None,
    }


class PreferencesPatch(BaseModel):
    data_saver_mode: bool


@router.patch("/preferences")
async def patch_preferences(payload: PreferencesPatch, user: CurrentUser, session: DbSession):
    row = await session.get(UserPreference, user.id)
    if row is None:
        row = UserPreference(user_id=user.id, data_saver_mode=payload.data_saver_mode)
        session.add(row)
    else:
        row.data_saver_mode = payload.data_saver_mode
    await session.commit()
    await session.refresh(row)  # reload server onupdate fields (updated_at)
    return {"data_saver_mode": row.data_saver_mode, "updated_at": row.updated_at.isoformat()}


# ------------------------------------------------------------------ interests


@router.get("/interests")
async def get_interests(user: CurrentUser, session: DbSession):
    rows = (
        await session.execute(
            select(UserInterest.interest)
            .where(UserInterest.user_id == user.id)
            .order_by(UserInterest.interest)
        )
    ).scalars().all()
    return {"interests": list(rows)}


class InterestsPut(BaseModel):
    interests: list[str] = Field(max_length=30)


@router.put("/interests")
async def put_interests(payload: InterestsPut, user: CurrentUser, session: DbSession):
    """Set-replace (docs/database.md §7)."""
    cleaned = [i.strip() for i in payload.interests if i.strip()][:30]
    await session.execute(delete(UserInterest).where(UserInterest.user_id == user.id))
    for interest in dict.fromkeys(cleaned):  # dedupe preserving order
        session.add(UserInterest(user_id=user.id, interest=interest))
    await session.commit()
    return {"success": True, "interests": cleaned}


# ------------------------------------------------------------------ offline chapters


def _dl_payload(row: OfflineDownload, chapter: Chapter | None, subject: Subject | None) -> dict:
    return {
        "id": row.id,
        "chapterId": row.chapter_id,
        "chapterName": chapter.name if chapter else row.chapter_id,
        "subjectId": chapter.subject_id if chapter else None,
        "subjectName": subject.name if subject else None,
        "class": chapter.class_ if chapter else None,
        "sizeMb": row.size_mb,
        "downloadedAt": row.downloaded_at.isoformat(),
        "conceptCount": row.concept_count,
    }


@router.get("/offline-chapters")
async def get_offline_chapters(user: CurrentUser, session: DbSession):
    rows = (
        await session.execute(
            select(OfflineDownload).where(OfflineDownload.user_id == user.id).order_by(
                OfflineDownload.downloaded_at.desc()
            )
        )
    ).scalars().all()
    chapters = {
        c.id: c
        for c in (
            await session.execute(select(Chapter).where(Chapter.id.in_([r.chapter_id for r in rows] or ["-"])))
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
    total_mb = sum(r.size_mb or 0.0 for r in rows)
    return {
        "downloaded_chapters": [_dl_payload(r, chapters.get(r.chapter_id), subjects.get(chapters.get(r.chapter_id).subject_id if chapters.get(r.chapter_id) else "")) for r in rows],
        "total_storage_used_mb": round(total_mb, 1),
    }


class OfflineDownloadCreate(BaseModel):
    chapter_id: str
    lang: str = Field(max_length=10)


@router.post("/offline-chapters", status_code=201)
async def create_offline_download(payload: OfflineDownloadCreate, user: CurrentUser, session: DbSession):
    """Called by the client after it finishes caching files locally."""
    chapter = await session.get(Chapter, payload.chapter_id)
    if chapter is None:
        raise HTTPException(404, "Unknown chapter")

    stats = (
        await session.execute(
            select(
                func.count(ConceptMedia.id),
                func.coalesce(func.sum(ConceptMedia.size_bytes), 0),
            ).where(
                ConceptMedia.concept_id.in_(
                    select(Concept.id).where(Concept.chapter_id == payload.chapter_id)
                ),
                ConceptMedia.lang == payload.lang,
                ConceptMedia.status == "complete",
            )
        )
    ).one()
    count, total_bytes = int(stats[0]), int(stats[1])

    row = OfflineDownload(
        id=f"dl_{uuid.uuid4().hex[:8]}",
        user_id=user.id,
        chapter_id=payload.chapter_id,
        lang=payload.lang,
        size_mb=round(total_bytes / (1024 * 1024), 1),
        concept_count=count,
        downloaded_at=date.today(),
    )
    session.add(row)
    await session.commit()
    return {"id": row.id, "sizeMb": row.size_mb, "conceptCount": row.concept_count}


@router.delete("/offline-chapters/{download_id}")
async def delete_offline_download(download_id: str, user: CurrentUser, session: DbSession):
    row = await session.get(OfflineDownload, download_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(404, "Download not found")
    await session.delete(row)
    await session.commit()
    return {"success": True, "id": download_id}
