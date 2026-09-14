"""Boot-time seed for containers: runs only when the catalog is empty, so
`docker compose up` is safe on every boot (plan §3c). Exits 0 quickly otherwise.

    python scripts/seed_if_empty.py
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
from akara_db.models import Concept, Subject
from sqlalchemy import func, select


async def main() -> None:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        try:
            subjects = (await session.execute(select(func.count(Subject.id)))).scalar() or 0
            concepts = (await session.execute(select(func.count(Concept.id)))).scalar() or 0
        except Exception:
            # Tables don't exist yet — migrations should have run first; fail loud.
            raise

    if subjects > 0 and concepts > 0:
        print(f"catalog present ({subjects} subjects, {concepts} concepts) — seed skipped")
        return

    print("empty catalog — seeding…")
    from scripts.seed_curriculum import seed as seed_curriculum

    await seed_curriculum()

    from scripts.seed_gold_topics import seed as seed_gold

    await seed_gold()


if __name__ == "__main__":
    asyncio.run(main())
