"""Akara voice worker: LiveKit AgentSession (VAD/STT/LLM/TTS).

Entry point for the Feynman voice loop. Topic + session identity are injected
via LiveKit job metadata as SessionMetadata JSON
{topic: {topic_id, topic, script, rubric, ...}, student_id, room_name}.
See docs/voice-loop.md for the full contract.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time as _time
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "packages"))

from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    TurnHandlingOptions,
    cli,
    inference,
    room_io,
)
from livekit.agents.beta.tools import EndCallTool
from livekit.plugins import ai_coustics
from vexyl_stt_plugin import VexylSTT

try:
    from akara_common.schemas import SessionMetadata, TopicData, Transcript, TranscriptTurn
except ImportError:
    from packages.akara_common.schemas import (  # type: ignore
        SessionMetadata,
        TopicData,
        Transcript,
        TranscriptTurn,
    )

logger = logging.getLogger("akara-voice")
load_dotenv(".env.local")

API_BASE = os.getenv("AKARA_API_URL", "http://localhost:8000")

# ---------------------------------------------------------------------------
# Model constructors — isolated so the open-weight swap (docs/open-weights.md)
# touches only these three functions.
# ---------------------------------------------------------------------------

DEFAULT_TTS_VOICE = "79a125e8-cd45-4c13-8a67-188112f4dd22"  # Cartesia multilingual


def build_stt(lang: str = "hi-IN"):
    # SWAPPED: Deepgram Nova-3 (cloud) → VEXYL-STT (self-hosted, open-weight).
    # Old: return inference.STT(model="deepgram/nova-3", language="multi")
    # VEXYL-STT runs AI4Bharat IndicConformer locally via WebSocket.
    # Requires: VEXYL-STT server running (cd ../vexyl-stt && ./run.sh)
    return VexylSTT(language=lang)


def build_llm():
    return inference.LLM(model="google/gemma-4-31b-it")


def build_tts(lang: str = "hi"):
    # FIX vs early test: lang is per-session (picker + metadata), not hardcoded.
    # Cartesia expects a BCP-47-ish code; default to "hi" for back-compat.
    return inference.TTS(
        model="cartesia/sonic-3",
        voice=DEFAULT_TTS_VOICE,
        language=lang or "hi",
    )


INSTRUCTIONS_TEMPLATE_V2 = """You are Akara, a Socratic tutor for Indian secondary-school students (Grades
6-12, NCERT curriculum). The student just watched a short video explaining
one concept. Your job is to find out whether they actually understood it
using the Feynman technique: they explain it back, you probe the gaps.

## Session context
TOPIC: {topic}
GROUND-TRUTH SCRIPT: {script}

## Rubric — MASTERY LEVELS (progress through these IN ORDER)
{leveled_rubric}

## Your core loop, every turn
1. Listen to what the student just said.
2. Silently determine which LEVEL they are currently at based on what
   they have demonstrated so far across ALL their turns (not just the last one).
3. If they have NOT yet cleared the current level: ask exactly ONE short,
   targeted question that would force them to demonstrate the specific
   point(s) they are missing at THAT level. Do not skip ahead.
