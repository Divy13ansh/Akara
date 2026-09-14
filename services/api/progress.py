"""Mastery/progress store: JSONL file today, DB later."""

from __future__ import annotations

import json
from pathlib import Path

SCORES_FILE = Path("data/scores.jsonl")


def save_coverage(result: dict) -> Path:
    SCORES_FILE.parent.mkdir(parents=True, exist_ok=True)
    with SCORES_FILE.open("a") as f:
        f.write(json.dumps(result, ensure_ascii=False) + "\n")
    return SCORES_FILE


def get_progress(student_id: str) -> list[dict]:
    if not SCORES_FILE.exists():
        return []
    out = []
    for line in SCORES_FILE.read_text(encoding="utf-8").splitlines():
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if row.get("student_id") == student_id:
            out.append(row)
    return out
