# Akara — Watch. Explain. Learn.

Feynman voice loop + Manim explainer library for NCERT grades 9-12.
Start with `docs/onboarding.md`, then `docs/architecture.md`.

## Layout
- `services/voice/` — LiveKit voice worker (the only live service right now)
- `services/api/` — `/token`, library, progress, webhooks
- `services/video/` — Manim pipeline (disconnected, future)
- `packages/akara_common/` — `TopicData` contract
- `packages/akara_rag/` — offline NCERT retrieval
- `apps/web/` — learner UI (future)
- `data/` — gitignored NCERT raws + FAISS indices
- `infra/` — deploy/observability notes
- `docs/` — extensive build docs

## Quickstart (skeleton)
```sh
cp .env.example .env.local
uv sync
pytest
```
