"""On-demand quiz / scene-graph / summary / mentor-prompt generation (D-7).

Strategy (token-saving): NOTHING is pre-generated. The moment a video render
completes (render-callback) — or the first time a student opens the media
bundle without quiz content (get_media fallback) — exactly ONE Azure OpenAI
call runs per (concept, lang), deduped by the arq job id. The result is stored
in concept_quizzes, so every later student pays zero tokens.

The row acts as the dedup marker: it is created with generation_status
'generating' BEFORE the LLM call, so concurrent triggers (callback + media
fetch) collapse into one job.
"""

from __future__ import annotations

import json
import logging
import os

from akara_db.models import Concept, ConceptQuiz
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("akara-quiz")

LANG_NAMES = {
    "hi": "Hindi (Devanagari)", "en": "English", "mr": "Marathi", "bn": "Bengali",
    "te": "Telugu", "ta": "Tamil", "gu": "Gujarati", "kn": "Kannada",
    "ml": "Malayalam", "pa": "Punjabi", "ur": "Urdu", "or": "Odia",
}

SYSTEM_PROMPT = """You are an NCERT content generator for an Indian education app.
Given a concept's gold script, produce STRICT JSON (no markdown fences) with keys:
- topic_name: the concept title translated into the requested language
  (e.g. "Euclid's Division Lemma" -> Hindi "यूक्लिड की विभाजन प्रमेयिका")
- quiz: array of 8-10 items {id: "q-01", question, options: [4 strings], correct_index: 0-3, explanation}
- scene_graph: {nodes: [{id, label, type: prerequisite|core|application|extension, description}],
                edges: [{from, to, label}]}
- summary: {summary_bullets: [4-6 strings], key_definitions: [{term, definition}],
            ncert_summary: string,
            flashcards: [8-10 items {front: term/question, back: crisp definition/answer}]}
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


async def localize_topic_name(
    session,
    quiz_row: ConceptQuiz,
    concept: Concept,
    lang: str,
) -> str:
    """Return the concept title in `lang`, persisting it into the quiz row's
    summary on first use. Rows generated before `topic_name` existed in the
    contract get exactly ONE tiny translation call ever — afterwards it is
    cached in the JSONB summary like everything else."""
    summary = quiz_row.summary or {}
    cached = summary.get("topic_name")
    if cached:
        return cached
    english = concept.topic_name or concept.name
    if lang == "en":
        return english
    try:
        from openai import AzureOpenAI

        client = AzureOpenAI(
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_key=os.environ["AZURE_API_KEY"],
            api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-06-01"),
        )
        deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-5.4-mini")

        def _call() -> str:
            resp = client.chat.completions.create(
                model=deployment,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Translate the NCERT topic title into the requested "
                            "language (native script). Return ONLY the translation, "
                            "no quotes, no explanation."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Title: {english}\n"
                            f"Language: {LANG_NAMES.get(lang, lang)}"
                        ),
                    },
                ],
                temperature=0.0,
                max_completion_tokens=60,
            )
            return (resp.choices[0].message.content or "").strip().strip('"')

        import asyncio

        translated = await asyncio.to_thread(_call)
        if translated:
            quiz_row.summary = {**summary, "topic_name": translated}
            await session.commit()
            logger.info("topic_name localized: %s [%s]", concept.id, lang)
            return translated
    except Exception as e:  # noqa: BLE001 — fall back to English, never 500 media
        logger.warning("topic_name translation failed for %s [%s]: %s", concept.id, lang, e)
    return english


async def ensure_quiz_row(session: AsyncSession, concept_id: str, lang: str) -> tuple[ConceptQuiz, bool]:
    """Return (row, created). Marks the row 'generating' so concurrent
    triggers see in-flight state instead of re-enqueueing forever."""
    row = (
        await session.execute(
            select(ConceptQuiz).where(
                ConceptQuiz.concept_id == concept_id, ConceptQuiz.lang == lang
            )
        )
    ).scalar_one_or_none()
    if row is not None:
        return row, False
    row = ConceptQuiz(concept_id=concept_id, lang=lang, generation_status="generating")
    session.add(row)
    await session.commit()
    return row, True


async def generate_quiz_content(concept_id: str, lang: str) -> str:
    """The actual Azure call. Runs in the arq worker. Returns final status:
    ready | skipped | failed. Idempotent: skips if quiz content already
    exists (row created by the trigger, content filled by a previous run).

    Never leaves the row stuck at 'generating': ANY unexpected error marks it
    'failed' so the get_media fallback can recover with a fresh job id."""
    from akara_db.base import get_sessionmaker

    try:
        sessionmaker = get_sessionmaker()
    except Exception as e:  # noqa: BLE001 — must not strand the row
        logger.error("quiz gen: no DB session for %s [%s]: %s", concept_id, lang, e)
        return "failed"
    try:
        async with sessionmaker() as session:
            row = (
                await session.execute(
                    select(ConceptQuiz).where(
                        ConceptQuiz.concept_id == concept_id, ConceptQuiz.lang == lang
                    )
                )
            ).scalar_one_or_none()
            if row is not None and row.quiz:
                return "skipped"
            concept = await session.get(Concept, concept_id)
            if concept is None:
                logger.error("quiz gen: unknown concept %s", concept_id)
                return "failed"

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

            import asyncio

            last_err: Exception | None = None
            for attempt in range(3):
                try:
                    data = await asyncio.to_thread(_call)
                    if row is None:
                        row = ConceptQuiz(concept_id=concept_id, lang=lang)
                        session.add(row)
                    row.quiz = data.get("quiz")
                    row.scene_graph = data.get("scene_graph")
                    summary = data.get("summary") or {}
                    if data.get("topic_name"):
                        summary["topic_name"] = data["topic_name"]
                    row.summary = summary
                    row.mentor_prompt = data.get("mentor_prompt")
                    row.generation_status = "ready"
                    await session.commit()
                    logger.info("quiz ready: %s [%s]", concept_id, lang)
                    return "ready"
                except Exception as e:  # noqa: BLE001 — retry LLM/parse failures
                    last_err = e
                    await asyncio.sleep(2**attempt)
            if row is not None:
                row.generation_status = "failed"
                await session.commit()
            logger.error("quiz gen failed for %s [%s]: %s", concept_id, lang, last_err)
            return "failed"
    except Exception as e:  # noqa: BLE001 — never strand the row at 'generating'
        logger.error("quiz gen crashed for %s [%s]: %s", concept_id, lang, e)
        try:
            async with sessionmaker() as session:
                row = (
                    await session.execute(
                        select(ConceptQuiz).where(
                            ConceptQuiz.concept_id == concept_id, ConceptQuiz.lang == lang
                        )
                    )
                ).scalar_one_or_none()
                if row is not None and not row.quiz:
                    row.generation_status = "failed"
                    await session.commit()
        except Exception:  # noqa: BLE001, S110 — best effort marker
            pass
        return "failed"
