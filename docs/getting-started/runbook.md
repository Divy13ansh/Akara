# Runbook

## Prereqs

Python >=3.11, `uv`, Docker Desktop, `.env.local` (see `.env.example` for every key).

## Single-command stack (primary flow — plan §3c)

```sh
docker compose up -d                      # web+api+worker+video+stt+postgres+redis
docker compose --profile voice up -d      # + LiveKit voice worker (uses the `stt` service)
```

- App: **http://localhost** (nginx serves the SPA and proxies same-origin `/api`)
- API docs: http://localhost:8000/docs · video: http://localhost:8001/health · STT: http://localhost:8091/health
- **HF_TOKEN in .env.local is required for `stt` on a fresh VPS** — the gated
  IndicConformer model downloads on first boot into the `stt_models` volume
  (~2.4GB, one-time). Details: docs/architecture/backend-api-mapping.md §1.
- Boot does the right thing automatically: api/worker verify the schema and
  seed the FULL NCERT catalog from `packages/akara_db/syllabus.json` when the
  DB is empty (advisory-lock guarded, safe with 4 uvicorn workers + arq).
- Migrations are NOT auto-run: `uv run alembic upgrade head` after schema changes.
- Manual reseed (wipes catalog + dependent rows, keeps users):
  `uv run python scripts/seed_curriculum.py && uv run python scripts/seed_gold_topics.py`

## Local dev (per-service)

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

API (dev without docker):

```sh
uv run uvicorn services.api.main:app --reload --port 8000
curl "http://localhost:8000/token?student_id=s1&topic_id=phy11-newton3&lang=hi"
```

Video service (Manim CE + Neural TTS 5-stage pipeline):

```sh
uv run --project services/video uvicorn app.main:app --reload --port 8001
curl -X POST "http://localhost:8001/render" -H "Content-Type: application/json" -d '{"topic_id":"phy11-newton3","language":"hi"}'
```

## Repo map (what lives where)

| Path | Purpose | Deployable? |
|---|---|---|
| `services/api/` | auth, curriculum, library, concepts, progress, webhooks, internal | yes (api/worker image) |
| `services/worker/` | arq scoring queue consumer (D-15) | yes (same image) |
| `services/scorer/` | LLM scorer + heuristic fallback | yes (same image) |
| `services/voice/agent.py` | LiveKit realtime loop | yes (`--profile voice`) |
| `services/video/` | Manim + Neural TTS 5-stage pipeline → R2 → callback | yes (video image) |
| `services/stt/` | VEXYL-STT server (vendored, Apache-2.0) — model cached in `stt_models` volume | yes (stt image) |
| `packages/akara_db/` | SQLAlchemy models + syllabus.json (catalog source of truth) | no (lib) |
| `packages/akara_common/` | TopicData / Transcript / Coverage schemas | no (lib) |
| `packages/akara_rag/` | DB-backed gold topics + seed fallback | no (lib) |
| `apps/web/` | React SPA + nginx `/api` proxy | yes (web image) |
| `scripts/` | seed_curriculum / seed_gold_topics / seed_if_empty / backfill_quizzes | run in containers |
| `alembic/` | migrations (initial: 20 tables) | `alembic upgrade head` |
| `data/raw, data/indices` | NCERT + FAISS (gitignored) | data volume |
| `infra/` | deploy notes | n/a |
| `docs/` | you are here | n/a |

## Single-VPS production deploy

Minimum sizing: **4 vCPU / 8 GB RAM / 60 GB disk**. (STT model ~2.4 GB,
video image with TeX + Indic fonts ~2 GB, Manim renders spike CPU.)
A GPU is optional — STT runs on CPU (`VEXYL_STT_DEVICE=cpu`).

```sh
# 1. DNS: point https://akara.example.com at the VPS.
# 2. Env:
cp .env.example .env.local   # fill JWT_SECRET (openssl rand -hex 32),
                             # WEBHOOK_SECRET, GOOGLE_CLIENT_ID, Azure/R2/LiveKit keys
                             # + append https://akara.example.com to WEB_ORIGIN
# 3. TLS in front (Google GIS + LiveKit require https off-localhost).
#    Caddy one-liner on the host (or any reverse proxy):
#    akara.example.com { reverse_proxy localhost:80 }
# 4. Firewall: only 22/80/443 public —
sudo ufw allow 22,80,443/tcp && sudo ufw enable
# 5. Boot with the prod overlay (unpublishes 5432/6379/8000/8001/8091):
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose exec -T api alembic upgrade head     # migrations are NOT auto-run
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile voice up -d --build voice
```

- First boot takes a while: STT downloads ~2.4 GB once into `stt_models`
  (watch `docker compose logs stt`), api seeds the NCERT catalog when empty.
- Google Cloud Console → OAuth client → Authorized JavaScript origins must
  include `https://akara.example.com` (GIS refuses plain http in prod).
- Backups: `docker compose exec -T postgres pg_dump -U akara akara | gzip >
  backup-$(date +%F).sql.gz` (nightly cron; keep R2 creds to re-pull media).
- Updates: `git pull && docker compose … up -d --build && docker compose exec -T
  api alembic upgrade head`. Volumes (`pgdata`, `video_outputs`, `stt_models`)
  survive rebuilds.
- Boot refuses to start with a missing/default `JWT_SECRET` or missing
  `WEBHOOK_SECRET` — by design, so a misconfigured VPS fails loud, not open.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `relation "subjects" does not exist` on boot | run `uv run alembic upgrade head` |
| genstatus stuck `pending` for >20 min | auto-swept as stale on next poll; if the video container was recreated mid-render, poll once more to re-trigger |
| nginx 502 on `/api/*` after recreating api | fixed via nginx `resolver 127.0.0.11`; rebuild web (`docker compose up -d --build web`) |
| TTS fails "Azure Speech key or region not set" | set `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` (compose defaults region to `eastus`) |
| R2 callback 404 | ensure `X-Webhook-Secret` matches on both sides; render job id must be echoed by `/explain` (`video_id` field) |

## Definition of done (current phase)

- [x] DB (20 tables, Alembic) + full NCERT catalog seeding from syllabus.json
- [x] Auth (signup/login/Google) + JWT + profile/onboarding
- [x] Curriculum/library/progress/diagnostics/activity/language-demand read APIs
- [x] Webhook → async scoring → coverage → mastery → prereq unlock
- [x] generation-status gate + render trigger + R2 upload + render callback
- [x] evaluate-explanation (sync heuristic + async LLM refine) + mark-mastered (D-9 gate)
- [x] On-demand quiz/flashcards/scene-graph generation (render-callback + /media triggers)
- [x] Profile photo upload to R2 · doubts chat endpoint · language propagation (profile default)
- [x] VEXYL-STT as compose service (`stt`) + voice worker registered with LiveKit Cloud
- [ ] Frontend rewiring off mocks — the ONLY remaining feature work (docs/archive/pending.md §2)
