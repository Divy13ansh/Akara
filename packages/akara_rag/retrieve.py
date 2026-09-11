"""Offline NCERT retrieval (chunk -> multilingual-e5 -> FAISS).

Called pre-session by services/api, never in the voice hot path.
See docs/rag-ncert.md.

Current state: seed in-memory store (Newton's Third Law + 2 minimal seeds).
`scripts/ingest_ncert.py` + FAISS build land here later; `fetch_topic`
keeps the same signature so callers don't change.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from akara_common.schemas import TopicData
except ImportError:  # fallback when imported as top-level package
    from packages.akara_common.schemas import TopicData  # type: ignore

SEED_TOPICS: dict[str, TopicData] = {
    "phy9-newton3": TopicData(
        topic_id="phy9-newton3",
        topic="Newton's Third Law of Motion",
        script=(
            "Every action has an equal and opposite reaction. When object A "
            "exerts a force on object B, object B simultaneously exerts a force "
            "of equal magnitude and opposite direction on object A. These two "
            "forces act on DIFFERENT objects, which is why they don't cancel "
            "out, even though they are equal and opposite."
        ),
        rubric=(
            "1. Forces come in pairs (action-reaction). "
            "2. Equal in magnitude, opposite in direction. "
            "3. The two forces act on two DIFFERENT objects (the classic "
            "misconception is thinking they act on the same object and should "
            "cancel). "
            "4. Bonus: a correct real-world example (walking, rocket "
            "propulsion, gun recoil) with both objects correctly identified."
        ),
        grade="9",
        subject="physics",
        lang="en",
    ),
    "phy9-inertia": TopicData(
        topic_id="phy9-inertia",
        topic="Inertia and Newton's First Law",
        script=(
            "An object keeps doing what it is doing unless a net external force "
            "acts on it. A book on a table stays at rest and a rolling ball keeps "
            "rolling unless friction or another force changes its motion."
        ),
        rubric=(
            "1. Objects resist change in motion (inertia). "
            "2. Net external force is needed to change velocity. "
            "3. Misconception: motion needs a continuous force to continue."
        ),
        grade="9",
        subject="physics",
        lang="en",
    ),
    "math10-quadratic": TopicData(
        topic_id="math10-quadratic",
        topic="Quadratic Equations",
        script=(
            "A quadratic equation ax^2 + bx + c = 0 with a != 0 has at most two "
            "roots, given by x = (-b +- sqrt(b^2 - 4ac)) / 2a. The discriminant "
            "D = b^2 - 4ac tells whether roots are real, equal, or complex."
        ),
        rubric=(
            "1. Standard form with a != 0. "
            "2. Quadratic formula stated correctly. "
            "3. Discriminant meaning (D>0 two reals, D=0 equal, D<0 complex). "
            "4. Misconception: every quadratic has two distinct real roots."
        ),
        grade="10",
        subject="maths",
        lang="en",
    ),
}


def fetch_topic(topic_id: str, lang: str = "en") -> TopicData | None:
    """Resolve topic_id -> TopicData. FAISS lookup later; seed dict now."""
    topic = SEED_TOPICS.get(topic_id)
    if topic is None:
        return None
    if lang and lang != topic.lang:
        # Return copy with requested lang; translated script/rubric land later.
        from dataclasses import replace
        return replace(topic, lang=lang)
    return topic


def list_topics() -> list[TopicData]:
    return list(SEED_TOPICS.values())
