"""Post-call webhook: transcript intake -> scorer -> progress + cost log.

POST /webhooks/transcript {transcript: Transcript dict, topic: TopicData dict}
-> {coverage, cost_line}
"""

from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "packages"))
sys.path.insert(0, str(ROOT / "services"))

try:
    from akara_common.schemas import TopicData, Transcript, TranscriptTurn
    from akara_rag.retrieve import fetch_topic
    from api.progress import save_coverage
except ImportError:
    from packages.akara_common.schemas import TopicData, Transcript, TranscriptTurn  # type: ignore
    from packages.akara_rag.retrieve import fetch_topic  # type: ignore
    from services.api.progress import save_coverage  # type: ignore

logger = logging.getLogger("akara-webhooks")

COST_FILE = Path("data/cost.jsonl")


def _log_cost(room: str, dur_s: float) -> dict:
    # Hosted pricing filled from env/billing later; log shape is the contract.
    line = {"room": room, "dur_s": dur_s, "ts": int(time.time()),
            "note": "est_usd pending provider usage wiring"}
    COST_FILE.parent.mkdir(parents=True, exist_ok=True)
    with COST_FILE.open("a") as f:
        f.write(json.dumps(line) + "\n")
    return line


def handle_transcript(payload: dict) -> dict:
    t = payload.get("transcript", {})
    turns = [TranscriptTurn(role=x.get("role", "student"),
                            text=x.get("text", ""),
                            ts=x.get("ts", 0.0),
                            stt_lang=x.get("stt_lang", ""),
                            conf=x.get("conf", 0.0))
             for x in t.get("turns", [])]
    transcript = Transcript(room_name=t.get("room_name", "unknown"),
                            topic_id=t.get("topic_id", ""),
                            student_id=t.get("student_id", "unknown"),
                            lang=t.get("lang", "en"), turns=turns)
    topic_dict = payload.get("topic") or {}
    topic = TopicData.from_metadata_json(json.dumps(topic_dict))
    if topic is None:
        topic = fetch_topic(transcript.topic_id, lang=transcript.lang)
    if topic is None:
        raise ValueError(f"unknown topic: {transcript.topic_id}")
    # Try LLM scorer first, fall back to heuristic
    try:
        from scorer.llm_scorer import score_transcript_llm
        result = score_transcript_llm(transcript, topic)
        logger.info("Used LLM scorer (azure-gpt-5.4-mini)")
    except Exception as e:
        logger.warning("LLM scorer unavailable (%s), using heuristic", e)
        from voice.scorer import score_transcript
        result = score_transcript(transcript, topic, transcript.student_id)

    save_coverage(result.to_dict())
    cost = _log_cost(transcript.room_name, dur_s=float(payload.get("dur_s", 0)))
    return {"coverage": result.to_dict(), "cost": cost}