4. If they HAVE cleared the current level: briefly acknowledge ("Nice, you've
   got that part"), then advance to the next level with ONE question targeting
   the first uncovered point at the new level.
5. If they clear ALL levels (including L4): warmly tell them they have
   mastered this concept. Say something like "You've nailed it! You clearly
   understand {topic}." Then use the EndCallTool to end the session.

## Mastery gate rules
- You MUST NOT ask questions from Level N+1 until ALL points in Level N
  are evidenced in the student's speech.
- A point is "evidenced" when the student says something that demonstrates
  understanding of that point — paraphrasing counts, exact wording not needed.
- If a student shows a MISCONCEPTION listed in the rubric, you must address
  it at that level before advancing. Ask a question that forces them to
  confront the specific misconception. Do not tell them the answer.

## Never do this
- Never state the correct answer, even partially, even as part of a "hint."
- Never ask more than one question in a turn.
- Never use bullet points, numbered lists, or markdown — this is spoken audio.
- Never break character to mention you're an AI, a rubric, or levels.
- Never let the conversation drift into unrelated topics.

## Tone and delivery
- Warm, patient, curious — like a good TA, not an exam.
- Age-appropriate for a {grade_range} year old.
- Keep every turn to 1-3 short sentences.
- Match the student's language — if they speak Hindi or code-switch
  (Hinglish), respond naturally in kind.
"""


def _format_leveled_rubric(topic: TopicData) -> str:
    """Format rubric levels for prompt injection."""
    if not topic.rubric_levels:
        # Fallback: use flat rubric
        return f"FLAT RUBRIC: {topic.rubric}"

    lines = []
    for level in topic.rubric_levels:
        lines.append(f"### Level {level.level}: {level.name}")
        lines.append(f"Description: {level.description}")
        lines.append(f"Mastery threshold: {level.mastery_threshold:.0%} of points must be covered")
        for point in level.points:
            line = f"  - Point {point.id}: {point.text}"
            if point.misconception:
                line += f"\n    MISCONCEPTION to watch for: {point.misconception}"
            lines.append(line)
        lines.append("")
    return "\n".join(lines)


def _grade_to_age_range(grade: str) -> str:
    """Convert grade string to approximate age range."""
    try:
        g = int(grade)
        return f"{g + 5}-{g + 6}"
    except (ValueError, TypeError):
        return "14-18"


# Fallback for local `lk agent console` (no job metadata) or bad metadata.
DEFAULT_TOPIC_DATA = TopicData(
    topic_id="phy11-newton3",
    topic="Newton's Third Law of Motion",
    script=(
        "Every action has an equal and opposite reaction. When object A "
        "exerts a force on object B, object B simultaneously exerts a force "
        "of equal magnitude and opposite direction on object A. These two "
        "forces act on DIFFERENT objects, which is why they don't cancel "
        "out, even though they are equal and opposite."
    ),
    rubric=(
        "1. Forces come in pairs (action-reaction). "
        "2. Equal in magnitude, opposite in direction. "
        "3. The two forces act on two DIFFERENT objects (the classic "
        "misconception is thinking they act on the same object and should "
        "cancel). "
        "4. Bonus: a correct real-world example (walking, rocket "
        "propulsion, gun recoil) with both objects correctly identified."
    ),
    grade="9",
    subject="physics",
    lang="hi",
)


class DefaultAgent(Agent):
    def __init__(self, topic_data: TopicData) -> None:
        instructions = INSTRUCTIONS_TEMPLATE_V2.format(
            topic=topic_data.topic,
            script=topic_data.script,
            leveled_rubric=_format_leveled_rubric(topic_data),
            grade_range=_grade_to_age_range(topic_data.grade),
        )
        super().__init__(
            instructions=instructions,
            tools=[
                EndCallTool(
                    extra_description="",
                    end_instructions=(
                        "Only end the call when the student has cleared ALL "
                        "mastery levels (L1-L4) or explicitly says they want "
                        "to stop. Before ending, tell them what they mastered."
                    ),
                    delete_room=False,
                ),
            ],
        )
        self._topic_data = topic_data

    async def on_enter(self):
        await self.session.generate_reply(
            instructions=(
                "Greet the student briefly and ask them to explain what "
                f"they understood about {self._topic_data.topic} from the video they "
                "just watched."
            ),
            allow_interruptions=True,
        )


server = AgentServer()


def resolve_session_metadata(raw_metadata: str | None) -> tuple[TopicData, str, str]:
    """Returns (topic_data, student_id, room_name). Falls back gracefully."""
    if not raw_metadata:
        logger.warning("empty job metadata, using default topic")
        return DEFAULT_TOPIC_DATA, "unknown", "local"

    # Try new SessionMetadata shape first
    session_meta = SessionMetadata.from_json(raw_metadata)
    if session_meta is not None:
        return session_meta.topic, session_meta.student_id, session_meta.room_name

    # Legacy fallback: bare TopicData
    topic = TopicData.from_metadata_json(raw_metadata)
    if topic is not None:
        return topic, "unknown", "unknown"

    logger.warning("job metadata parse failed, using default topic")
    return DEFAULT_TOPIC_DATA, "unknown", "local"


async def dump_transcript(
    session: AgentSession,
    topic: TopicData,
    room_name: str,
    student_id: str = "unknown",
) -> Path:
    """Best-effort transcript dump. Never raises — scoring depends on this file."""
    out = Path("data/transcripts")
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{room_name}.json"
    turns: list[dict] = []
    try:
        # Diagnostic block: log the actual history API shape so mismatches
        # between livekit-agents versions surface in the logs (1.2.1).
        try:
            logger.info("session type: %s", type(session).__name__)
            chat_ctx_probe = getattr(session, "chat_ctx", None)
            history_probe = getattr(session, "history", None)
            if chat_ctx_probe is not None:
                items_probe = getattr(chat_ctx_probe, "items", None)
                logger.info(
                    "chat_ctx=%s items=%d",
                    type(chat_ctx_probe).__name__,
                    len(items_probe) if items_probe is not None else -1,
                )
            if history_probe is not None:
                logger.info(
                    "history=%s dir=%s",
                    type(history_probe).__name__,
                    [a for a in dir(history_probe) if not a.startswith("_")],
                )
        except Exception as diag_err:
            logger.debug("transcript diagnostic failed: %s", diag_err)

        # livekit-agents 1.2+: session.chat_ctx holds ChatContext
        chat_ctx = getattr(session, "chat_ctx", None)
        if chat_ctx is None:
            chat_ctx = getattr(session, "history", None)

        items = []
        if chat_ctx is not None:
            # ChatContext has .items (list of ChatMessage)
            items = (
                getattr(chat_ctx, "items", None)
                or getattr(chat_ctx, "messages", None)
                or []
            )
            if callable(items):
                items = items()

        for m in items or []:
            role_raw = getattr(m, "role", "?")
            # Map livekit roles: "assistant" -> "tutor", "user" -> "student"
            if isinstance(role_raw, str):
                role = role_raw
            else:
                role = str(role_raw.value) if hasattr(role_raw, "value") else str(role_raw)

            if role in ("assistant", "agent"):
                role = "tutor"
            elif role in ("user", "human"):
                role = "student"

            text = getattr(m, "text", None) or getattr(m, "content", "")
            if isinstance(text, list):
                # Multi-part content (e.g., text + tool calls)
                text = " ".join(
                    getattr(p, "text", str(p))
                    for p in text
                    if hasattr(p, "text") or isinstance(p, str)
                )
            text = str(text).strip()

            if text and role != "system":
                turns.append({"role": role, "text": text})

    except Exception as e:
        logger.warning("transcript history unavailable: %s", e)
    transcript = Transcript(
        room_name=room_name,
        topic_id=topic.topic_id,
        student_id=student_id,
        lang=topic.lang,
        turns=[
            TranscriptTurn(role=t["role"], text=t["text"])
            for t in turns
        ],
    )
    payload = transcript.to_dict()
    payload["latencies"] = {
        "note": "p50/p95 computed once enough data, raw per-turn in turns[].stt_lat_ms etc.",
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    logger.info("transcript dumped to %s (%d turns)", path, len(turns))
    return path


async def _post_transcript_webhook(
    transcript_dict: dict,
    topic_dict: dict,
    dur_s: float,
) -> None:
    """POST transcript to API webhook with 3x exponential backoff retry."""
    url = f"{API_BASE}/webhooks/transcript"
    payload = {
        "transcript": transcript_dict,
        "topic": topic_dict,
        "dur_s": dur_s,
    }
    for attempt in range(3):
        try:
            async with asyncio.timeout(15):
                import httpx

                async with httpx.AsyncClient(timeout=15) as client:
                    r = await client.post(url, json=payload)
                    r.raise_for_status()
                    logger.info("Transcript webhook POST succeeded (%s)", r.status_code)
                    return
        except Exception as e:
            logger.warning("Webhook attempt %d/3 failed: %s", attempt + 1, e)
            if attempt < 2:
                await asyncio.sleep(2**attempt)
    logger.error("All 3 webhook attempts failed — transcript saved locally only")


@server.rtc_session(agent_name="akara-voice")
async def entrypoint(ctx: JobContext):
    topic_data, student_id, meta_room = resolve_session_metadata(ctx.job.metadata)
    room_name = ctx.room.name or meta_room or "local"
    session_start = _time.monotonic()
    # Per-session STT language: use full BCP-47 for VEXYL-STT (e.g. "hi-IN").
    stt_lang = topic_data.lang or "hi"
    if "-" not in stt_lang:
        stt_lang = f"{stt_lang}-IN"  # VEXYL-STT expects "hi-IN", not "hi"
    # Per-session TTS language: metadata lang wins, fallback "hi" (back-compat).
    tts_lang = (topic_data.lang or "hi").split("-")[0]

    session = AgentSession(
        stt=build_stt(stt_lang),
        # NOTE: stt_context_options (keyterm detection) is Deepgram-specific,
        # not applicable to VEXYL-STT. Removed.
        llm=build_llm(),
        tts=build_tts(tts_lang),
        expressive=True,
        turn_handling=TurnHandlingOptions(
            turn_detection=inference.TurnDetector(),
            preemptive_generation={"enabled": True},
        ),
        vad=inference.VAD(),
    )

    # Per-turn latency tracking (1.4): livekit-agents 1.2+ emits structured
    # AgentMetrics per turn on "metrics_collected".
    @session.on("metrics_collected")
    def on_metrics(metrics):
        """Log per-turn latencies emitted by the LiveKit agent pipeline."""
        logger.info(
            "Turn metrics: stt=%.0fms llm_ttft=%.0fms tts_ttfb=%.0fms",
            getattr(metrics, "stt_duration", 0) * 1000,
            getattr(metrics, "llm_ttft", 0) * 1000,
            getattr(metrics, "tts_ttfb", 0) * 1000,
        )

    async def _on_shutdown():
        dur_s = _time.monotonic() - session_start
        try:
            path = await dump_transcript(session, topic_data, room_name, student_id)
            # Read back the saved transcript for POST
            transcript_dict = json.loads(path.read_text(encoding="utf-8"))
            topic_dict = json.loads(topic_data.to_metadata_json())
            await _post_transcript_webhook(transcript_dict, topic_dict, dur_s)
        except Exception as e:
            logger.warning("shutdown transcript/webhook failed: %s", e)

    ctx.add_shutdown_callback(_on_shutdown)

    await session.start(
        agent=DefaultAgent(topic_data),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=ai_coustics.audio_enhancement(
                    model=ai_coustics.EnhancerModel.QUAIL_VF_S,
                ),
            ),
        ),
    )


if __name__ == "__main__":
    cli.run_app(server)
