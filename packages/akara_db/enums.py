"""Status enums used across akara_db models and API logic.

Stored as plain TEXT columns (docs/database.md design rule 3) — the values here
are the single source of truth for what can appear in each column.
"""

from __future__ import annotations

from enum import StrEnum


class MediaStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETE = "complete"
    FAILED = "failed"


class VideoStage(StrEnum):
    """The 5 pipeline stages from docs/video-pipeline.md."""

    QUEUED = "queued"
    SCENE_PLANNING = "scene_planning"
    MANIM_RENDERING = "manim_rendering"
    SCRIPT_GENERATION = "script_generation"
    TTS = "tts"
    STITCHING = "stitching"
    DONE = "done"
    ERROR = "error"


class RenderStage(StrEnum):
    """Job-level stages stored on video_render_jobs.current_stage."""

    QUEUED = "queued"
    SCENE_PLANNING = "scene_planning"
    MANIM_RENDERING = "manim_rendering"
    SCRIPT_GENERATION = "script_generation"
    TTS_GENERATION = "tts_generation"
    STITCH_AND_MUX = "stitch_and_mux"
    SADTALKER = "sadtalker"
    DONE = "done"
    ERROR = "error"


class MasteryStatus(StrEnum):
    LOCKED = "locked"
    AVAILABLE = "available"
    LEARNING = "learning"
    MASTERED = "mastered"
    NEEDS_REVISIT = "needs-revisit"


class CoverageStatus(StrEnum):
    COVERED = "covered"
    MISSED = "missed"
    MISCONCEIVED = "misconceived"


class MisconceptionStatus(StrEnum):
    NEEDS_REVIEW = "needs_review"
    RESOLVED = "resolved"


class MisconceptionSeverity(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class SessionType(StrEnum):
    VOICE = "voice"
    TEXT = "text"


MASTERY_THRESHOLD = 0.7
