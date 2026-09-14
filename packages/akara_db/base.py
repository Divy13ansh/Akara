"""Engine + session factory for akara_db (SQLAlchemy 2.0, async)."""

from __future__ import annotations

import os
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Declarative base for all akara_db models."""


def database_url() -> str:
    url = os.getenv("ASYNC_DATABASE_URL") or os.getenv("DATABASE_URL", "")
    if not url:
        raise RuntimeError(
            "ASYNC_DATABASE_URL (or DATABASE_URL) is not set. "
            "Copy .env.example to .env.local and fill it in."
        )
    # Alembic/scripts may pass the sync psycopg URL; convert for asyncpg.
    if url.startswith("postgresql+psycopg://"):
        url = url.replace("postgresql+psycopg://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


@lru_cache
def get_engine() -> AsyncEngine:
    """One shared engine per process, sized for the classroom pilot (D-18)."""
    return create_async_engine(
        database_url(),
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,  # survive docker postgres restarts
        pool_recycle=1800,
        echo=False,
    )


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_session() -> AsyncSession:
    """FastAPI dependency yielding an AsyncSession."""
    async with get_sessionmaker()() as session:
        yield session
