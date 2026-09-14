"""Seed gold scripts + leveled rubrics for the 3 MVP concepts (D-3, D-13).

Syncs akara_rag SEED_TOPICS into concepts.script/rubric/rubric_levels and
flattens rubric_levels into rubric_points rows. Idempotent.

    uv run python scripts/seed_gold_topics.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "packages"))
sys.path.insert(0, str(ROOT / "services"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env.local")


from akara_db.base import get_sessionmaker
from akara_db.models import Concept, RubricPoint
from akara_rag.retrieve import SEED_TOPICS


async def seed() -> None:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        for topic_id, topic in SEED_TOPICS.items():
            concept = await session.get(Concept, topic_id)
            if concept is None:
                print(f"⚠ {topic_id} not in concepts (run seed_curriculum first) — skipped")
                continue

            concept.script = topic.script
            concept.rubric = topic.rubric
            concept.rubric_levels = [
                {
                    "level": lvl.level,
                    "name": lvl.name,
                    "description": lvl.description,
                    "mastery_threshold": lvl.mastery_threshold,
                    "points": [
                        {"id": p.id, "text": p.text, "misconception": p.misconception}
                        for p in lvl.points
                    ],
                }
                for lvl in (topic.rubric_levels or [])
            ]

            # Flatten into rubric_points (composite PK: id, concept_id).
            if topic.rubric_levels:
                for lvl in topic.rubric_levels:
                    for p in lvl.points:
                        existing = await session.get(RubricPoint, (p.id, concept.id))
                        if existing is None:
                            session.add(RubricPoint(
                                id=p.id, concept_id=concept.id, level=lvl.level,
                                level_name=lvl.name, text=p.text,
                                misconception=p.misconception or None,
                                mastery_threshold=lvl.mastery_threshold,
                            ))
                        else:
                            existing.text, existing.misconception = p.text, (p.misconception or None)
                            existing.level, existing.level_name = lvl.level, lvl.name
            else:
                import re

                parts = re.split(r"\b(\d+)\.\s*", topic.rubric)
                i = 1
                pid = 1
                while i + 1 < len(parts):
                    try:
                        int(parts[i])
                    except ValueError:
                        i += 1
                        continue
                    text = parts[i + 1].strip()
                    existing = await session.get(RubricPoint, (pid, concept.id))
                    if existing is None:
                        session.add(RubricPoint(id=pid, concept_id=concept.id, text=text))
                    pid += 1
                    i += 2

        await session.commit()
    print("gold topics seeded (scripts, rubrics, rubric_points)")


if __name__ == "__main__":
    asyncio.run(seed())
