"""Auth endpoints: signup / login / google (GIS id_token) per
apps/web/backend-endpoints.md §1. Responses match the frontend contract:
{token, user:{id, name, email, profile_photo, class, default_language,
onboarding_completed}}."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from akara_db.models import User, UserPreference
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from services.api.config import settings
from services.api.deps import DbSession, client_ip
from services.api.redis_client import rate_limit
from services.api.security import (
    create_access_token,
    hash_password,
    verify_google_id_token,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _gen_user_id() -> str:
    return f"usr_{uuid.uuid4().hex[:10]}"


def _user_payload(u: User) -> dict:
    return {
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "profile_photo": u.profile_photo,
        "class": u.class_,
        "default_language": u.default_language,
        "onboarding_completed": u.onboarding_completed,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "updated_at": u.updated_at.isoformat() if u.updated_at else None,
    }


async def _ensure_preferences(session, user_id: str) -> None:
    row = await session.get(UserPreference, user_id)
    if row is None:
        session.add(UserPreference(user_id=user_id))


class SignupPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


@router.post("/signup", status_code=201)
async def signup(payload: SignupPayload, request: Request, session: DbSession):
    if not await rate_limit("signup", client_ip(request), settings.rl_signup_per_min, 60):
        raise HTTPException(429, "Too many attempts, try again shortly")

    existing = (
        await session.execute(select(User).where(User.email == payload.email.lower()))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(409, "An account with this email already exists")

    user = User(
        id=_gen_user_id(),
        name=payload.name.strip(),
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        onboarding_completed=False,
        last_login_at=datetime.now(UTC),
    )
    session.add(user)
    await _ensure_preferences(session, user.id)
    await session.commit()
    await session.refresh(user)  # reload server onupdate fields (updated_at)
    return {"token": create_access_token(user.id), "user": _user_payload(user)}


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


@router.post("/login")
async def login(payload: LoginPayload, request: Request, session: DbSession):
    if not await rate_limit("login", client_ip(request), settings.rl_login_per_min, 60):
        raise HTTPException(429, "Too many attempts, try again shortly")

    user = (
        await session.execute(select(User).where(User.email == payload.email.lower()))
    ).scalar_one_or_none()
    if user is None or not user.password_hash or not verify_password(
        payload.password, user.password_hash
    ):
        raise HTTPException(401, "Invalid email or password")

    user.last_login_at = datetime.now(UTC)
    await _ensure_preferences(session, user.id)
    await session.commit()
    await session.refresh(user)  # reload server onupdate fields (updated_at)
    return {"token": create_access_token(user.id), "user": _user_payload(user)}


class GoogleAuthPayload(BaseModel):
    id_token: str
    provider: str = "google"


@router.post("/google")
async def google_auth(payload: GoogleAuthPayload, request: Request, session: DbSession):
    if not settings.google_client_id:
        raise HTTPException(501, "Google sign-in not configured (GOOGLE_CLIENT_ID unset)")

    claims = verify_google_id_token(payload.id_token)
    if claims is None:
        raise HTTPException(400, "Invalid or expired Google credential")

    google_id = claims["sub"]
    email = (claims.get("email") or "").lower()
    user = (
        await session.execute(select(User).where(User.google_id == google_id))
    ).scalar_one_or_none()
    if user is None and email:
        user = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if user is not None and user.google_id is None:
            user.google_id = google_id  # link existing password account

    if user is None:
        # Auto-signup from the Google profile (contract §1.3: never prompt).
        user = User(
            id=_gen_user_id(),
            name=claims.get("name") or email.split("@")[0] or "Student",
            email=email or None,
            google_id=google_id,
            profile_photo=claims.get("picture"),
            onboarding_completed=False,
            last_login_at=datetime.now(UTC),
        )
        session.add(user)
        await _ensure_preferences(session, user.id)
    else:
        user.last_login_at = datetime.now(UTC)
        user.profile_photo = user.profile_photo or claims.get("picture")

    await session.commit()
    await session.refresh(user)  # reload server onupdate fields (updated_at)
    return {"token": create_access_token(user.id), "user": _user_payload(user)}
