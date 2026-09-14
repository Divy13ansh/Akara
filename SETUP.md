# Akara — Setup, Run & Test Commands

## 0. Prereqs

- Python `>=3.11`, [`uv`](https://docs.astral.sh/uv/), Docker Desktop, Node `20+`, `openssl`
- Verify: `python --version && uv --version && docker --version && node --version`

## 1. Clone + env (repo root)

```sh
cp .env.example .env.local
openssl rand -hex 32   # → paste as JWT_SECRET in .env.local
openssl rand -hex 32   # → paste as WEBHOOK_SECRET in .env.local
```

Minimum `.env.local` to boot:

```sh
JWT_SECRET=<from-openssl>
WEBHOOK_SECRET=<from-openssl>
HF_TOKEN=hf_...   # REQUIRED: gated ai4bharat/indic-conformer (~2.4GB, first stt boot)
DATABASE_URL=postgresql+psycopg://akara:akara@localhost:5432/akara
ASYNC_DATABASE_URL=postgresql+asyncpg://akara:akara@localhost:5432/akara
REDIS_URL=redis://localhost:6379/0
```

Full features (see `docs/operations/secrets.md`): `LIVEKIT_URL/KEY/SECRET`, R2
(`R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET/MEDIA_CDN_BASE`),
Azure OpenAI (`AZURE_OPENAI_ENDPOINT/AZURE_API_KEY/AZURE_OPENAI_DEPLOYMENT`),
Azure Speech (`AZURE_SPEECH_KEY/AZURE_SPEECH_REGION`), `GOOGLE_CLIENT_ID`.

Frontend env (`apps/web/.env`, vite dev only):

```sh
VITE_API_BASE=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=<...>.apps.googleusercontent.com
```

## 2. Run the full stack

```sh
docker compose up -d --build            # web+api+worker+video+stt+postgres+redis
docker compose --profile voice up -d    # + LiveKit voice worker
docker compose ps
docker compose logs -f api              # first boot seeds catalog from packages/akara_db/syllabus.json
docker compose logs -f stt              # first boot downloads model; wait for "model ready"
```

URLs: app **http://localhost** · API docs `http://localhost:8000/docs` ·
video `http://localhost:8001/health` · STT `http://localhost:8091/health`

## 3. DB: migrate / reseed

```sh
uv sync
uv run alembic upgrade head                       # after schema changes (NOT auto-run)
uv run python scripts/seed_curriculum.py && uv run python scripts/seed_gold_topics.py   # manual reseed (wipes catalog, keeps users)
```

## 4. Smoke-test the API

```sh
curl -X POST http://localhost:8000/api/auth/signup -H "Content-Type: application/json" -d "{\"name\":\"Test\",\"email\":\"t@t.com\",\"password\":\"password123\"}"
export TOKEN=<token-from-above>

curl http://localhost:8000/api/users/me/profile -H "Authorization: Bearer $TOKEN"
curl "http://localhost:8000/api/curriculum/subjects?class=10" -H "Authorization: Bearer $TOKEN"
curl http://localhost:8000/api/library/summary -H "Authorization: Bearer $TOKEN"
curl http://localhost:8000/api/progress/summary -H "Authorization: Bearer $TOKEN"
curl -X POST http://localhost:8000/api/activity/heartbeat -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"minutes\":1}"
# pick a real concept id from the library, then:
curl "http://localhost:8000/api/concepts/<concept_id>/generation-status?lang=hi" -H "Authorization: Bearer $TOKEN"
curl "http://localhost:8000/api/concepts/<concept_id>/media?lang=hi" -H "Authorization: Bearer $TOKEN"
curl "http://localhost/token?student_id=<user_id>&topic_id=<concept_id>&lang=hi" -H "Authorization: Bearer $TOKEN"
```

## 5. Frontend dev

```sh
npm --prefix apps/web install
npm --prefix apps/web run dev        # http://localhost:3000 (needs VITE_API_BASE=http://localhost:8000)
npm --prefix apps/web run lint       # tsc --noEmit
npm --prefix apps/web run build
```

## 6. Backend tests + lint

```sh
uv sync
pytest -q
pytest tests/test_api.py tests/test_contracts.py tests/test_scorer.py -q
ruff check .
```

## 7. Troubleshoot

| Symptom | Fix |
|---|---|
| `relation "subjects" does not exist` | `uv run alembic upgrade head` |
| nginx 502 on `/api/*` after recreating api | `docker compose up -d --build web` |
| TTS "Azure Speech key or region not set" | set `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` |
| R2 callback 404 | `X-Webhook-Secret` must match; echo render `video_id` |
| genstatus stuck `pending` >20min | auto-swept on next poll; poll again to re-trigger |

Stop: `docker compose down` (add `-v` to wipe pgdata/stt model cache).
