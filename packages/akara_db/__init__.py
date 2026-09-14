"""packages/akara_db — shared SQLAlchemy models, engine, and enums.

Import models from here so Alembic and both services see identical metadata:
    from akara_db.models import (
        Base, User, UserPreference, Subject, Chapter, Concept, ConceptMedia,
        VideoRenderJob, ConceptQuiz, Session, Transcript, TranscriptTurn,
        RubricPoint, CoveragePoint, UserConceptMastery, Misconception,
        UserInterest, LanguageRequest, OfflineDownload, ProviderCost,
        DailyActivity,
    )

20 tables per docs/database.md + build-plan deltas (concepts.topic_name,
daily_activity). See docs/build-plan-db-backend.md §1.
"""

from akara_db.base import Base, get_engine, get_session, get_sessionmaker
from akara_db.enums import (
    CoverageStatus,
    MasteryStatus,
    MediaStatus,
    MisconceptionSeverity,
    MisconceptionStatus,
    RenderStage,
    SessionType,
    VideoStage,
)

__all__ = [
    "Base",
    "CoverageStatus",
    "MasteryStatus",
    "MediaStatus",
    "MisconceptionSeverity",
    "MisconceptionStatus",
    "RenderStage",
    "SessionType",
    "VideoStage",
    "get_engine",
    "get_session",
    "get_sessionmaker",
]
