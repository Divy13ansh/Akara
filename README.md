# Akara — Watch. Explain. Learn.

Feynman voice loop + Manim explainer library for NCERT grades 6-12.
Start with `docs/archive/pending.md` (current status + what's left), then
`docs/getting-started/onboarding.md` and `docs/architecture/architecture.md`.

## Status (2026-09-14)

**Backend + database are COMPLETE and running under a single
`docker compose up`.** Frontend exists as a designed SPA still reading mocks —
wiring it to the API is the only remaining feature work (`docs/archive/pending.md §2`).

## Layout
- `apps/web/` — React SPA + nginx (user-facing, `http://localhost`)
- `services/api/` — FastAPI: auth, curriculum, library, concepts, progress, webhooks
- `services/worker/` — arq jobs: LLM scoring, on-demand quiz/flashcard generation
- `services/video/` — Manim + Azure TTS 5-stage render pipeline → R2 → callback
- `services/voice/` — LiveKit agent worker (Socratic Feynman tutor)
- `services/stt/` — vendored VEXYL-STT server (AI4Bharat IndicConformer)
- `packages/akara_db/` — SQLAlchemy models + syllabus.json (catalog source of truth)
- `packages/akara_common/` — TopicData / Transcript / Coverage contracts
- `packages/akara_rag/` — offline NCERT retrieval (gold topics)
- `infra/` — deploy/observability notes
- `docs/` — build docs (`pending.md` = start here for handoff)

## Quickstart
```sh
cp .env.example .env.local   # see docs/operations/secrets.md for which keys to generate
docker compose up -d --build
# app: http://localhost · API docs: http://localhost:8000/docs
```
