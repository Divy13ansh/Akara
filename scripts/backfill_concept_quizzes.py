"""Manual batch backfill of concept_quizzes (D-7) — CLI wrapper.

NOTE: the PRIMARY path is on-demand generation (services/api/quiz_gen.py):
the moment a video render completes, or the first time /media is fetched
without quiz content, the arq worker generates it (one Azure call per
(concept, lang), deduped). Use this script only for bulk (re)generation:

    uv run python scripts/backfill_concept_quizzes.py [--concept sci10-balancing-equations] [--lang hi]
    uv run python scripts/backfill_concept_quizzes.py --all
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "packages"))
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env.local")

from akara_db.base import get_sessionmaker
from akara_db.models import Concept
from sqlalchemy import select


async def backfill(concept_id: str, lang: str) -> bool:
    from services.api.quiz_gen import ensure_quiz_row, generate_quiz_content

    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        concept = await session.get(Concept, concept_id)
        if concept is None:
            print(f"⚠ unknown concept {concept_id}")
            return False
        # Mark generating (dedup) then run the shared LLM generator.
        await ensure_quiz_row(session, concept_id, lang)
    status = await generate_quiz_content(concept_id, lang)
    print(f"{'✓' if status == 'ready' else '·'} {concept_id} [{lang}] → {status}")
    return status == "ready"


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--concept")
    parser.add_argument("--lang", default="hi")
    parser.add_argument("--all", action="store_true", help="backfill every MVP concept with a gold script")
    args = parser.parse_args()

    targets: list[tuple[str, str]] = []
    if args.concept:
        targets.append((args.concept, args.lang))
    elif args.all:
        sessionmaker = get_sessionmaker()
        async with sessionmaker() as session:
            rows = (
                await session.execute(select(Concept.id).where(Concept.script.is_not(None)))
            ).scalars().all()
        for cid in rows:
            targets.append((cid, "en"))
            targets.append((cid, "hi"))
    else:
        print("nothing to do: pass --concept or --all")
        return

    ok = 0
    for cid, lang in targets:
        for attempt in range(3):
            try:
                if await backfill(cid, lang):
                    ok += 1
                break
            except Exception as e:
                print(f"  attempt {attempt + 1}/3 failed for {cid}[{lang}]: {e}")
                await asyncio.sleep(2**attempt)
    print(f"done: {ok}/{len(targets)} backfilled")


if __name__ == "__main__":
    asyncio.run(main())
