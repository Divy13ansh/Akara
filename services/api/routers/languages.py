"""Language demand endpoints (contract §7.3/7.4): zero-start board (D-12),
monthly dedup via UNIQUE(user_id, language, month)."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime

from akara_db.models import LanguageRequest
from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from services.api.config import settings
from services.api.deps import CurrentUser, DbSession
from services.api.redis_client import rate_limit

router = APIRouter(prefix="/api/languages", tags=["languages"])


@router.get("/demand")
async def demand(user: CurrentUser, session: DbSession):
    """Live demand counts grouped by language (all-time count; D-12 zero-start)."""
    rows = (
        await session.execute(
            select(
                LanguageRequest.language,
                func.max(LanguageRequest.native_script),
                func.count(LanguageRequest.id),
            )
            .group_by(LanguageRequest.language)
            .order_by(func.count(LanguageRequest.id).desc())
        )
    ).all()
    return {
        "demands": [
            {"language": lang, "nativeScript": script, "requestedCount": int(n)}
            for lang, script, n in rows
        ]
    }


class RequestPayload(BaseModel):
    language: str = Field(min_length=2, max_length=60)


@router.post("/request")
async def request_language(payload: RequestPayload, user: CurrentUser, session: DbSession):
    if not await rate_limit("langreq", user.id, settings.rl_langreq_per_day, 86400):
        return {
            "success": False,
            "message": "Too many requests today — try again tomorrow.",
            "updatedCount": 0,
            "ticketId": "",
            "alreadyRequested": False,
        }

    language = payload.language.strip()
    month = datetime.now(UTC).strftime("%Y-%m")

    dup = (
        await session.execute(
            select(LanguageRequest).where(
                LanguageRequest.user_id == user.id,
                LanguageRequest.language == language,
                LanguageRequest.month == month,
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        total = (
            await session.execute(
                select(func.count(LanguageRequest.id)).where(LanguageRequest.language == language)
            )
        ).scalar() or 0
        return {
            "success": False,
            "message": f"You have already requested {language} this month.",
            "updatedCount": int(total),
            "ticketId": "",
            "alreadyRequested": True,
        }

    ticket = f"BATCH-LANG-{secrets.token_hex(3).upper()}"
    session.add(
        LanguageRequest(
            language=language, user_id=user.id, month=month, ticket_id=ticket
        )
    )
    await session.commit()

    total = (
        await session.execute(
            select(func.count(LanguageRequest.id)).where(LanguageRequest.language == language)
        )
    ).scalar() or 0
    return {
        "success": True,
        "message": f"{language} request received and added to batch generation queue.",
        "updatedCount": int(total),
        "ticketId": ticket,
        "alreadyRequested": False,
    }
