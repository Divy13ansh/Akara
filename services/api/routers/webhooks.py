"""Webhook endpoints (plan Phase 4, D-15): persist immutable evidence, enqueue
scoring — never run the LLM inline. Idempotent against the voice agent's 3×
retry (sessions.id = room_name UNIQUE + scored_at marker)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from akara_db.models import Concept, ProviderCost, Session, Transcript, TranscriptTurn
from fastapi import APIRouter, Depends, HTTPException

from services.api.deps import DbSession, require_webhook_secret
from services.api.security import decode_access_token

logger = logging.getLogger("akara-webhooks")

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _estimate_voice_cost(metrics: dict) -> float:
    """Pricing fn per docs/auth-traces-cost.md (hosted phase). Update freely —
    the log shape is the contract."""
    stt_s = metrics.get("stt_s", 0)
    tts_chars = metrics.get("tts_chars", 0)
    llm_in = metrics.get("llm_tok_in", 0)
    llm_out = metrics.get("llm_tok_out", 0)
    livekit_min = metrics.get("livekit_min", 0)
    return round(
        livekit_min * 0.0005
        + (stt_s / 60) * 0.01
        + tts_chars * 0.000018
        + (llm_in / 1e6) * 0.15
        + (llm_out / 1e6) * 0.60,
        4,
    )


@router.post("/transcript", dependencies=[Depends(require_webhook_secret)])
async def transcript_webhook(payload: dict, session: DbSession):
    transcript = payload.get("transcript") or {}
    room_name = transcript.get("room_name")
    if not room_name:
        raise HTTPException(400, "room_name required")
    student_id = transcript.get("student_id")
    topic_id = transcript.get("topic_id")
    dur_s = float(payload.get("dur_s") or 0.0)

    # Resolve the real user id: the voice flow may pass a JWT or a user id.
    if student_id and student_id.startswith("eyJ"):
        student_id = decode_access_token(student_id) or student_id
    if not student_id:
        raise HTTPException(400, "student_id required")

    concept = await session.get(Concept, topic_id) if topic_id else None

    # Idempotency: same room delivered twice (3× retry) → score once.
    existing = await session.get(Session, room_name)
    if existing is not None:
        if existing.scored_at is not None or (
            existing.created_at is not None
        ):
            # Already persisted; scoring job dedupes by job id too.
            return {"accepted": True, "duplicate": True, "session_id": room_name}

    now = datetime.now(UTC)
    sess = Session(
        id=room_name,
        session_type="voice",
        student_id=student_id,
        concept_id=concept.id if concept else None,
        lang=transcript.get("lang"),
        dur_s=dur_s,
        started_at=now,
        ended_at=now,
    )
    session.add(sess)
    await session.flush()

    transcript_row = Transcript(session_id=room_name, raw_json=payload)
    session.add(transcript_row)
    await session.flush()  # assign transcript_row.id for the turn FKs

    turns = transcript.get("turns") or []
    for idx, t in enumerate(turns):
        role = t.get("role", "student")
        if role in ("assistant", "agent"):
            role = "tutor"
        elif role in ("user", "human"):
            role = "student"
        if role not in ("tutor", "student") or not (t.get("text") or "").strip():
            continue
        session.add(
            TranscriptTurn(
                transcript_id=transcript_row.id,
                turn_index=idx,
                role=role,
                text=t["text"],
                ts=float(t.get("ts", 0.0)),
                stt_lang=t.get("stt_lang"),
                conf=t.get("conf"),
                stt_lat_ms=t.get("stt_lat_ms"),
                llm_ttft_ms=t.get("llm_ttft_ms"),
                tts_ttfb_ms=t.get("tts_ttfb_ms"),
            )
        )

    metrics = payload.get("metrics") or {}
    metrics.setdefault("livekit_min", round(dur_s / 60, 2))
    session.add(
        ProviderCost(
            job_type="voice_session",
            session_id=room_name,
            metrics=metrics,
            est_usd=_estimate_voice_cost(metrics),
        )
    )

    await session.commit()

    # Enqueue scoring (job id = session id → retries no-op on duplicates).
    from services.api.queue import enqueue_scoring

    await enqueue_scoring(room_name)
    logger.info("transcript accepted for scoring: %s (%d turns)", room_name, len(turns))
    return {"accepted": True, "session_id": room_name, "turns": len(turns)}
