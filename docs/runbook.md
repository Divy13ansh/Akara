# Runbook

## Prereqs

Python >=3.11, `uv`, LiveKit Cloud project (or self-hosted), `.env.local`.

## Commands

```sh
cp .env.example .env.local
uv sync
pytest -q
ruff check .
```

Voice worker (once `agent.py` holds real code):

```sh
uv run --project services/voice python services/voice/agent.py dev
# console test (no metadata -> DEFAULT_TOPIC_DATA fallback):
lk agent console
```

API (once `tokens.py` implemented):

```sh
uv run --project services/api uvicorn services.api.tokens:app --reload --port 8000
curl "http://localhost:8000/token?student_id=s1&topic_id=phy9-newton3&lang=hi"
```

Video service (Manim CE + Neural TTS 5-stage pipeline):

```sh
uv run --project services/video uvicorn app.main:app --reload --port 8001
curl -X POST "http://localhost:8001/render" -H "Content-Type: application/json" -d '{"topic_id":"phy9-newton3","language":"hi"}'
```

## Repo map (what lives where)

| Path | Purpose | Deployable? |
|---|---|---|
| `services/voice/agent.py, scorer.py` | realtime loop + post scorer | yes (worker image) |
| `services/api/` | tokens/library/progress/webhooks | yes (API image) |
| `services/video/` | Manim + Neural TTS 5-stage pipeline | yes (video worker image) |
| `packages/akara_common/` | TopicData | no (lib) |
| `packages/akara_rag/` | FAISS offline read | no (lib) |
| `apps/web/` | UI (empty) | yes, later |
| `data/raw, data/indices` | NCERT + FAISS (gitignored) | data volume |
| `infra/` | deploy notes | n/a |
| `docs/` | you are here | n/a |

## Definition of done (current phase)

- [ ] `agent.py` runs end-to-end Hindi + English + Hinglish test calls
- [ ] `lang` threaded picker -> metadata -> STT/TTS (no hardcoded `hi`)
- [ ] `/token` returns LiveKit token + TopicData for 3 seed topics
- [ ] `transcript.json` dumped per room + `coverage.json` scored async
- [ ] Cost line logged per session, OTel traces visible
