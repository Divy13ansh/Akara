"""Video/library API: topic catalog backed by akara_rag seed store."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "packages"))

try:
    from akara_rag.retrieve import fetch_topic, list_topics
except ImportError:
    from packages.akara_rag.retrieve import fetch_topic, list_topics  # type: ignore


def get_topics() -> list[dict]:
    return [
        {"topic_id": t.topic_id, "topic": t.topic,
         "grade": t.grade, "subject": t.subject, "lang": t.lang}
        for t in list_topics()
    ]


def get_topic(topic_id: str, lang: str = "en") -> dict | None:
    t = fetch_topic(topic_id, lang=lang)
    if not t:
        return None
    return {"topic_id": t.topic_id, "topic": t.topic, "script": t.script,
            "rubric": t.rubric, "grade": t.grade,
            "subject": t.subject, "lang": t.lang}
