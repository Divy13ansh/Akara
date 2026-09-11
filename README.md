# Akara — Watch. Explain. Learn.

Feynman voice loop for NCERT grades 9-12.

## Layout
- `agent/` — LiveKit voice agent worker (STT/LLM/TTS session)
- `server/` — FastAPI token server (`/token`), pre-session FAISS lookup goes here
- `rag/` — offline NCERT retrieval (chunk + embed + FAISS), no hot-path tool
- `scoring/` — async end-of-session scorer (transcript + rubric -> mastery)
- `shared/` — shared schemas (TopicData etc.)
- `scripts/` — run helpers
- `tests/` — pytest
- `data/` — gitignored NCERT raws + indices
- `docs/` — architecture notes

## Run (skeleton only, no logic yet)
```sh
cp .env.example .env.local
uv sync
```
