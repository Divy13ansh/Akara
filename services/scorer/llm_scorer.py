"""LLM-based scorer using Azure OpenAI GPT-5.4-mini.

Called by the webhook handler AFTER a Feynman session ends.
Input: full transcript + topic rubric.
Output: CoverageResult with per-point verdicts + evidence.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env.local")
load_dotenv(Path(__file__).parent / ".env.local")

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "packages"))

from openai import AzureOpenAI

try:
    from akara_common.schemas import (
        CoveragePoint,
        CoverageResult,
        TopicData,
        Transcript,
    )
except ImportError:
    from packages.akara_common.schemas import (  # type: ignore
        CoveragePoint,
        CoverageResult,
        TopicData,
        Transcript,
    )

from .prompts import SCORER_SYSTEM_PROMPT, build_scorer_user_prompt

logger = logging.getLogger("akara-scorer")

SCORER_MODEL = "azure-gpt-5.4-mini"


def _get_azure_client() -> AzureOpenAI:
    return AzureOpenAI(
        azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        api_key=os.environ["AZURE_API_KEY"],
        api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-06-01"),
    )


def _format_rubric_for_scorer(topic: TopicData) -> str:
    """Format rubric (leveled or flat) for the scorer prompt."""
    if topic.rubric_levels:
        lines = []
        for level in topic.rubric_levels:
            lines.append(f"Level {level.level} ({level.name}): {level.description}")
            for pt in level.points:
                line = f"  Point {pt.id}: {pt.text}"
                if pt.misconception:
                    line += f" [MISCONCEPTION: {pt.misconception}]"
                lines.append(line)
        return "\n".join(lines)
    return topic.rubric


def score_transcript_llm(
    transcript: Transcript,
    topic: TopicData,
) -> CoverageResult:
    """Score a transcript using Azure OpenAI GPT-5.4-mini.

    Falls back to heuristic scorer if Azure call fails.
    """
    client = _get_azure_client()
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-5.4-mini")

    rubric_text = _format_rubric_for_scorer(topic)
    turns_dicts = [{"role": t.role, "text": t.text} for t in transcript.turns]
    user_prompt = build_scorer_user_prompt(
        topic_title=topic.topic,
        script=topic.script,
        rubric_text=rubric_text,
        transcript_turns=turns_dicts,
    )

    try:
        response = client.chat.completions.create(
            model=deployment,
            messages=[
                {"role": "system", "content": SCORER_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,  # near-deterministic for scoring
            # NOTE: newer Azure model families (gpt-5.x) reject `max_tokens`.
            max_completion_tokens=2000,
            response_format={"type": "json_object"},
        )

        result_text = response.choices[0].message.content
        result = json.loads(result_text)

        # Parse into CoverageResult
        points = []
        for p in result.get("points", []):
            points.append(CoveragePoint(
                id=p["id"],
                status=p["status"],  # "covered" | "missed" | "misconceived"
                evidence=p.get("evidence", ""),
            ))

        mastery = result.get("overall_mastery", 0.0)
        highest_level = result.get("highest_level_cleared", 0)

        logger.info(
            "LLM scorer: mastery=%.2f, highest_level=%d, points=%d",
            mastery, highest_level, len(points),
        )

        return CoverageResult(
            topic_id=topic.topic_id,
            student_id=transcript.student_id,
            mastery=mastery,
            points=points,
            scorer_model=SCORER_MODEL,
        )

    except Exception as e:
        logger.error("LLM scorer failed, falling back to heuristic: %s", e)
        # Fallback to heuristic scorer
        try:
            from services.voice.scorer import score_transcript as heuristic_score
        except ImportError:
            from voice.scorer import score_transcript as heuristic_score
        return heuristic_score(transcript, topic, transcript.student_id)
