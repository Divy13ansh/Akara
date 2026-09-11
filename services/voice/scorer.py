"""Async end-of-session scorer (non-blocking, off hot path).

Heuristic v0: keyword-overlap per rubric point + evidence quotes.
e5 + Qwen-DPO entailment plug in later behind `score_transcript`.
See docs/scoring.md.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "packages"))

try:
    from akara_common.schemas import CoveragePoint, CoverageResult, TopicData, Transcript
except ImportError:
    from packages.akara_common.schemas import CoveragePoint, CoverageResult, TopicData, Transcript  # type: ignore

SCORER_MODEL = "heuristic-v0"

_STOP = {
    "the", "a", "an", "is", "are", "of", "and", "to", "in", "on", "it", "this",
    "that", "with", "for", "as", "by", "or", "be", "was", "were", "so", "if",
}


def _words(s: str) -> set[str]:
    toks = re.findall(r"[a-zA-Z]+", s.lower())
    return {t for t in toks if t not in _STOP and len(t) > 2}


def _split_rubric_points(rubric: str) -> list[tuple[int, str]]:
    # Rubrics arrive as one line: "1. ... 2. ... 3. ...". Split anywhere on "N. ".
    parts = re.split(r"\b(\d+)\.\s*", rubric)
    # -> ["", "1", "text1", "2", "text2", ...]
    points: list[tuple[int, str]] = []
    i = 1
    while i + 1 < len(parts):
        try:
            pid = int(parts[i])
        except ValueError:
            i += 1
            continue
        points.append((pid, parts[i + 1].strip()))
        i += 2
    if not points:  # fallback: whole rubric = 1 point
        points = [(1, rubric.strip())]
    return points


def score_transcript(
    transcript: Transcript,
    topic: TopicData,
    student_id: str = "",
) -> CoverageResult:
    student_text = " ".join(t.text for t in transcript.turns if t.role in ("student", "user"))
    student_words = _words(student_text)
    points: list[CoveragePoint] = []
    covered = 0
    # naive misconception cue: "cancel" without "different"
    mentions_cancel = "cancel" in student_words or "cancel" in student_text.lower()
    mentions_different = "different" in student_text.lower()
    for pid, ptext in _split_rubric_points(topic.rubric):
        pw = _words(ptext)
        overlap = len(pw & student_words) / max(len(pw), 1)
        # evidence: first student turn sharing a keyword, else ""
        evidence = ""
        for t in transcript.turns:
            if t.role in ("student", "user") and (_words(t.text) & pw):
                evidence = t.text[:280]
                break
        if overlap >= 0.30:
            status = "covered"
            covered += 1
        elif pid == 3 and mentions_cancel and not mentions_different:
            status = "misconceived"
        elif overlap == 0:
            status = "missed"
        else:
            status = "missed"
        points.append(CoveragePoint(id=pid, status=status, evidence=evidence))
    mastery = round(covered / max(len(points), 1), 3)
    return CoverageResult(
        topic_id=topic.topic_id,
        student_id=student_id or transcript.student_id,
        mastery=mastery,
        points=points,
        scorer_model=SCORER_MODEL,
    )
