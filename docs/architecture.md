# Architecture

## Why a monorepo with voice as one service

Akara has three deployables with conflicting deps:

- `voice`: `livekit-agents`, realtime audio, low-latency
- `video`: Manim CE, ffmpeg, torch, batch rendering (360 vids/day homelab)
- `api`: FastAPI, FAISS reads, token minting

One flat `agent/ server/ rag/` layout forces one env and blurs ownership.
So: `services/*` = independently deployable, `packages/*` = shared logic,
`apps/*` = frontends. Voice is just `services/voice`, not the whole repo.

```
apps/web/  (picker + player + "Explain back" button)
   | HTTPS only
services/api/  (tokens, library, progress, webhooks)
   | job metadata JSON      | transcript.json
services/voice/ (agent.py <-> scorer.py)
   | LiveKit RTC
student microphone
```

Shared: `packages/akara_common` (TopicData), `packages/akara_rag` (FAISS read).

## Sequence (happy path)

```
1. web -> GET /token?student_id=s1&topic_id=newton3&lang=hi
2. api: FAISS lookup topic_id -> TopicData{topic,script,rubric,grade,subject,lang}
3. api: mint LiveKit token, embed TopicData as job metadata
4. web joins LiveKit room
5. voice worker (rtc_session) parses metadata, builds Socratic prompt
6. AgentSession starts: VAD -> STT -> LLM -> TTS loop
7. on_leave: dump transcript.json + turn latencies
8. POST /webhooks/transcript -> scorer.py (async, non-blocking)
9. scorer writes coverage JSON -> progress.py -> GET /progress/s1
```

## Key decisions (current)

1. **Hybrid models for now.** STT is already open-weight (VEXYL-STT,
   self-hosted — see `vexyl-stt.md`). TTS remains hosted
   `cartesia/sonic-3`, tutor LLM hosted Gemma — swap to open weights before
   YuvAI submission. Constructors isolated in `agent.py` so swap is 3 lines.
   Details: `open-weights.md`.
2. **Offline retrieval.** No RAG tool in voice loop. RAG runs pre-session
   (`fetch_topic` reads gold topics from Postgres; FAISS fallback). Voice hot
   path is pure prompt + transcript. Saves 1.5-3s/turn.
3. **Two-tier scoring.** Lightweight sync heuristic on submit (instant
   feedback) + heavy LLM judge in the arq worker (auditable mastery).
   Neither blocks audio. Details: `scoring.md`.
4. **Full backend now exists** (Postgres + Redis + arq, 20 tables, JWT auth,
   rate limits, cache-aside) — `auth-traces-cost.md`'s "no user DB yet" note
   is historical. Video is wired via render-callback, no longer disconnected.
5. **One language rule:** explicit `?lang=` > profile `default_language` >
   `hi` — drives video rendering, quizzes, flashcards, doubts, and voice.

## What is NOT in the voice hot path (and why)

- VectorDB query: high p99, kills barge-in feel. Pre-resolve instead.
- Full rubric LLM-judge per turn: doubles token cost + latency. Do post-call.
- User DB writes: do async on webhook.

## Failure modes to design for

- STT mis-detects Hindi as English -> tutor answers in wrong language.
  Mitigate with explicit `lang` from picker passed through (see `multilingual.md`).
- Classroom noise -> VAD chatter. Mitigate with `ai_coustics` enhancement +
  tuned `min_silence`.
- Student silent / "I don't know" -> scaffold down, don't repeat the question.
- Metadata missing (local `lk agent console`) -> fallback DEFAULT_TOPIC_DATA.
