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
    from akara_common.schemas import RubricLevel, RubricPoint, TopicData
except ImportError:  # fallback when imported as top-level package
    from packages.akara_common.schemas import (  # type: ignore
        RubricLevel,
        RubricPoint,
        TopicData,
    )

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
        rubric=(  # flat string preserved for backward compat (video pipeline)
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
        rubric_levels=[
            RubricLevel(
                level=1,
                name="Recall",
                description="Student can state the law in their own words",
                mastery_threshold=1.0,
                points=[
                    RubricPoint(id=1, text="Forces come in pairs (action-reaction)"),
                    RubricPoint(id=2, text="Equal in magnitude, opposite in direction"),
                ],
            ),
            RubricLevel(
                level=2,
                name="Mechanism",
                description="Student explains WHY/HOW the law works",
                mastery_threshold=1.0,
                points=[
                    RubricPoint(
                        id=3,
                        text="The two forces act on two DIFFERENT objects",
                        misconception=(
                            "Thinking they act on the same object and should cancel"
                        ),
                    ),
                ],
            ),
            RubricLevel(
                level=3,
                name="Misconception-Buster",
                description="Student can identify and refute the classic misconception",
                mastery_threshold=1.0,
                points=[
                    RubricPoint(
                        id=4,
                        text=(
                            "Explains why action-reaction pairs don't cancel "
                            "even though equal and opposite"
                        ),
                        misconception=(
                            "If forces are equal and opposite they must cancel to zero net force"
                        ),
                    ),
                ],
            ),
            RubricLevel(
                level=4,
                name="Application",
                description=(
                    "Student gives a correct real-world example with both objects identified"
                ),
                mastery_threshold=1.0,
                points=[
                    RubricPoint(
                        id=5,
                        text=(
                            "Correct real-world example (walking, rocket, gun recoil) "
                            "with both objects identified"
                        ),
                    ),
                ],
            ),
        ],
    ),
    "phy9-inertia": TopicData(
        topic_id="phy9-inertia",
        topic="Inertia and Newton's First Law",
        script=(
            "An object keeps doing what it is doing unless a net external force "
            "acts on it. A book on a table stays at rest and a rolling ball keeps "
            "rolling unless friction or another force changes its motion."
        ),
        rubric=(  # flat string preserved for backward compat (video pipeline)
            "1. Objects resist change in motion (inertia). "
            "2. Net external force is needed to change velocity. "
            "3. Misconception: motion needs a continuous force to continue."
        ),
        grade="9",
        subject="physics",
        lang="en",
        rubric_levels=[
            RubricLevel(
                level=1,
                name="Recall",
                description="Student can state the law of inertia in their own words",
                mastery_threshold=1.0,
                points=[
                    RubricPoint(id=1, text="Objects resist change in motion (inertia)"),
                    RubricPoint(id=2, text="Net external force is needed to change velocity"),
                ],
            ),
            RubricLevel(
                level=2,
                name="Mechanism",
                description="Student explains WHY/HOW inertia works",
                mastery_threshold=1.0,
                points=[
                    RubricPoint(
                        id=3,
                        text=(
                            "Mass measures inertia — more mass means more resistance "
                            "to change in motion"
                        ),
                        misconception="Inertia depends on speed, not on mass",
                    ),
                ],
            ),
            RubricLevel(
                level=3,
                name="Misconception-Buster",
                description=(
                    "Student can identify and refute the classic misconception"
                ),
                mastery_threshold=1.0,
                points=[
                    RubricPoint(
                        id=4,
                        text=(
                            "Explains why moving objects keep moving WITHOUT a "
                            "continuous force — force is only needed to CHANGE motion"
                        ),
                        misconception="Motion needs a continuous force to continue",
                    ),
                ],
            ),
            RubricLevel(
                level=4,
                name="Application",
                description=(
                    "Student gives a correct real-world example of inertia in action"
                ),
                mastery_threshold=1.0,
                points=[
                    RubricPoint(
                        id=5,
                        text=(
                            "Correct real-world example (passengers lurch when a bus "
                            "brakes, dust off a carpet, ball keeps rolling) with the "
                            "object's inertia correctly identified"
                        ),
                    ),
                ],
            ),
        ],
    ),
    "math10-quadratic": TopicData(
        topic_id="math10-quadratic",
        topic="Quadratic Equations",
        script=(
            "A quadratic equation ax^2 + bx + c = 0 with a != 0 has at most two "
            "roots, given by x = (-b +- sqrt(b^2 - 4ac)) / 2a. The discriminant "
            "D = b^2 - 4ac tells whether roots are real, equal, or complex."
        ),
        rubric=(  # flat string preserved for backward compat (video pipeline)
            "1. Standard form with a != 0. "
            "2. Quadratic formula stated correctly. "
            "3. Discriminant meaning (D>0 two reals, D=0 equal, D<0 complex). "
            "4. Misconception: every quadratic has two distinct real roots."
        ),
        grade="10",
        subject="maths",
        lang="en",
        rubric_levels=[
            RubricLevel(
                level=1,
                name="Recall",
                description="Student can state the standard form and the formula",
                mastery_threshold=1.0,
                points=[
                    RubricPoint(id=1, text="Standard form ax^2 + bx + c = 0 with a != 0"),
                    RubricPoint(id=2, text="Quadratic formula stated correctly"),
                ],
            ),
            RubricLevel(
                level=2,
                name="Mechanism",
                description="Student explains WHY/HOW the discriminant decides the roots",
                mastery_threshold=1.0,
                points=[
                    RubricPoint(
                        id=3,
                        text=(
                            "D = b^2 - 4ac determines root type: D>0 two distinct reals, "
                            "D=0 one repeated real, D<0 complex roots"
                        ),
                        misconception="The discriminant is the value of x",
                    ),
                ],
            ),
            RubricLevel(
                level=3,
                name="Misconception-Buster",
                description=(
                    "Student can identify and refute the classic misconception"
                ),
                mastery_threshold=1.0,
                points=[
                    RubricPoint(
                        id=4,
                        text=(
                            "Explains why a quadratic has AT MOST two real roots and "
                            "why they can be equal or complex"
                        ),
                        misconception="Every quadratic has two distinct real roots",
                    ),
                ],
            ),
            RubricLevel(
                level=4,
                name="Application",
                description=(
                    "Student applies the discriminant/formula to a concrete example"
                ),
                mastery_threshold=1.0,
                points=[
                    RubricPoint(
                        id=5,
                        text=(
                            "Correctly works a concrete example (e.g. x^2 - 4x + 4 = 0 "
                            "has D=0 so one repeated root x=2) or a real-world setup "
                            "modelled by a quadratic"
                        ),
                    ),
                ],
            ),
        ],
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
