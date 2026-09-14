"""LLM backfill of concept_quizzes (D-7): per (concept, lang), generate quiz,
scene graph, summary, mentor prompt from concepts.script. Idempotent upsert.

    uv run python scripts/backfill_concept_quizzes.py [--concept sci10-balancing-equations] [--lang hi]
    # batch the whole catalog:
    uv run python scripts/backfill_concept_quizzes.py --all
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "packages"))
sys.path.insert(0, str(ROOT / "services"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env.local")

from akara_db.base import get_sessionmaker
from akara_db.models import Concept, ConceptQuiz
from sqlalchemy import select

LANG_NAMES = {
    "hi": "Hindi (Devanagari)", "en": "English", "mr": "Marathi", "bn": "Bengali",
    "te": "Telugu", "ta": "Tamil", "gu": "Gujarati", "kn": "Kannada",
    "ml": "Malayalam", "pa": "Punjabi", "ur": "Urdu", "or": "Odia",
}

SYSTEM_PROMPT = """You are an NCERT content generator for an Indian education app.
Given a concept's gold script, produce STRICT JSON (no markdown fences) with keys:
- quiz: array of 8-10 items {id: "q-01", question, options: [4 strings], correct_index: 0-3, explanation}
- scene_graph: {nodes: [{id, label, type: prerequisite|core|application|extension, description}],
                edges: [{from, to, label}]}
- summary: {summary_bullets: [4-6 strings], key_definitions: [{term, definition}], ncert_summary: string}
- mentor_prompt: {scenario: "mastery_confirmation", question_text: string,
                  key_principles_to_cover: [3 strings], sample_ideal_response: string}
Write ALL user-visible text in the requested language. Ground everything in the
script; do not invent facts outside it."""


def _build_user_prompt(concept: Concept, lang: str) -> str:
    return (
        f"Concept: {concept.name}\n"
        f"Class: {concept.class_} | Subject: {concept.subject_id} | "
        f"Chapter: {concept.topic_name}\n"
        f"Output language: {LANG_NAMES.get(lang, lang)}\n\n"
        f"GOLD SCRIPT:\n{concept.script or '(no script — use NCERT knowledge for this topic)'}"
    )


async def backfill(concept_id: str, lang: str) -> bool:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        concept = await session.get(Concept, concept_id)
        if concept is None:
            print(f"⚠ unknown concept {concept_id}")
            return False

        from openai import AzureOpenAI

        client = AzureOpenAI(
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_key=os.environ["AZURE_API_KEY"],
            api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-06-01"),
        )
        deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-5.4-mini")

        def _call() -> dict:
            resp = client.chat.completions.create(
                model=deployment,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": _build_user_prompt(concept, lang)},
                ],
                temperature=0.3,
                max_completion_tokens=4000,
                response_format={"type": "json_object"},
            )
            return json.loads(resp.choices[0].message.content)

        data = await asyncio.to_thread(_call)

        row = (
            await session.execute(
                select(ConceptQuiz).where(
                    ConceptQuiz.concept_id == concept_id, ConceptQuiz.lang == lang
                )
            )
        ).scalar_one_or_none()
        if row is None:
            row = ConceptQuiz(concept_id=concept_id, lang=lang)
            session.add(row)
        row.quiz = data.get("quiz")
        row.scene_graph = data.get("scene_graph")
        row.summary = data.get("summary")
        row.mentor_prompt = data.get("mentor_prompt")
        await session.commit()
        print(f"✓ {concept_id} [{lang}] quiz={len(data.get('quiz') or [])}")
        return True


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
                await session.execute(
                    select(Concept.id).where(Concept.script.is_not(None))
                )
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
                await asyncio.sleep(2 ** attempt)
    print(f"done: {ok}/{len(targets)} backfilled")


if __name__ == "__main__":
    asyncio.run(main())
