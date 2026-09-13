"""FastAPI token server.

GET /token?student_id=...&topic_id=...&lang=... -> {token, room, topic}
Does pre-session lookup via akara_rag, then mints a LiveKit token with
SessionMetadata (TopicData + student_id + room_name) as job metadata.
Also mounts POST /webhooks/transcript for the voice agent shutdown hook.
See docs/auth-traces-cost.md.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "packages"))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "services"))

try:
    from akara_common.schemas import SessionMetadata, TopicData
    from akara_rag.retrieve import fetch_topic, list_topics
except ImportError:
    from packages.akara_common.schemas import (  # type: ignore
        SessionMetadata,
        TopicData,
    )
    from packages.akara_rag.retrieve import fetch_topic, list_topics  # type: ignore

try:
    from api.webhooks import handle_transcript
except ImportError:
    from services.api.webhooks import handle_transcript  # type: ignore

logger = logging.getLogger("akara-api")

app = FastAPI(title="akara-api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _mint_livekit_token(room: str, identity: str, metadata: str) -> str:
    """Mint a real LiveKit token if env + livekit-api present, else dev stub."""
    url = os.getenv("LIVEKIT_URL", "")
    key = os.getenv("LIVEKIT_API_KEY", "")
    secret = os.getenv("LIVEKIT_API_SECRET", "")
    if url and key and secret:
        try:
            from livekit import api as lk_api  # type: ignore
        except ImportError as e:
            raise HTTPException(500, f"livekit-api not installed: {e}")
        token = (
            lk_api.AccessToken(key, secret)
            .with_identity(identity)
            .with_grants(lk_api.VideoGrants(room_join=True, room=room))
            .with_room_config(
                lk_api.RoomConfiguration(agents=[lk_api.RoomAgentDispatch(
                    agent_name="akara-voice", metadata=metadata)])
            )
            .to_jwt()
        )
        return token
    # Dev fallback: unsigned stub so frontend/voice-console flows keep working.
    payload = {"room": room, "identity": identity, "metadata": json.loads(metadata)}
    return "dev." + json.dumps(payload)[:2000]


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/topics")
def topics() -> dict:
    return {"topics": [
        {"topic_id": t.topic_id, "topic": t.topic,
         "grade": t.grade, "subject": t.subject}
        for t in list_topics()
    ]}


@app.get("/token")
def token(
    student_id: str = Query(..., min_length=1),
    topic_id: str = Query(..., min_length=1),
    lang: str = Query("en"),
) -> dict:
    topic: TopicData | None = fetch_topic(topic_id, lang=lang)
    if topic is None:
        raise HTTPException(404, f"unknown topic_id: {topic_id}")
    room = f"{topic_id}-{student_id}-{int(time.time())}"
    session_meta = SessionMetadata(topic=topic, student_id=student_id, room_name=room)
    metadata_json = session_meta.to_json()
    jwt = _mint_livekit_token(room, student_id, metadata_json)
    return {
        "token": jwt,
        "room": room,
        "url": os.getenv("LIVEKIT_URL", ""),
        "topic": json.loads(topic.to_metadata_json()),
    }


@app.post("/webhooks/transcript")
async def webhook_transcript(request: Request):
    """Receive transcript from voice agent, score it, store progress."""
    payload = await request.json()
    try:
        result = handle_transcript(payload)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error("Webhook processing failed: %s", e)
        raise HTTPException(500, "Scorer failed")
