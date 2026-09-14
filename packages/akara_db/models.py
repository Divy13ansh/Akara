"""All ORM models. Import * from this module in Alembic env.py so every
table is registered on Base.metadata.

Design rules (docs/architecture/database.md §0): TEXT app-generated PKs, created_at on every
table, updated_at on mutable tables, JSONB for write-once-read-whole blobs.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from akara_db.base import Base

# ---------------------------------------------------------------- identity


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(Text, primary_key=True)  # usr_9872341
    name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str | None] = mapped_column(Text, unique=True)
    password_hash: Mapped[str | None] = mapped_column(Text)  # NULL for Google-only
    google_id: Mapped[str | None] = mapped_column(Text, unique=True)  # Google `sub`
    profile_photo: Mapped[str | None] = mapped_column(Text)
    class_: Mapped[int | None] = mapped_column("class", SmallInteger)  # 6-12
    default_language: Mapped[str | None] = mapped_column(String(10))
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    preferences: Mapped[UserPreference | None] = relationship(back_populates="user", uselist=False)


class UserPreference(Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    data_saver_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="preferences")


# ---------------------------------------------------------------- curriculum


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[str] = mapped_column(Text, primary_key=True)  # science, physics
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str] = mapped_column(String(8), nullable=False)  # SCI, MATH
    description: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str | None] = mapped_column(Text)  # emoji/illustration key
    class_min: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 6-10 science
    class_max: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Chapter(Base):
    __tablename__ = "chapters"
    __table_args__ = (Index("ix_chapters_subject_number", "subject_id", "chapter_number"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)  # chemical-reactions
    subject_id: Mapped[str] = mapped_column(ForeignKey("subjects.id"), nullable=False)
    chapter_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    class_: Mapped[int] = mapped_column("class", SmallInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Concept(Base):
    """The central table. `id` == topic_id (D-1: {subject}{grade}-{slug})."""

    __tablename__ = "concepts"
    __table_args__ = (
        UniqueConstraint("chapter_id", "order_index", name="uq_concepts_chapter_order"),
        Index("ix_concepts_subject", "subject_id"),
        Index("ix_concepts_chapter", "chapter_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)  # phy11-newton3, sci10-balancing-equations
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id"), nullable=False)
    subject_id: Mapped[str] = mapped_column(ForeignKey("subjects.id"), nullable=False)  # denorm for filters
    domain: Mapped[str | None] = mapped_column(Text)  # Chemistry, Algebra... (library grouping)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    short_description: Mapped[str | None] = mapped_column(Text)  # library card text
    # Topic-group label for the constellation (build-plan §1 delta #1):
    topic_name: Mapped[str | None] = mapped_column(Text)  # "Chemical Equations & Balancing"
    ncert_citation: Mapped[str | None] = mapped_column(Text)
    order_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    class_: Mapped[int] = mapped_column("class", SmallInteger, nullable=False)  # denorm from chapter
    script: Mapped[str | None] = mapped_column(Text)  # gold script (Manim + tutor share wording)
    rubric: Mapped[str | None] = mapped_column(Text)  # legacy flat rubric (video pipeline)
    rubric_levels: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)  # Feynman ladder
    prerequisite_id: Mapped[str | None] = mapped_column(ForeignKey("concepts.id"))  # NULL = root
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ---------------------------------------------------------------- media (pipeline)


class ConceptMedia(Base):
    """One row per (concept, lang) — what the player streams; generation-status reads this."""

    __tablename__ = "concept_media"
    __table_args__ = (
        UniqueConstraint("concept_id", "lang", name="uq_concept_media_concept_lang"),
        Index("ix_concept_media_status", "status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    concept_id: Mapped[str] = mapped_column(ForeignKey("concepts.id"), nullable=False)
    lang: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    current_stage: Mapped[str | None] = mapped_column(String(40))  # VideoStage values
    progress_percent: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    # Auto-render attempts spent on this row (generation-status trigger path).
    # Caps re-renders after terminal failures so a deterministically failing
    # render (e.g. missing system latex) can't burn tokens forever.
    retry_count: Mapped[int] = mapped_column(
        SmallInteger, default=0, server_default="0", nullable=False
    )
    est_seconds_remaining: Mapped[int | None] = mapped_column(SmallInteger)
    error: Mapped[str | None] = mapped_column(Text)
    video_r2_key: Mapped[str | None] = mapped_column(Text)  # videos/{concept}/{lang}/{video_id}/final.mp4
    thumbnail_r2_key: Mapped[str | None] = mapped_column(Text)
    audio_r2_key: Mapped[str | None] = mapped_column(Text)
    duration_seconds: Mapped[int | None] = mapped_column(SmallInteger)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)  # Data Saver + offline accounting
    source_video_id: Mapped[str | None] = mapped_column(Text)  # set when re-dubbed from existing render
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class VideoRenderJob(Base):
    """One row per pipeline run (retries create new rows). Latest run wins for status."""

    __tablename__ = "video_render_jobs"
    __table_args__ = (Index("ix_render_jobs_concept_lang", "concept_id", "lang", "created_at"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)  # video_id from generate_video_id()
    concept_id: Mapped[str | None] = mapped_column(ForeignKey("concepts.id"))  # NULL for ad-hoc renders
    lang: Mapped[str] = mapped_column(String(10), nullable=False)
    media_id: Mapped[int | None] = mapped_column(ForeignKey("concept_media.id"))
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    current_stage: Mapped[str | None] = mapped_column(String(40))  # RenderStage values
    stage_timings: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # {stage: seconds}
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ConceptQuiz(Base):
    """Script-derived quiz/mind-map/summary per (concept, lang). Separate from media
    so quizzes can regenerate without re-uploading video."""

    __tablename__ = "concept_quizzes"
    __table_args__ = (UniqueConstraint("concept_id", "lang", name="uq_concept_quizzes_concept_lang"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    concept_id: Mapped[str] = mapped_column(ForeignKey("concepts.id"), nullable=False)
    lang: Mapped[str] = mapped_column(String(10), nullable=False)
    quiz: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)  # [{id, question, options[], correct_index, explanation}]
    scene_graph: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # {nodes[], edges[]}
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # {summary_bullets[], key_definitions[], ncert_summary}
    mentor_prompt: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # {scenario, question_text, ...}
    # D-7 on-demand lifecycle: generating → ready | failed (ready rows with
    # content were seeded/backfilled before this column existed).
    generation_status: Mapped[str] = mapped_column(String(16), default="ready", server_default="ready", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ---------------------------------------------------------------- learning evidence


class Session(Base):
    """Both voice (LiveKit) and typed (evaluate-explanation) runs."""

    __tablename__ = "sessions"
    __table_args__ = (
        Index("ix_sessions_student_concept", "student_id", "concept_id", "created_at"),
        Index("ix_sessions_concept", "concept_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)  # = room_name for voice
    session_type: Mapped[str] = mapped_column(String(10), default="voice", nullable=False)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    concept_id: Mapped[str | None] = mapped_column(ForeignKey("concepts.id"))
    lang: Mapped[str | None] = mapped_column(String(10))
    dur_s: Mapped[float | None] = mapped_column(Float)
    explanation_text: Mapped[str | None] = mapped_column(Text)  # typed answer for text sessions
    scored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # idempotency marker
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Transcript(Base):
    """Raw immutable JSON per voice session — never mutated."""

    __tablename__ = "transcripts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), unique=True, nullable=False)
    raw_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TranscriptTurn(Base):
    __tablename__ = "transcript_turns"
    __table_args__ = (Index("ix_turns_transcript_index", "transcript_id", "turn_index"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    transcript_id: Mapped[int] = mapped_column(ForeignKey("transcripts.id"), nullable=False)
    turn_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    role: Mapped[str] = mapped_column(String(10), nullable=False)  # tutor | student
    text: Mapped[str] = mapped_column(Text, nullable=False)  # never truncated before scoring
    ts: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    stt_lang: Mapped[str | None] = mapped_column(String(20))
    conf: Mapped[float | None] = mapped_column(Float)
    stt_lat_ms: Mapped[int | None] = mapped_column(Integer)
    llm_ttft_ms: Mapped[int | None] = mapped_column(Integer)
    tts_ttfb_ms: Mapped[int | None] = mapped_column(Integer)


class RubricPoint(Base):
    """Flattened rubric_levels seeded from akara_rag. Composite PK (concept_id, id)."""

    __tablename__ = "rubric_points"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)  # point id from TopicData
    concept_id: Mapped[str] = mapped_column(ForeignKey("concepts.id"), primary_key=True)
    level: Mapped[int | None] = mapped_column(SmallInteger)  # 1-4; NULL when flat rubric
    level_name: Mapped[str | None] = mapped_column(Text)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    misconception: Mapped[str | None] = mapped_column(Text)
    mastery_threshold: Mapped[float | None] = mapped_column(Float)


class CoveragePoint(Base):
    """One row per (session, rubric point) verdict — the audit trail."""

    __tablename__ = "coverage_points"
    __table_args__ = (
        UniqueConstraint("session_id", "concept_id", "rubric_point_id", name="uq_coverage_session_point"),
        Index("ix_coverage_student_concept", "student_id", "concept_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), nullable=False)
    concept_id: Mapped[str] = mapped_column(ForeignKey("concepts.id"), nullable=False)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    rubric_point_id: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    status: Mapped[str] = mapped_column(String(15), nullable=False)  # covered|missed|misconceived
    evidence: Mapped[str | None] = mapped_column(Text)  # exact student quote (audit)
    scorer_model: Mapped[str | None] = mapped_column(String(40))
    scored_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class UserConceptMastery(Base):
    """The progress source of truth, one row per (student, concept)."""

    __tablename__ = "user_concept_mastery"
    __table_args__ = (Index("ix_mastery_student_updated", "student_id", "updated_at"),)

    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    concept_id: Mapped[str] = mapped_column(ForeignKey("concepts.id"), primary_key=True)
    status: Mapped[str] = mapped_column(String(15), default="locked", nullable=False)
    best_mastery: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mastered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # first time >= 0.7
    last_session_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Misconception(Base):
    """'Worth Another Look' diagnostics, seeded by the scorer."""

    __tablename__ = "misconceptions"
    __table_args__ = (Index("ix_misconceptions_student_status", "student_id", "status"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)  # diag-xxxxxx
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    concept_id: Mapped[str] = mapped_column(ForeignKey("concepts.id"), nullable=False)
    session_id: Mapped[str | None] = mapped_column(ForeignKey("sessions.id"))
    rubric_point_id: Mapped[int | None] = mapped_column(SmallInteger)
    severity: Mapped[str] = mapped_column(String(10), default="medium", nullable=False)
    diagnostic_insight: Mapped[str] = mapped_column(Text, nullable=False)
    actionable_hint: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(15), default="needs_review", nullable=False)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------- personalization


class UserInterest(Base):
    __tablename__ = "user_interests"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    interest: Mapped[str] = mapped_column(Text, primary_key=True)


class LanguageRequest(Base):
    """Demand board. UNIQUE (user_id, language, month) gives the monthly dedup."""

    __tablename__ = "language_requests"
    __table_args__ = (
        UniqueConstraint("user_id", "language", "month", name="uq_lang_req_user_lang_month"),
        Index("ix_lang_req_month", "month"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    language: Mapped[str] = mapped_column(Text, nullable=False)
    native_script: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    month: Mapped[str] = mapped_column(String(7), nullable=False)  # '2026-09'
    ticket_id: Mapped[str | None] = mapped_column(Text)  # BATCH-LANG-7A9B2C
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class OfflineDownload(Base):
    __tablename__ = "offline_downloads"

    id: Mapped[str] = mapped_column(Text, primary_key=True)  # dl-xxxxxx
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id"), nullable=False)
    lang: Mapped[str] = mapped_column(String(10), nullable=False)
    size_mb: Mapped[float | None] = mapped_column(Float)
    concept_count: Mapped[int | None] = mapped_column(SmallInteger)
    downloaded_at: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ---------------------------------------------------------------- costs & activity


class ProviderCost(Base):
    """One ledger, two producers (voice + video). Same log shape for both."""

    __tablename__ = "provider_costs"
    __table_args__ = (Index("ix_costs_created", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    job_type: Mapped[str] = mapped_column(String(20), nullable=False)  # voice_session | video_render
    session_id: Mapped[str | None] = mapped_column(ForeignKey("sessions.id"))
    render_job_id: Mapped[str | None] = mapped_column(ForeignKey("video_render_jobs.id"))
    metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    est_usd: Mapped[float | None] = mapped_column(Numeric(10, 4))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class DailyActivity(Base):
    """Per-day learning minutes (build-plan §1 delta #2). Fed by POST /api/activity/heartbeat."""

    __tablename__ = "daily_activity"
    __table_args__ = (Index("ix_daily_activity_user_date", "user_id", "date"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
