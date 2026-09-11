"""Shared schemas, enums, and TopicData contract (single source of truth).

TopicData = {topic_id, topic, script, rubric, grade, subject, lang}
See docs/data-contracts.md.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field


@dataclass
class TopicData:
    topic_id: str
    topic: str
    script: str
    rubric: str
    grade: str = ""
    subject: str = ""
    lang: str = "en"

    def to_metadata_json(self) -> str:
        return json.dumps(asdict(self))

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
        try:
            return cls(**{k: data.get(k, "") for k in
                          ("topic_id", "topic", "script", "rubric",
                           "grade", "subject", "lang")})
        except TypeError:
            return None


@dataclass
class TranscriptTurn:
    role: str  # "tutor" | "student"
    text: str
    ts: float = 0.0
    stt_lang: str = ""
    conf: float = 0.0


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
            "turns": [asdict(t) for t in self.turns],
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
