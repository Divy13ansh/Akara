"""FastAPI dependencies: DB session, current user, webhook secret guard."""

from __future__ import annotations

from typing import Annotated

from akara_db.base import get_session
from akara_db.models import User
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from services.api.config import settings
from services.api.security import decode_access_token


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    session: AsyncSession = Depends(get_session),
) -> User:
    """Bearer-token auth. 401 when missing/invalid/unknown user."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(401, "Invalid or expired token")
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(401, "User no longer exists")
    return user


async def get_optional_user(
    authorization: Annotated[str | None, Header()] = None,
    session: AsyncSession = Depends(get_session),
) -> User | None:
    """Like get_current_user but returns None instead of 401 — for endpoints
    that personalize when a token is present (legacy /token, library)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    user_id = decode_access_token(token)
    if not user_id:
        return None
    return (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]
DbSession = Annotated[AsyncSession, Depends(get_session)]


async def require_webhook_secret(
    x_webhook_secret: Annotated[str | None, Header()] = None,
) -> None:
    """Guards /webhooks/* and /internal/* (voice worker, video worker)."""
    expected = settings.webhook_secret
    if expected and x_webhook_secret != expected:
        raise HTTPException(401, "Invalid webhook secret")


def client_ip(request: Request) -> str:
    """Client IP for rate limiting (behind nginx use X-Forwarded-For)."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
