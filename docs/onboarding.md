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

## What exists right now

Only the **voice loop skeleton** is live. Everything else is placeholders:

| Area | Status | Location |
|---|---|---|
| Voice worker (LiveKit) | skeleton, working test prompt existed | `services/voice/agent.py` |
| Token server | TODO skeleton | `services/api/tokens.py` |
| Offline RAG | TODO skeleton | `packages/akara_rag/retrieve.py` |
| Scorer | TODO skeleton | `services/voice/scorer.py` |
| Shared contract | `TopicData` dataclass only | `packages/akara_common/schemas.py` |
| Video pipeline | 5-stage Manim + Neural TTS engine | `services/video/` |
| Web UI | README only | `apps/web/` |

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
cp .env.example .env.local   # fill LIVEKIT_URL/KEY/SECRET
uv sync
pytest
```

To run voice (once implemented):

```sh
uv run --project services/voice python services/voice/agent.py dev
uv run --project services/api uvicorn services.api.tokens:app --reload
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
