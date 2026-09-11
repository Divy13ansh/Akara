"""Akara voice worker: LiveKit AgentSession (VAD/STT/LLM/TTS).

Entry point for the Feynman voice loop. Topic is injected via
LiveKit job metadata as JSON {topic, script, rubric, grade, subject, lang}.
See docs/voice-loop.md for the full contract.
"""

from __future__ import annotations

import json
import logging
import sys
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

try:
    from akara_common.schemas import TopicData, Transcript, TranscriptTurn
except ImportError:
    from packages.akara_common.schemas import TopicData, Transcript, TranscriptTurn  # type: ignore

logger = logging.getLogger("akara-voice")
load_dotenv(".env.local")

# ---------------------------------------------------------------------------
# Model constructors — isolated so the open-weight swap (docs/open-weights.md)
# touches only these three functions.
# ---------------------------------------------------------------------------

DEFAULT_TTS_VOICE = "79a125e8-cd45-4c13-8a67-188112f4dd22"  # Cartesia multilingual


def build_stt():
    # "multi" enables Nova-3 multilingual/codeswitching (incl. Hindi).
    # NOTE: keyterm detection is English-only — no-op for Hindi, not an error.
    return inference.STT(model="deepgram/nova-3", language="multi")


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


INSTRUCTIONS_TEMPLATE = """You are Akara, a Socratic tutor for Indian secondary-school students (Grades
9-12, NCERT curriculum). The student has just watched a short video
explaining one concept. Your job is not to teach the concept again — it's to
find out whether they actually understood it, using the Feynman technique:
they explain it back in their own words, and you probe the gaps.

## What you have been given for this session
TOPIC: {topic}
GROUND-TRUTH SCRIPT: {script}
RUBRIC (the key ideas a correct explanation must contain): {rubric}

## Your core loop, every turn
1. Listen to what the student just said.
2. Silently check it against the rubric — which points did they cover, which
   did they miss or get wrong?
3. Pick the SINGLE most important gap.
4. Ask exactly ONE short, targeted follow-up question that would force them
   to confront that specific gap. Do not list multiple questions.
5. Do not summarize what they got right or wrong before asking — just ask.
   A brief one-clause acknowledgment ("Right, so—") is fine; a paragraph of
   feedback is not.

## Never do this
- Never state the correct answer, even partially, even as part of a "hint."
- Never ask more than one question in a turn.
- Never use bullet points, numbered lists, or markdown — this is spoken
  audio, not text on a screen.
- Never break character to mention you're an AI, a rubric, or a scoring
  system.
- Never let the conversation drift into unrelated topics.

## Escalation logic
- Fully correct explanation: acknowledge mastery briefly and warmly, then
  ask ONE harder application/edge-case question.
- Partially correct: target the biggest specific gap, as above.
- Completely off-base, silent, or "I don't know": scaffold down one level —
  ask a smaller, more concrete version tied to something physical.
- Nails the harder follow-up too: tell them plainly they've mastered this
  concept and the session is complete.

## Tone and delivery
- Warm, patient, curious — like a good TA, not an exam.
- Age-appropriate for a 14-18 year old.
- Keep every turn to 1-3 short sentences.
- Match the student's language — if they answer in Hindi or code-switch
  (Hinglish), respond naturally in kind rather than forcing pure English.
"""

# Fallback for local `lk agent console` (no job metadata) or bad metadata.
DEFAULT_TOPIC_DATA = TopicData(
    topic_id="phy9-newton3",
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
        instructions = INSTRUCTIONS_TEMPLATE.format(
            topic=topic_data.topic,
            script=topic_data.script,
            rubric=topic_data.rubric,
        )
        super().__init__(
            instructions=instructions,
            tools=[
                EndCallTool(
                    extra_description="",
                    end_instructions=(
                        "Only end the call after the practice session and "
                        "feedback are complete or the user confirms they "
                        "want to stop. Before ending, summarize the top "
                        "coaching takeaway."
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


def resolve_topic_data(raw_metadata: str | None) -> TopicData:
    if not raw_metadata:
        logger.warning("empty job metadata, using default topic")
        return DEFAULT_TOPIC_DATA
    try:
        parsed = TopicData.from_metadata_json(raw_metadata)
    except Exception:
        logger.warning("job metadata parse failed, using default topic")
        return DEFAULT_TOPIC_DATA
    if parsed is None:
        # Last resort: try bare {topic, script, rubric} dict
        try:
            data = json.loads(raw_metadata)
            return TopicData(
                topic_id=data.get("topic_id", "legacy-topic"),
                topic=data["topic"],
                script=data["script"],
                rubric=data["rubric"],
                grade=data.get("grade", ""),
                subject=data.get("subject", ""),
                lang=data.get("lang", "hi"),
            )
        except Exception:
            logger.warning("job metadata was not valid TopicData, using default")
            return DEFAULT_TOPIC_DATA
    return parsed


async def dump_transcript(session: AgentSession, topic: TopicData, room_name: str) -> Path:
    """Best-effort transcript dump. Never raises — scoring depends on this file."""
    out = Path("data/transcripts")
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{room_name}.json"
    turns: list[dict] = []
    try:
        history = getattr(session, "history", None)
        items = []
        if history is not None:
            items = getattr(history, "items", None) or getattr(history, "messages", []) or []
            if callable(items):
                items = items()
        for m in items or []:
            role = getattr(m, "role", "?")
            text = getattr(m, "text", None) or getattr(m, "content", "")
            if isinstance(text, list):
                text = " ".join(str(p) for p in text)
            turns.append({"role": role, "text": str(text)})
    except Exception as e:
        logger.warning("transcript history unavailable: %s", e)
    transcript = Transcript(
        room_name=room_name,
        topic_id=topic.topic_id,
        student_id="unknown",
        lang=topic.lang,
        turns=[TranscriptTurn(role=t.get("role", "?"), text=t.get("text", "")) for t in turns],
    )
    path.write_text(json.dumps(transcript.to_dict(), ensure_ascii=False, indent=2))
    logger.info("transcript dumped to %s (%d turns)", path, len(turns))
    return path


@server.rtc_session(agent_name="akara-voice")
async def entrypoint(ctx: JobContext):
    topic_data = resolve_topic_data(ctx.job.metadata)
    # Per-session TTS language: metadata lang wins, fallback "hi" (back-compat).
    tts_lang = (topic_data.lang or "hi").split("-")[0]

    session = AgentSession(
        stt=build_stt(),
        stt_context_options={"keyterm_detection": {"enabled": True}},
        llm=build_llm(),
        tts=build_tts(tts_lang),
        expressive=True,
        turn_handling=TurnHandlingOptions(
            turn_detection=inference.TurnDetector(),
            preemptive_generation={"enabled": True},
        ),
        vad=inference.VAD(),
    )

    async def _on_shutdown():
        try:
            await dump_transcript(session, topic_data, ctx.room.name or "local")
        except Exception as e:
            logger.warning("transcript dump failed: %s", e)

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
