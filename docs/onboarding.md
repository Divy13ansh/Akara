# Onboarding — read this first

You are building **Akara: Watch. Explain. Learn.** A student watches a short
Manim explainer, then proves understanding by explaining it back out loud
(Feynman technique). A Socratic voice tutor probes gaps in Hindi / English /
code-switched Hinglish.

## Who this is for

Indian government-school students, grades 9-12, Physics / Chemistry / Maths /
Biology under NCERT. Rural classrooms, noisy audio, cheap phones, Hindi or a
regional language often more natural than English. YuvAI requires open-source
LLMs as hero/sidekick.

## What exists right now (2026-09-14)

The **entire backend + database are built and running** (see `docs/pending.md`).
Only frontend wiring remains:

| Area | Status | Location |
|---|---|---|
| Database (20 tables, full NCERT catalog: 2,027 concepts / 239 chapters) | ✅ live | `packages/akara_db/` + `scripts/seed_curriculum.py` |
| API (auth, curriculum, library, concepts, progress, webhooks) | ✅ live | `services/api/` |
| Worker (LLM scoring + on-demand quiz/flashcards) | ✅ live | `services/worker/` |
| Voice worker (LiveKit, VEXYL-STT) | ✅ registered, needs browser client | `services/voice/agent.py` |
| STT server | ✅ compose service | `services/stt/` |
| Video pipeline (Manim + Azure TTS → R2 → callback) | ✅ E2E verified | `services/video/` |
| Web UI | ✅ built, 🔴 still reads mocks | `apps/web/` |

## How the loop works (30 seconds)

```
web picks {topic_id, lang}
 -> api/tokens.py mints LiveKit token + looks up TopicData
 -> LiveKit room starts with metadata JSON {topic, script, rubric}
 -> services/voice/agent.py runs AgentSession[VAD, STT, LLM, TTS]
 -> student explains, tutor asks ONE gap-targeted question per turn
 -> room ends -> transcript.json -> scorer.py -> coverage JSON -> progress.py
```

No RAG tool and no Score tool inside the voice hot path. That is deliberate
(see `architecture.md`).

## Setup for a new dev

```sh
cp .env.example .env.local   # which keys to generate: docs/secrets.md
docker compose up -d --build # web+api+worker+video+stt+postgres+redis
# app: http://localhost · API docs: http://localhost:8000/docs
```

Voice (optional profile — uses the `stt` compose service):

```sh
docker compose --profile voice up -d --build voice
```

## Where to go next

1. `architecture.md` — why monorepo, service boundaries, sequence diagram
2. `voice-loop.md` — AgentSession config, prompt, turn-taking, known bug
3. `data-contracts.md` — TopicData, transcript, score JSON shapes
4. `rag-ncert.md` — what to chunk/embed/index from NCERT 6-12
5. `scoring.md` — live signals + post-call judge (better than LLM-vibes)
6. `multilingual.md` — STT/TTS language passthrough, Hinglish
7. `open-weights.md` — hybrid now, compliant swap later
8. `auth-traces-cost.md` — minimal auth + OTel + cost/min
9. `video-pipeline.md`, `frontend.md` — disconnected futures
