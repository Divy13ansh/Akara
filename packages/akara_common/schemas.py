"""Shared schemas, enums, and TopicData contract (single source of truth).

TopicData = {topic_id, topic, script, rubric, grade, subject, lang}
See docs/data-contracts.md.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field


@dataclass
class RubricPoint:
    """Single assessable point within a rubric level."""

    id: int
    text: str
    misconception: str = ""  # explicit misconception text, if any


@dataclass
class RubricLevel:
    """One level in the Feynman mastery ladder."""

    level: int  # 1-4
    name: str  # e.g. "Recall", "Mechanism", "Misconception-Buster", "Application"
    description: str  # what the student must demonstrate
    points: list[RubricPoint] = field(default_factory=list)
    mastery_threshold: float = 0.7  # fraction of points that must be covered to pass this level


@dataclass
class TopicData:
    topic_id: str
    topic: str
    script: str
    rubric: str  # flat numbered string (legacy, still used by video pipeline)
    grade: str = ""
    subject: str = ""
    lang: str = "en"
    # Optional structured rubric (Feynman mastery ladder). When present, the
    # tutor prompt and scorer prefer this over the flat `rubric` string.
    rubric_levels: list[RubricLevel] | None = None

    def to_metadata_json(self) -> str:
        d = asdict(self)
        # rubric_levels is optional; omit if None to save metadata size
        if d.get("rubric_levels") is None:
            d.pop("rubric_levels", None)
        return json.dumps(d)

    @classmethod
    def from_metadata_json(cls, raw: str | None) -> TopicData | None:
        """Parse LiveKit job metadata. Accepts full TopicData or legacy
        {topic, script, rubric} shape from early tests."""
        if not raw:
            return None
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(data, dict):
            return None
        if "topic_id" not in data:
            # legacy shape: topic/script/rubric only
            if not all(k in data for k in ("topic", "script", "rubric")):
                return None
            data = {
                "topic_id": "legacy-topic",
                "grade": "",
                "subject": "",
                "lang": data.get("lang", "en"),
                **data,
            }
        # Optional structured rubric (leveled Feynman ladder)
        rubric_levels_raw = data.get("rubric_levels")
        rubric_levels: list[RubricLevel] | None = None
        if isinstance(rubric_levels_raw, list):
            try:
                rubric_levels = [
                    RubricLevel(
                        level=rl["level"],
                        name=rl["name"],
                        description=rl["description"],
                        points=[RubricPoint(**p) for p in rl.get("points", [])],
                        mastery_threshold=rl.get("mastery_threshold", 0.7),
                    )
                    for rl in rubric_levels_raw
                ]
            except (KeyError, TypeError):
                rubric_levels = None
        try:
            return cls(
                **{
                    k: data.get(k, "")
                    for k in ("topic_id", "topic", "script", "rubric", "grade", "subject", "lang")
                },
                rubric_levels=rubric_levels,
            )
        except TypeError:
            return None


@dataclass
class SessionMetadata:
    """Wraps TopicData + session identity for LiveKit job metadata."""

    topic: TopicData
    student_id: str
    room_name: str

    def to_json(self) -> str:
        return json.dumps(
            {
                "topic": asdict(self.topic),
                "student_id": self.student_id,
                "room_name": self.room_name,
            }
        )

    @classmethod
    def from_json(cls, raw: str | None) -> SessionMetadata | None:
        if not raw:
            return None
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(data, dict):
            return None
        # New shape: {topic: {...}, student_id, room_name}
        if "topic" in data and isinstance(data["topic"], dict):
            topic = TopicData.from_metadata_json(json.dumps(data["topic"]))
            if topic is None:
                return None
            return cls(
                topic=topic,
                student_id=data.get("student_id", "unknown"),
                room_name=data.get("room_name", "unknown"),
            )
        # Legacy shape: flat TopicData (no student_id wrapper)
        topic = TopicData.from_metadata_json(raw)
        if topic:
            return cls(topic=topic, student_id="unknown", room_name="unknown")
        return None


@dataclass
class TranscriptTurn:
    role: str  # "tutor" | "student"
    text: str
    ts: float = 0.0
    stt_lang: str = ""
    conf: float = 0.0
    stt_lat_ms: int = 0  # end-of-speech → transcript ready
    llm_ttft_ms: int = 0  # transcript ready → first LLM token
    tts_ttfb_ms: int = 0  # first LLM token → first TTS audio byte


@dataclass
class Transcript:
    room_name: str
    topic_id: str
    student_id: str
    lang: str
    turns: list[TranscriptTurn] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "room_name": self.room_name,
            "topic_id": self.topic_id,
            "student_id": self.student_id,
            "lang": self.lang,
            "turns": [asdict(t) if isinstance(t, TranscriptTurn) else t for t in self.turns],
        }


@dataclass
class CoveragePoint:
    id: int
    status: str  # covered | missed | misconceived
    evidence: str = ""


@dataclass
class CoverageResult:
    topic_id: str
    student_id: str
    mastery: float
    points: list[CoveragePoint]
    scorer_model: str = "heuristic-v0"

    def to_dict(self) -> dict:
        return {
            "topic_id": self.topic_id,
            "student_id": self.student_id,
            "mastery": self.mastery,
            "points": [asdict(p) for p in self.points],
            "scorer_model": self.scorer_model,
        }
