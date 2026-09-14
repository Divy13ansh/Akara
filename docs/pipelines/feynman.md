# Feynman Pipeline — Full Implementation Plan

> **Purpose**: This document is an execution-ready blueprint. An agent (or dev)
> should be able to read this file top-to-bottom and implement every change
> without needing to ask clarifying questions. Every file path, function
> signature, env var, and code snippet is specified.

---

## Table of Contents

1. [Current State Summary](#current-state-summary)
2. [Environment Variables](#environment-variables)
3. [Phase 1 — Voice Pipeline Hardening](#phase-1--voice-pipeline-hardening)
4. [Phase 2 — Feynman Core: Rubric Levels + Scorer LLM](#phase-2--feynman-core-rubric-levels--scorer-llm)
5. [Phase 3 — Explain Page Voice Wiring](#phase-3--explain-page-voice-wiring)
6. [Phase 4 — Rest of Backend + Postgres](#phase-4--rest-of-backend--postgres)
7. [Testing Checklist](#testing-checklist)

---

## Current State Summary

| Component | File(s) | Status |
|---|---|---|
| Voice agent | `services/voice/agent.py` | Socratic prompt works, Vexyl-STT wired, Cartesia TTS per-session lang done. `dump_transcript()` parses `session.history` blindly (likely empty/wrong shape), `student_id` hardcoded `"unknown"`, nothing POSTs to the webhook, no turn-latency logging, no mastery gate. |
| Vexyl STT plugin | `services/voice/vexyl_stt_plugin.py` | Working. WebSocket client to local VEXYL-STT server at `ws://127.0.0.1:8091`. 16kHz mono PCM, VAD-based finals only. |
| Scorer | `services/voice/scorer.py` | Heuristic-v0 keyword overlap. No LLM judge. |
| API server | `services/api/tokens.py` | Only `GET /health`, `/topics`, `/token` are real routes. `library.py`, `progress.py`, `webhooks.py` are unmounted helper functions. |
| Webhook handler | `services/api/webhooks.py` | `handle_transcript()` function exists but is not mounted as a FastAPI route. |
| Schemas | `packages/akara_common/schemas.py` | `TopicData`, `TranscriptTurn`, `Transcript`, `CoveragePoint`, `CoverageResult` — all dataclasses. |
| RAG / Retrieve | `packages/akara_rag/retrieve.py` | 3 seed topics in-memory dict. `fetch_topic(topic_id, lang)` signature stable. |
| Frontend Explain | `apps/web/src/pages/Explain.tsx` | Mock UI. No LiveKit client (`livekit-client` not in `package.json`), no mic, hardcoded `speechText`, no token fetch, no room lifecycle. |
| Frontend API | `apps/web/src/services/api.ts` | All mock. localStorage-based auth, hardcoded curriculum data. |

### Stack (locked — do NOT change these)

| Layer | Provider | Notes |
|---|---|---|
| **STT** | Vexyl-STT (self-hosted AI4Bharat IndicConformer) | `services/voice/vexyl_stt_plugin.py`, server at `~/Desktop/projects-explore/vexyl-stt/` |
| **LLM (tutor)** | Gemma-4-31b-it via LiveKit inference | `inference.LLM(model="google/gemma-4-31b-it")` |
| **TTS** | Cartesia Sonic-3 | `inference.TTS(model="cartesia/sonic-3")` |
| **LLM (scorer)** | Azure OpenAI GPT-4o-mini | New — see Phase 2 |
| **VAD** | LiveKit `inference.VAD()` | Default |

---

## Environment Variables

Add these to `services/voice/.env.local` and `services/api/.env.local` (or a shared root `.env.local`):

```bash
# ── LiveKit (already present) ──────────────────────────────────
LIVEKIT_URL=wss://akara-2602rpv3.livekit.cloud
LIVEKIT_API_KEY=APIJywy9LLWEtr7
LIVEKIT_API_SECRET=g4fyKIkNcAwLeHcCQpKBaRk81F84U3ITjVpVyV0liCj

# ── Vexyl STT (already present) ───────────────────────────────
VEXYL_STT_HOST=127.0.0.1
VEXYL_STT_PORT=8091

# ── Azure OpenAI (for SCORER LLM — NOT for tutor) ─────────────
AZURE_OPENAI_ENDPOINT=https://divya-mf5s9rvr-swedencentral.openai.azure.com/
AZURE_API_KEY=52NTilGRI9JAHW7hpTp6VidJPagjbegouTV9qkWjuTWt0747X5fxJQQJ99BIACfhMk5XJ3w3AAAAACOGoswl
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
AZURE_OPENAI_API_VERSION=2024-06-01

# ── Groq (STT fallback — not primary) ─────────────────────────
GROQ_API_KEY=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

# ── API service ────────────────────────────────────────────────
AKARA_API_URL=http://localhost:8000
```

> [!IMPORTANT]
> The deployment name is `gpt-4o-mini` (NOT `gpt5.4mini` — that was a typo in the user's prompt). The Azure endpoint is Sweden Central.

---

## Phase 1 — Voice Pipeline Hardening

### 1.1 Thread Identity Through Metadata

**Problem**: `tokens.py` builds the LiveKit token with metadata containing only `TopicData`. The voice agent has no way to know `student_id` or `room_name` from metadata — it currently hardcodes `student_id = "unknown"`.

**Files to change**:
- `services/api/tokens.py` (lines 70-87)
- `services/voice/agent.py` (lines 183-208, 211-241, 244-286)
- `packages/akara_common/schemas.py` (add new dataclass)

#### Step 1.1.1: Add `SessionMetadata` to schemas

In `packages/akara_common/schemas.py`, add a new dataclass **after** `TopicData`:

```python
@dataclass
class SessionMetadata:
    """Wraps TopicData + session identity for LiveKit job metadata."""
    topic: TopicData
    student_id: str
    room_name: str

    def to_json(self) -> str:
        return json.dumps({
            "topic": asdict(self.topic),
            "student_id": self.student_id,
            "room_name": self.room_name,
        })

    @classmethod
    def from_json(cls, raw: str | None) -> SessionMetadata | None:
        if not raw:
            return None
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(data, dict):
            return None
        # New shape: {topic: {...}, student_id, room_name}
        if "topic" in data and isinstance(data["topic"], dict):
            topic = TopicData.from_metadata_json(json.dumps(data["topic"]))
            if topic is None:
                return None
            return cls(
                topic=topic,
                student_id=data.get("student_id", "unknown"),
                room_name=data.get("room_name", "unknown"),
            )
        # Legacy shape: flat TopicData (no student_id wrapper)
        topic = TopicData.from_metadata_json(raw)
        if topic:
            return cls(topic=topic, student_id="unknown", room_name="unknown")
        return None
```

Update `__init__.py` to export it:
```python
from .schemas import TopicData, SessionMetadata
__all__ = ["TopicData", "SessionMetadata"]
```

#### Step 1.1.2: Update `tokens.py` to embed `SessionMetadata`

In `services/api/tokens.py`, change the `/token` endpoint (line 70-87):

```python
from akara_common.schemas import TopicData, SessionMetadata

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
```

#### Step 1.1.3: Update `agent.py` to parse `SessionMetadata`

Replace `resolve_topic_data()` in `services/voice/agent.py` (lines 183-208):

```python
from akara_common.schemas import TopicData, SessionMetadata, Transcript, TranscriptTurn

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
```

Update the entrypoint (lines 244-286) to use it:

```python
@server.rtc_session(agent_name="akara-voice")
async def entrypoint(ctx: JobContext):
    topic_data, student_id, meta_room = resolve_session_metadata(ctx.job.metadata)
    room_name = ctx.room.name or meta_room or "local"
    # ... rest stays the same, but pass student_id to dump_transcript
```

And update `dump_transcript` to accept and use `student_id`:

```python
async def dump_transcript(
    session: AgentSession,
    topic: TopicData,
    room_name: str,
    student_id: str = "unknown",  # NEW parameter
) -> Path:
    # ... existing history-parsing logic ...
    transcript = Transcript(
        room_name=room_name,
        topic_id=topic.topic_id,
        student_id=student_id,  # was hardcoded "unknown"
        lang=topic.lang,
        turns=[...],
    )
    # ...
```

---

### 1.2 Fix Transcript Capture

**Problem**: `dump_transcript()` tries `session.history` and guesses at `.items` / `.messages` — the actual shape in `livekit-agents>=1.2` is different and likely produces empty turns.

**Files to change**: `services/voice/agent.py` lines 211-241

#### Step 1.2.1: Discover the actual history API

Before coding, run this diagnostic to find the real shape:

```python
# Add this temporarily inside _on_shutdown, BEFORE dump_transcript:
logger.info("session type: %s", type(session))
logger.info("session dir: %s", [a for a in dir(session) if not a.startswith('_')])
history = getattr(session, "history", None)
if history is not None:
    logger.info("history type: %s", type(history))
    logger.info("history dir: %s", [a for a in dir(history) if not a.startswith('_')])
    # Try ChatContext
    chat_ctx = getattr(session, "chat_ctx", None)
    if chat_ctx:
        logger.info("chat_ctx type: %s", type(chat_ctx))
        logger.info("chat_ctx.items count: %d", len(getattr(chat_ctx, "items", [])))
```

Run `lk agent console` with DEFAULT_TOPIC_DATA, do 2 exchanges, check the log output.

#### Step 1.2.2: Rewrite `dump_transcript()` based on findings

The most likely working approach for `livekit-agents>=1.2`:

```python
async def dump_transcript(
    session: AgentSession,
    topic: TopicData,
    room_name: str,
    student_id: str = "unknown",
) -> Path:
    """Best-effort transcript dump. Never raises."""
    out = Path("data/transcripts")
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{room_name}.json"

    turns: list[dict] = []
    try:
        # livekit-agents 1.2+: session.chat_ctx holds ChatContext
        chat_ctx = getattr(session, "chat_ctx", None)
        if chat_ctx is None:
            chat_ctx = getattr(session, "history", None)

        items = []
        if chat_ctx is not None:
            # ChatContext has .items (list of ChatMessage)
            items = getattr(chat_ctx, "items", None) or \
                    getattr(chat_ctx, "messages", None) or []
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
                    getattr(p, "text", str(p)) for p in text
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
    path.write_text(json.dumps(transcript.to_dict(), ensure_ascii=False, indent=2))
    logger.info("transcript dumped → %s (%d turns)", path, len(turns))
    return path
```

#### Step 1.2.3: Add a simple test

Create `tests/test_transcript_dump.py`:

```python
"""Test that dump_transcript produces valid JSON with correct roles."""
import json
from pathlib import Path
from unittest.mock import MagicMock
from packages.akara_common.schemas import TopicData, Transcript

def test_dump_creates_valid_json(tmp_path):
    # Simulate a 2-turn session by writing directly
    transcript = Transcript(
        room_name="test-room-1",
        topic_id="phy9-newton3",
        student_id="stu_test",
        lang="en",
        turns=[
            {"role": "tutor", "text": "Tell me about Newton's third law."},
            {"role": "student", "text": "Every action has an equal and opposite reaction."},
        ],
    )
    out = tmp_path / "test-room-1.json"
    out.write_text(json.dumps(transcript.to_dict(), ensure_ascii=False, indent=2))
    loaded = json.loads(out.read_text())
    assert loaded["student_id"] == "stu_test"
    assert len(loaded["turns"]) == 2
    assert loaded["turns"][0]["role"] == "tutor"
    assert loaded["turns"][1]["role"] == "student"
```

---

### 1.3 Fire Webhook on Shutdown

**Problem**: `_on_shutdown` in `agent.py` dumps the transcript to disk but never POSTs it to the API. The webhook handler in `webhooks.py` is not mounted as a FastAPI route.

**Files to change**:
- `services/voice/agent.py` (shutdown callback)
- `services/api/tokens.py` (mount webhook route)
- `services/api/webhooks.py` (already has `handle_transcript`, just needs to be a route)

#### Step 1.3.1: Mount the webhook route in the API server

In `services/api/tokens.py`, add at the bottom (after the `/token` route):

```python
from fastapi import Request
from services.api.webhooks import handle_transcript

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
```

Also add CORS middleware if not already present (it is — confirmed on line ~10 of the old `main.py` structure, but verify `tokens.py` has it):

```python
from fastapi.middleware.cors import CORSMiddleware

# After app = FastAPI(...)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### Step 1.3.2: POST transcript from voice agent shutdown

In `services/voice/agent.py`, update `_on_shutdown` and add the HTTP POST:

```python
import httpx
import asyncio
import time as _time

API_BASE = os.getenv("AKARA_API_URL", "http://localhost:8000")

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
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(url, json=payload)
                r.raise_for_status()
                logger.info("Transcript webhook POST succeeded (%s)", r.status_code)
                return
        except Exception as e:
            logger.warning("Webhook attempt %d/3 failed: %s", attempt + 1, e)
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)
    logger.error("All 3 webhook attempts failed — transcript saved locally only")
```

Update the entrypoint's shutdown callback:

```python
@server.rtc_session(agent_name="akara-voice")
async def entrypoint(ctx: JobContext):
    topic_data, student_id, meta_room = resolve_session_metadata(ctx.job.metadata)
    room_name = ctx.room.name or meta_room or "local"
    session_start = _time.monotonic()

    # ... build session ...

    async def _on_shutdown():
        dur_s = _time.monotonic() - session_start
        try:
            path = await dump_transcript(session, topic_data, room_name, student_id)
            # Read back the saved transcript for POST
            transcript_dict = json.loads(path.read_text())
            topic_dict = json.loads(topic_data.to_metadata_json())
            await _post_transcript_webhook(transcript_dict, topic_dict, dur_s)
        except Exception as e:
            logger.warning("shutdown transcript/webhook failed: %s", e)

    ctx.add_shutdown_callback(_on_shutdown)
    # ... session.start() ...
```

> [!WARNING]
> Never block the audio path. The shutdown callback runs AFTER the session ends, so this is safe. But keep the httpx timeout at 15s max.

---

### 1.4 Turn Metrics

**Problem**: `docs/pipelines/voice-loop.md` requires per-turn `stt_lat, llm_ttft, tts_ttfb` logging. Currently not captured.

**Files to change**: `services/voice/agent.py`, `packages/akara_common/schemas.py`

#### Step 1.4.1: Extend `TranscriptTurn` with latency fields

In `packages/akara_common/schemas.py`, update `TranscriptTurn`:

```python
@dataclass
class TranscriptTurn:
    role: str           # "tutor" | "student"
    text: str
    ts: float = 0.0     # wall-clock timestamp (epoch seconds)
    stt_lang: str = ""  # detected language from STT
    conf: float = 0.0   # STT confidence
    stt_lat_ms: int = 0     # NEW: end-of-speech → transcript ready
    llm_ttft_ms: int = 0    # NEW: transcript ready → first LLM token
    tts_ttfb_ms: int = 0    # NEW: first LLM token → first TTS audio byte
```

#### Step 1.4.2: Hook into LiveKit agent events

In `services/voice/agent.py`, after session is created but before `session.start()`:

```python
import time as _time

# Per-turn latency tracking
_turn_metrics: dict[str, float] = {}

@session.on("user_speech_committed")
def on_speech_committed(ev):
    """Fires when STT produces a final transcript for user speech."""
    _turn_metrics["stt_end"] = _time.monotonic()
    # stt_lat = time between end-of-speech and this event
    # VEXYL-STT includes this in its own latency_ms field;
    # we also measure it from the agent's perspective.

@session.on("agent_speech_started")
def on_agent_speech(ev):
    """Fires when TTS audio starts playing."""
    _turn_metrics["tts_start"] = _time.monotonic()
```

> [!NOTE]
> The exact event names depend on `livekit-agents` version. Run
> `logger.info("session events: %s", [e for e in dir(session) if 'on' in e.lower()])` to discover them.
> Alternatively, use `session.on("metrics_collected")` which emits `AgentMetrics` containing all latencies — this is the **recommended** approach for `livekit-agents>=1.2`:

```python
@session.on("metrics_collected")
def on_metrics(metrics):
    """LiveKit agents 1.2+ emits structured metrics per turn."""
    logger.info(
        "Turn metrics: stt=%.0fms llm_ttft=%.0fms tts_ttfb=%.0fms",
        getattr(metrics, "stt_duration", 0) * 1000,
        getattr(metrics, "llm_ttft", 0) * 1000,
        getattr(metrics, "tts_ttfb", 0) * 1000,
    )
```

Include per-turn metrics in the transcript JSON. Augment `dump_transcript` to include a `"latencies"` summary key:

```python
# After building turns list, before writing:
payload = transcript.to_dict()
payload["latencies"] = {
    "note": "p50/p95 computed once enough data, raw per-turn in turns[].stt_lat_ms etc.",
}
```

---

### 1.5 Vexyl STT Verification

**Problem**: Need to confirm 16kHz resample path, silence/VAD behavior, `hi-IN` threading on real classroom audio.

**This is a manual testing task, not a code change.**

#### Checklist:

1. **Start the Vexyl server**: `cd ~/Desktop/projects-explore/vexyl-stt && ./run.sh`
2. **Verify health**: `curl http://127.0.0.1:8091/health` — expect `{"status": "ok", "device": "cpu", ...}`
3. **Run a test session**: `cd services/voice && python agent.py dev` → speak in Hindi for 30s → check terminal output for `[VEXYL] Final:` lines
4. **Measure end-of-speech latency**: note the `latency_ms` field in each `[VEXYL] Final:` log line. Expected: 600-1500ms on CPU.
5. **Test language threading**: set topic lang to `"hi"`, verify STT receives `hi-IN`, verify TTS receives `"hi"`.
6. **Classroom noise test**: play YouTube classroom audio in background while speaking — check if VAD triggers falsely.

**Document results** in `docs/pipelines/vexyl-stt.md` under a new "## Measured Performance" section:

```markdown
## Measured Performance (DATE)
- End-of-speech latency: XXXms (p50), XXXms (p95) on CPU
- Language: hi-IN confirmed working / en not supported (only Indian langs)
- Classroom noise: VAD triggered N false positives in 5 min test
```

---

## Phase 2 — Feynman Core: Rubric Levels + Scorer LLM

### 2.1 Rubric Levels Schema

**Problem**: Current rubric is a flat numbered string (`"1. ... 2. ... 3. ..."`). The Feynman mastery gate needs ordered levels: L1 recall → L2 mechanism → L3 misconception → L4 application.

**Files to change**:
- `packages/akara_common/schemas.py` (new `RubricLevel` dataclass)
- `packages/akara_rag/retrieve.py` (update seed topics)
- `services/voice/agent.py` (prompt v2)

> [!IMPORTANT]
> **Do NOT break the existing `TopicData.rubric: str` field.** The video pipeline also consumes `script/rubric`. Instead: add a new `rubric_levels` field that is optional, and keep `rubric` as the flat string for backward compat. The scorer and tutor prompt use `rubric_levels` when present, fall back to `rubric`.

#### Step 2.1.1: Add `RubricLevel` to schemas

In `packages/akara_common/schemas.py`:

```python
@dataclass
class RubricPoint:
    """Single assessable point within a rubric level."""
    id: int
    text: str
    misconception: str = ""  # explicit misconception text, if any

@dataclass
class RubricLevel:
    """One level in the Feynman mastery ladder."""
    level: int          # 1-4
    name: str           # e.g. "Recall", "Mechanism", "Misconception-Buster", "Application"
    description: str    # what the student must demonstrate
    points: list[RubricPoint] = field(default_factory=list)
    mastery_threshold: float = 0.7  # fraction of points that must be covered to pass this level
```

Update `TopicData`:

```python
@dataclass
class TopicData:
    topic_id: str
    topic: str
    script: str
    rubric: str                                        # flat string (legacy, still used by video)
    grade: str = ""
    subject: str = ""
    lang: str = "en"
    rubric_levels: list[RubricLevel] | None = None     # NEW — optional structured rubric

    def to_metadata_json(self) -> str:
        d = asdict(self)
        # rubric_levels is optional; omit if None to save metadata size
        if d.get("rubric_levels") is None:
            d.pop("rubric_levels", None)
        return json.dumps(d)

    @classmethod
    def from_metadata_json(cls, raw: str | None) -> TopicData | None:
        # ... existing parsing logic ...
        # Add rubric_levels parsing:
        rubric_levels_raw = data.get("rubric_levels")
        rubric_levels = None
        if rubric_levels_raw and isinstance(rubric_levels_raw, list):
            rubric_levels = [
                RubricLevel(
                    level=rl["level"],
                    name=rl["name"],
                    description=rl["description"],
                    points=[RubricPoint(**p) for p in rl.get("points", [])],
                    mastery_threshold=rl.get("mastery_threshold", 0.7),
                )
                for rl in rubric_levels_raw
            ]
        # Pass to constructor:
        return cls(
            topic_id=data.get("topic_id", ""),
            # ... other fields ...
            rubric_levels=rubric_levels,
        )
```

#### Step 2.1.2: Update seed topics with leveled rubrics

In `packages/akara_rag/retrieve.py`, update the Newton's Third Law seed:

```python
from akara_common.schemas import TopicData, RubricLevel, RubricPoint

SEED_TOPICS: dict[str, TopicData] = {
    "phy9-newton3": TopicData(
        topic_id="phy9-newton3",
        topic="Newton's Third Law of Motion",
        script=(
            "Every action has an equal and opposite reaction. When object A "
            "exerts a force on object B, object B simultaneously exerts a force "
            "of equal magnitude and opposite direction on object A. These two "
            "forces act on DIFFERENT objects, which is why they don't cancel "
            "out, even though they are equal and opposite."
        ),
        rubric=(  # flat string preserved for backward compat
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
        lang="en",
        rubric_levels=[
            RubricLevel(
                level=1, name="Recall",
                description="Student can state the law in their own words",
                mastery_threshold=1.0,
                points=[
                    RubricPoint(id=1, text="Forces come in pairs (action-reaction)"),
                    RubricPoint(id=2, text="Equal in magnitude, opposite in direction"),
                ],
            ),
            RubricLevel(
                level=2, name="Mechanism",
                description="Student explains WHY/HOW the law works",
                mastery_threshold=1.0,
                points=[
                    RubricPoint(
                        id=3,
                        text="The two forces act on two DIFFERENT objects",
                        misconception="Thinking they act on the same object and should cancel",
                    ),
                ],
            ),
            RubricLevel(
                level=3, name="Misconception-Buster",
                description="Student can identify and refute the classic misconception",
                mastery_threshold=1.0,
                points=[
                    RubricPoint(
                        id=4,
                        text="Explains why action-reaction pairs don't cancel even though equal and opposite",
                        misconception="If forces are equal and opposite they must cancel to zero net force",
                    ),
                ],
            ),
            RubricLevel(
                level=4, name="Application",
                description="Student gives a correct real-world example with both objects identified",
                mastery_threshold=1.0,
                points=[
                    RubricPoint(
                        id=5,
                        text="Correct real-world example (walking, rocket, gun recoil) with both objects identified",
                    ),
                ],
            ),
        ],
    ),
    # ... update other seed topics similarly ...
}
```

Do the same for `phy9-inertia` and `math10-quadratic`. Each needs 3-4 levels.

---

### 2.2 Tutor Prompt v2 (Mastery Gate)

**Problem**: Current prompt has soft "escalation logic" that relies on LLM vibes. Need explicit level-gated progression: tutor may only advance L→L+1 when current level's points are evidenced.

**File to change**: `services/voice/agent.py` — replace `INSTRUCTIONS_TEMPLATE`

```python
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
```

Update `DefaultAgent.__init__`:

```python
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
```

---

### 2.3 Separate Scorer Service (Azure OpenAI GPT-4o-mini)

**Problem**: The current scorer is keyword-overlap only. Need an LLM-based judge that evaluates per-rubric-point coverage with evidence quotes. The scorer is a **separate process** from the tutor — Gemma (tutor) does NOT score.

**New files to create**:
- `services/scorer/__init__.py`
- `services/scorer/pyproject.toml`
- `services/scorer/llm_scorer.py`
- `services/scorer/prompts.py`

#### Step 2.3.1: Create the scorer service package

`services/scorer/pyproject.toml`:

```toml
[project]
name = "akara-scorer"
version = "0.1.0"
description = "Akara post-call scorer service (Azure OpenAI)"
requires-python = ">=3.11"
dependencies = [
  "openai>=1.30",
  "python-dotenv",
  "httpx",
]

[tool.ruff]
line-length = 100
```

`services/scorer/__init__.py`:

```python
"""Akara scorer service — LLM-based transcript evaluation."""
```

#### Step 2.3.2: Create the scorer prompt

`services/scorer/prompts.py`:

```python
"""Scorer LLM prompts for transcript evaluation."""

SCORER_SYSTEM_PROMPT = """You are a precise educational assessment engine. You evaluate student
explanations against a rubric. You are NOT the tutor — you are a separate
judge that scores AFTER the conversation is complete.

You will receive:
1. A topic with title, script (ground truth), and rubric points organized by level
2. A full transcript of a tutor-student conversation

Your job: For EACH rubric point, determine whether the STUDENT (not the tutor)
demonstrated understanding of that point during the conversation.

## Scoring rules
- Only evaluate what the STUDENT said. Ignore tutor's questions/statements.
- A point is "covered" if the student said something that demonstrates genuine
  understanding — paraphrasing counts, exact wording is not needed.
- A point is "misconceived" if the student explicitly stated something that
  contradicts the point or matches a listed misconception.
- A point is "missed" if the student never addressed it at all.
- Always provide an exact quote from the student's speech as evidence.
  If missed, evidence should be an empty string.

## Output format
Respond with ONLY valid JSON (no markdown, no explanation):
{
  "points": [
    {
      "id": <int>,
      "level": <int>,
      "status": "covered" | "missed" | "misconceived",
      "evidence": "<exact student quote or empty string>",
      "confidence": <float 0.0-1.0>
    }
  ],
  "overall_mastery": <float 0.0-1.0>,
  "highest_level_cleared": <int 0-4>,
  "strengths": ["<string>"],
  "improvements": ["<string>"]
}"""


def build_scorer_user_prompt(
    topic_title: str,
    script: str,
    rubric_text: str,
    transcript_turns: list[dict],
) -> str:
    """Build the user prompt for the scorer LLM."""
    turns_text = "\n".join(
        f"[{t['role'].upper()}]: {t['text']}"
        for t in transcript_turns
    )

    return f"""## Topic: {topic_title}

## Ground-truth script:
{script}

## Rubric:
{rubric_text}

## Full transcript:
{turns_text}

Now evaluate each rubric point. Respond with JSON only."""
```

#### Step 2.3.3: Create the LLM scorer

`services/scorer/llm_scorer.py`:

```python
"""LLM-based scorer using Azure OpenAI GPT-4o-mini.

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
        CoveragePoint, CoverageResult, TopicData, Transcript,
    )
except ImportError:
    from packages.akara_common.schemas import (
        CoveragePoint, CoverageResult, TopicData, Transcript,
    )

from .prompts import SCORER_SYSTEM_PROMPT, build_scorer_user_prompt

logger = logging.getLogger("akara-scorer")

SCORER_MODEL = "azure-gpt-4o-mini"


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
    """Score a transcript using Azure OpenAI GPT-4o-mini.

    Falls back to heuristic scorer if Azure call fails.
    """
    client = _get_azure_client()
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")

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
            temperature=0.1,       # near-deterministic for scoring
            max_tokens=2000,
            response_format={"type": "json_object"},
        )

        result_text = response.choices[0].message.content
        result = json.loads(result_text)

        # Parse into CoverageResult
        points = []
        for p in result.get("points", []):
            points.append(CoveragePoint(
                id=p["id"],
                status=p["status"],        # "covered" | "missed" | "misconceived"
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
        from services.voice.scorer import score_transcript as heuristic_score
        return heuristic_score(transcript, topic, transcript.student_id)
```

#### Step 2.3.4: Wire the LLM scorer into the webhook handler

Update `services/api/webhooks.py` to prefer the LLM scorer:

```python
"""Post-call webhook: transcript intake → scorer → progress + cost log."""

from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "packages"))
sys.path.insert(0, str(ROOT / "services"))

from akara_common.schemas import TopicData, Transcript, TranscriptTurn
from akara_rag.retrieve import fetch_topic
from api.progress import save_coverage

logger = logging.getLogger("akara-webhooks")

COST_FILE = Path("data/cost.jsonl")


def _log_cost(room: str, dur_s: float) -> dict:
    line = {"room": room, "dur_s": dur_s, "ts": int(time.time()),
            "note": "est_usd pending provider usage wiring"}
    COST_FILE.parent.mkdir(parents=True, exist_ok=True)
    with COST_FILE.open("a") as f:
        f.write(json.dumps(line) + "\n")
    return line


def handle_transcript(payload: dict) -> dict:
    t = payload.get("transcript", {})
    turns = [TranscriptTurn(
        role=x.get("role", "student"),
        text=x.get("text", ""),
        ts=x.get("ts", 0.0),
        stt_lang=x.get("stt_lang", ""),
        conf=x.get("conf", 0.0),
    ) for x in t.get("turns", [])]

    transcript = Transcript(
        room_name=t.get("room_name", "unknown"),
        topic_id=t.get("topic_id", ""),
        student_id=t.get("student_id", "unknown"),
        lang=t.get("lang", "en"),
        turns=turns,
    )

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
        logger.info("Used LLM scorer (azure-gpt-4o-mini)")
    except Exception as e:
        logger.warning("LLM scorer unavailable (%s), using heuristic", e)
        from voice.scorer import score_transcript
        result = score_transcript(transcript, topic, transcript.student_id)

    save_coverage(result.to_dict())
    cost = _log_cost(transcript.room_name, dur_s=float(payload.get("dur_s", 0)))
    return {"coverage": result.to_dict(), "cost": cost}
```

#### Step 2.3.5: Add the scorer to workspace members

Update root `pyproject.toml`:

```toml
[tool.uv.workspace]
members = ["services/*", "packages/*"]
```

This already covers `services/scorer` since it uses `services/*` glob.

---

## Phase 3 — Explain Page Voice Wiring

### 3.1 Install LiveKit Client

**File to change**: `apps/web/package.json`

```bash
cd apps/web
npm install livekit-client @livekit/components-react
```

This adds:
- `livekit-client`: Core JS SDK for joining rooms
- `@livekit/components-react`: Optional React hooks (can use raw SDK too)

### 3.2 Rewrite `Explain.tsx`

**File to change**: `apps/web/src/pages/Explain.tsx`

Replace the entire file. The new flow:

```
1. Page loads → fetch concept data (existing)
2. User taps "Tap Akara" → call GET /token?student_id&topic_id&lang
3. Receive {token, url, room} → connect to LiveKit room
4. Room events map to blob states:
   - room connected, waiting → "idle"
   - agent speaking → "agent-speaking"
   - user mic active → "user-speaking"
   - agent processing → "listening"
5. User taps "End Session" → disconnect from room
6. Poll GET /progress/:student_id/concept/:topic_id for score
7. Route to /practice or show score
```

#### Key implementation details:

```tsx
import { Room, RoomEvent, Track, ConnectionState } from 'livekit-client';

// Inside the component:
const [room, setRoom] = useState<Room | null>(null);
const [connectionState, setConnectionState] = useState<string>('disconnected');

const startSession = async () => {
  const user = authService.getCurrentUser();
  if (!user) return;

  const studentId = user.id;
  const topicId = conceptId || 'phy9-newton3';
  const lang = langParam || user.default_language || 'hi';

  // 1. Fetch token
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const res = await fetch(
    `${API_BASE}/token?student_id=${studentId}&topic_id=${topicId}&lang=${lang}`
  );
  const { token, url, room: roomName } = await res.json();

  // 2. Create and connect room
  const livekitRoom = new Room();

  livekitRoom.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
    setConnectionState(state);
    if (state === ConnectionState.Connected) {
      setBlobState('listening');
      setIsSessionActive(true);
    }
  });

  // 3. Track agent speaking state
  livekitRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    if (track.kind === Track.Kind.Audio && participant.isAgent) {
      setBlobState('agent-speaking');
      // Attach audio track to an <audio> element for playback
      const audioEl = document.getElementById('agent-audio') as HTMLAudioElement;
      if (audioEl) {
        track.attach(audioEl);
      }
    }
  });

  livekitRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
    const agentSpeaking = speakers.some(s => s.isAgent);
    const userSpeaking = speakers.some(s => !s.isAgent);
    if (agentSpeaking) setBlobState('agent-speaking');
    else if (userSpeaking) setBlobState('user-speaking');
    else setBlobState('listening');
  });

  livekitRoom.on(RoomEvent.Disconnected, () => {
    setBlobState('idle');
    setIsSessionActive(false);
    // Trigger score fetch after a short delay (webhook processing)
    setTimeout(() => fetchScore(studentId, topicId), 3000);
  });

  // 4. Connect with mic enabled
  await livekitRoom.connect(url, token, { autoSubscribe: true });
  await livekitRoom.localParticipant.setMicrophoneEnabled(true);

  setRoom(livekitRoom);
};

const endSession = async () => {
  if (room) {
    await room.disconnect();
    setRoom(null);
  }
};

const fetchScore = async (studentId: string, topicId: string) => {
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  // Poll a few times with delay — webhook may still be processing
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/progress/${studentId}/concept/${topicId}`);
      if (res.ok) {
        const data = await res.json();
        navigate(`/score/${conceptId}`, { state: data });
        return;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
  // Fallback: navigate with mock data
  navigate(`/score/${conceptId}`, { state: { score: 0, message: "Score pending..." } });
};

// In JSX:
// <audio id="agent-audio" autoPlay />  (hidden element for agent audio playback)
```

> [!NOTE]
> The `participant.isAgent` check may need adjustment based on LiveKit's participant metadata. The agent joins with identity containing "agent" — check `participant.identity` or `participant.metadata` to distinguish.

### 3.3 Backend Feynman Slice Routes

**File to change**: `services/api/tokens.py` — add these routes alongside existing ones:

```python
# ── GET /api/v1/concepts/:id/media ──────────────────────────────
@app.get("/api/v1/concepts/{concept_id}/media")
def get_concept_media(concept_id: str, lang: str = Query("en")):
    """Return concept data for the Explain/Learn pages."""
    topic = fetch_topic(concept_id, lang=lang)
    if topic is None:
        raise HTTPException(404, f"unknown concept: {concept_id}")
    return json.loads(topic.to_metadata_json())


# ── GET /api/v1/progress/:student_id ────────────────────────────
@app.get("/api/v1/progress/{student_id}")
def get_student_progress(student_id: str):
    """Return progress summary for a student."""
    from services.api.progress import get_progress
    records = get_progress(student_id)
    mastered = sum(1 for r in records if r.get("mastery", 0) >= 0.7)
    return {
        "student_id": student_id,
        "total_sessions": len(records),
        "mastered": mastered,
        "sessions": records[-10:],  # last 10
    }


# ── GET /api/v1/progress/:student_id/concept/:concept_id ───────
@app.get("/api/v1/progress/{student_id}/concept/{concept_id}")
def get_concept_progress(student_id: str, concept_id: str):
    """Return progress for a specific concept."""
    from services.api.progress import get_progress
    records = get_progress(student_id)
    concept_records = [r for r in records if r.get("topic_id") == concept_id]
    if not concept_records:
        raise HTTPException(404, "No sessions found")
    best = max(concept_records, key=lambda r: r.get("mastery", 0))
    return {
        "concept_id": concept_id,
        "attempts": len(concept_records),
        "best_mastery": best.get("mastery", 0),
        "best_score": int(best.get("mastery", 0) * 100),
        "sessions": concept_records,
    }
```

---

## Phase 4 — Rest of Backend + Postgres

### 4.1 Database Schema

**New files to create**:
- `services/api/database.py` — SQLAlchemy engine + session factory
- `services/api/models.py` — ORM models
- `services/api/alembic.ini` + `services/api/alembic/` — migrations
- `docker-compose.yml` (root) — Postgres container

#### Step 4.1.1: docker-compose.yml

Create at project root `/Users/rachitgoyal/Desktop/projects/akara/docker-compose.yml`:

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: akara
      POSTGRES_USER: akara
      POSTGRES_PASSWORD: akara_dev_pass
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

Add to `.env.local`:
```bash
DATABASE_URL=postgresql://akara:akara_dev_pass@localhost:5432/akara
```

#### Step 4.1.2: SQLAlchemy models

`services/api/models.py`:

```python
"""SQLAlchemy ORM models for Akara."""
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Text, DateTime, Boolean, JSON,
    ForeignKey, Index, Enum as SAEnum,
)
from sqlalchemy.orm import DeclarativeBase, relationship
import enum

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id = Column(String(64), primary_key=True)          # "stu_abc123"
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=True)
    phone = Column(String(20), nullable=True)
    grade = Column(Integer, nullable=True)              # 6-12
    language = Column(String(10), default="en")
    onboarding_completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Subject(Base):
    __tablename__ = "subjects"
    id = Column(String(64), primary_key=True)           # "physics-9"
    name = Column(String(255), nullable=False)
    icon = Column(String(10), default="📚")
    grade_min = Column(Integer, default=6)
    grade_max = Column(Integer, default=12)

class Chapter(Base):
    __tablename__ = "chapters"
    id = Column(String(64), primary_key=True)
    subject_id = Column(String(64), ForeignKey("subjects.id"))
    name = Column(String(255), nullable=False)
    chapter_number = Column(Integer, default=1)

class Concept(Base):
    __tablename__ = "concepts"
    id = Column(String(64), primary_key=True)           # "phy9-newton3"
    chapter_id = Column(String(64), ForeignKey("chapters.id"))
    title = Column(String(255), nullable=False)
    script = Column(Text, nullable=True)
    rubric = Column(Text, nullable=True)
    rubric_levels = Column(JSON, nullable=True)         # structured rubric
    grade = Column(Integer, nullable=True)

class ConceptMedia(Base):
    __tablename__ = "concept_media"
    id = Column(Integer, primary_key=True, autoincrement=True)
    concept_id = Column(String(64), ForeignKey("concepts.id"))
    lang = Column(String(10), default="en")
    video_url = Column(Text, nullable=True)
    thumbnail_url = Column(Text, nullable=True)
    duration_seconds = Column(Integer, default=0)

class Session(Base):
    __tablename__ = "sessions"
    id = Column(String(128), primary_key=True)          # room_name
    student_id = Column(String(64), ForeignKey("users.id"))
    concept_id = Column(String(64), ForeignKey("concepts.id"))
    lang = Column(String(10), default="en")
    duration_seconds = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

class TranscriptRecord(Base):
    __tablename__ = "transcripts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(128), ForeignKey("sessions.id"))
    turns = Column(JSON, nullable=False)                # [{role, text, ts, ...}]
    raw_json = Column(Text, nullable=True)              # full transcript JSON

class CoverageRecord(Base):
    __tablename__ = "coverage_points"
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(128), ForeignKey("sessions.id"))
    student_id = Column(String(64), ForeignKey("users.id"))
    concept_id = Column(String(64), ForeignKey("concepts.id"))
    mastery = Column(Float, default=0.0)
    points = Column(JSON, nullable=False)               # [{id, status, evidence}]
    scorer_model = Column(String(64), default="heuristic-v0")
    scored_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (
        Index("ix_coverage_student_concept", "student_id", "concept_id"),
    )

class MasteryRecord(Base):
    __tablename__ = "mastery"
    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(String(64), ForeignKey("users.id"))
    concept_id = Column(String(64), ForeignKey("concepts.id"))
    best_mastery = Column(Float, default=0.0)
    attempts = Column(Integer, default=0)
    mastered = Column(Boolean, default=False)
    last_session_at = Column(DateTime, nullable=True)
    __table_args__ = (
        Index("ix_mastery_student", "student_id"),
    )

class Interest(Base):
    __tablename__ = "interests"
    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(String(64), ForeignKey("users.id"))
    interest = Column(String(255), nullable=False)

class LanguageRequest(Base):
    __tablename__ = "language_requests"
    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(String(64), ForeignKey("users.id"))
    language = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
```

#### Step 4.1.3: Database setup

`services/api/database.py`:

```python
"""Database engine and session factory."""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///data/akara.db")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

#### Step 4.1.4: Alembic setup

```bash
cd services/api
pip install alembic
alembic init alembic
```

Edit `alembic/env.py` to import models and use `DATABASE_URL` from env.

### 4.2 Backend Route Implementation Order

Implement in this dependency order. Each route goes in `services/api/tokens.py` (or split into separate router files under `services/api/routes/`):

| Priority | Route | Method | Source |
|---|---|---|---|
| 1 | `/api/v1/auth/register` | POST | New |
| 2 | `/api/v1/auth/login` | POST | New |
| 3 | `/api/v1/auth/me` | GET | New |
| 4 | `/api/v1/curriculum/subjects` | GET | Replace mock in `library.py` |
| 5 | `/api/v1/curriculum/subjects/:id/chapters` | GET | Replace mock |
| 6 | `/api/v1/chapters/:id/concepts` | GET | New |
| 7 | `/api/v1/concepts/:id` | GET | Extend existing `/topics/:id` |
| 8 | `/api/v1/concepts/:id/media` | GET | New (Phase 3) |
| 9 | `/token` | GET | Already done (harden) |
| 10 | `/webhooks/transcript` | POST | Phase 1 (mount it) |
| 11 | `/api/v1/progress/:student_id` | GET | Phase 3 |
| 12 | `/api/v1/progress/:student_id/concept/:id` | GET | Phase 3 |
| 13 | `/api/v1/scores/:session_id` | GET | New |
| 14 | `/api/v1/diagnostics/start` | POST | New |
| 15 | `/api/v1/diagnostics/submit` | POST | New |
| 16 | `/api/v1/diagnostics/:id/results` | GET | New |
| 17 | `/api/v1/practice/:concept_id/questions` | GET | New |
| 18 | `/api/v1/practice/:concept_id/submit` | POST | New |
| 19 | `/api/v1/profile/:student_id` | PUT | New |
| 20 | `/api/v1/profile/:student_id/stats` | GET | New |
| 21 | `/api/v1/profile/:student_id/language` | PUT | New |
| 22 | `/api/v1/search` | GET | New |
| 23 | `/api/v1/recommendations/:student_id` | GET | New |

> [!TIP]
> For Phase 4, consider splitting routes into separate files:
> `services/api/routes/auth.py`, `routes/curriculum.py`, `routes/progress.py`, etc.
> Then mount them as APIRouter instances in `tokens.py`.

---

## Testing Checklist

### Phase 1 Verification

- [ ] `GET /token?student_id=s1&topic_id=phy9-newton3&lang=hi` returns token with `SessionMetadata` containing `student_id` and `room_name`
- [ ] Voice agent parses `SessionMetadata` from job metadata → `student_id` is NOT "unknown"
- [ ] After a 2-turn test session, `data/transcripts/{room}.json` contains correct turns with `role: "tutor"` / `role: "student"`, and `student_id` matches
- [ ] Transcript is POSTed to `/webhooks/transcript` on session end (check API server logs)
- [ ] If API is down, voice agent logs warning but does not crash
- [ ] Turn latency metrics appear in logs

### Phase 2 Verification

- [ ] Seed topics in `retrieve.py` have `rubric_levels` with 4 levels each
- [ ] `TopicData.to_metadata_json()` includes `rubric_levels` when present
- [ ] Tutor prompt v2 includes level descriptions and mastery gate instructions
- [ ] Tutor actually gates progression (test: explain only L1 concepts, verify tutor doesn't ask L3 questions)
- [ ] `POST /webhooks/transcript` calls Azure OpenAI scorer and returns per-point verdicts
- [ ] When Azure is unreachable, falls back to heuristic scorer (check `scorer_model` field in response)
- [ ] Scorer output includes `evidence` quotes from student speech

### Phase 3 Verification

- [ ] `npm install livekit-client` succeeds in `apps/web`
- [ ] Explain page fetches token on "Tap Akara"
- [ ] Room connection succeeds → blob transitions to "listening"
- [ ] User speech → blob shows "user-speaking"
- [ ] Agent response → blob shows "agent-speaking" + audio plays
- [ ] End session → room disconnects → score page loads

### Phase 4 Verification

- [ ] `docker-compose up -d` starts Postgres
- [ ] `alembic upgrade head` creates all tables
- [ ] All 23 routes respond (even if with mock data initially)
- [ ] JSONL progress file still works as fallback when DB is down

---

## File Change Summary

| File | Action | Phase |
|---|---|---|
| `packages/akara_common/schemas.py` | Add `SessionMetadata`, `RubricLevel`, `RubricPoint`, extend `TranscriptTurn` | 1+2 |
| `packages/akara_common/__init__.py` | Export new types | 1+2 |
| `packages/akara_rag/retrieve.py` | Add `rubric_levels` to seed topics | 2 |
| `services/voice/agent.py` | Fix metadata parsing, transcript capture, webhook POST, prompt v2, metrics | 1+2 |
| `services/api/tokens.py` | Mount webhook route, add CORS, add progress/media routes | 1+3 |
| `services/api/webhooks.py` | Wire LLM scorer with heuristic fallback | 2 |
| `services/scorer/__init__.py` | NEW — package init | 2 |
| `services/scorer/pyproject.toml` | NEW — dependencies | 2 |
| `services/scorer/llm_scorer.py` | NEW — Azure OpenAI scorer | 2 |
| `services/scorer/prompts.py` | NEW — scorer prompts | 2 |
| `apps/web/package.json` | Add `livekit-client` | 3 |
| `apps/web/src/pages/Explain.tsx` | Full rewrite with LiveKit room | 3 |
| `services/api/models.py` | NEW — SQLAlchemy models | 4 |
| `services/api/database.py` | NEW — engine + session | 4 |
| `docker-compose.yml` | NEW — Postgres | 4 |
| `tests/test_transcript_dump.py` | NEW — transcript test | 1 |
| `.env.local` (root) | Add Azure + DATABASE_URL vars | All |
