"""Daily activity endpoints (D-8): heartbeat upsert + calendar read."""

from __future__ import annotations

from datetime import date, timedelta

from akara_db.models import DailyActivity
from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from services.api.config import settings
from services.api.deps import CurrentUser, DbSession, client_ip
from services.api.redis_client import rate_limit

router = APIRouter(prefix="/api/activity", tags=["activity"])


class Heartbeat(BaseModel):
    minutes: int = Field(ge=0, le=30)  # per-heartbeat cap; client sends ~1 min ticks


@router.post("/heartbeat")
async def heartbeat(payload: Heartbeat, request: Request, user: CurrentUser, session: DbSession):
    if not await rate_limit("heartbeat", client_ip(request), settings.rl_heartbeat_per_min, 60):
        return {"accepted": False, "reason": "throttled"}

    today = date.today()
    row = await session.get(DailyActivity, (user.id, today))
    if row is None:
        row = DailyActivity(user_id=user.id, date=today, minutes=payload.minutes)
        session.add(row)
    else:
        row.minutes = min(row.minutes + payload.minutes, 24 * 60)
    await session.commit()
    return {"accepted": True, "date": today.isoformat(), "minutes": row.minutes}


@router.get("/calendar")
async def calendar(
    month: str | None = Query(default=None, description="YYYY-MM; defaults to current month"),
    user: CurrentUser = None,
    session: DbSession = None,
):
    today = date.today()
    if month:
        year, mon = (int(x) for x in month.split("-"))
    else:
        year, mon = today.year, today.month

    start = date(year, mon, 1)
    end = (start + timedelta(days=32)).replace(day=1) - timedelta(days=1)

    rows = (
        await session.execute(
            select(DailyActivity).where(
                DailyActivity.user_id == user.id,
                DailyActivity.date >= start,
                DailyActivity.date <= end,
            )
        )
    ).scalars().all()

    days = {r.date.isoformat(): r.minutes for r in rows}
    return {"month": f"{year:04d}-{mon:02d}", "days": days}
