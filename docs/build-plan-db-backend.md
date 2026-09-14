# Build Plan — Database first, then Backend (frontend contract)

> Status of inputs when this plan was written: frontend built (all mock services),
> video pipeline built (5-stage, local disk), voice pipeline built (LiveKit +
> webhook → scorer → JSONL). Nothing DB-related exists yet. This plan takes the
> repo from that state to: **Docker Postgres + `packages/akara_db` + full REST API
> matching `apps/web/backend-endpoints.md` + R2 video delivery + DB-backed
> scoring/mastery** — backend only (frontend keeps its mocks this phase).

## 0. Decisions locked (planning session, 2026-09-14)

| # | Decision | Choice |
|---|---|---|
| D-1 | Concept ID scheme | **Backend IDs win**: `{subject}{grade}-{slug}` (e.g. `phy11-newton3`). Frontend `cr-01`-style IDs retired; a mapping table is kept in the seed for future frontend rewiring. |
| D-2 | Curriculum seed source | **Backend owns the NCERT data.** Full catalog (subjects → chapters → concepts) is seeded server-side and later fetched by the frontend; the frontend hardcoded catalog becomes a client cache, not the source of truth. |
| D-3 | MVP content scope | 3 chapters + the gold Newton topic: **Chemical Reactions and Equations** (sci10), **Real Numbers** (math10), **Laws of Motion** (phy11, home of `newton3` + `inertia`). Gold scripts/rubrics live on those concepts; everything else is catalog rows. |
| D-4 | DB stack | **Docker Postgres 16 + SQLAlchemy 2.0 (async, asyncpg) + Alembic**, shared package `packages/akara_db`. |
| D-5 | Video storage | **Cloudflare R2 now.** boto3 S3-API upload from the video worker; DB stores keys; public URL = `MEDIA_CDN_BASE + "/" + key`. |
| D-6 | Render trigger | **Auto-trigger, but prerequisite-gated.** `generation-status` may only trigger a render when the student has *unlocked* the concept (prereq chain completed). Locked concepts get a `locked` response — matching the frontend, which never opens the popup for locked nodes. |
| D-7 | Quiz / mind-map / mentor-prompt authoring | **LLM backfill script** per (concept, lang) derived from `concepts.script`, writing `concept_quizzes` rows; runnable independently of video renders. |
| D-8 | Activity tracking | **New `daily_activity` table** + `POST /api/activity/heartbeat`; `/progress/summary` and the profile calendar read from it. |
| D-9 | "Mark as Mastered" | **New gated endpoint** — succeeds only when a real coverage record ≥ threshold exists for that user+concept (server-verified, per `docs/database.md`). |
| D-10 | Google OAuth | **Wire it for real.** Verify Google `id_token` server-side (`google-auth`); user provides `GOOGLE_CLIENT_ID`. |
| D-11 | Phase scope | **Backend only.** No frontend service rewiring this phase. |
| D-12 | Language demand board | **Starts at zero.** Counts grow only from real `POST /api/languages/request`. |

### D-14…D-19 — multi-user & performance decisions (second planning round)

| # | Decision | Choice |
|---|---|---|
| D-14 | Redis | **Docker Redis 7** (`redis:7-alpine`) in docker-compose, same code path as future managed Redis (redis-py). Powers caches, render lock, rate limits, job queue. |
| D-15 | Scoring queue | **arq** (async Redis task queue): webhook returns `202` after persisting the immutable transcript; a separate worker process runs Azure scoring with a concurrency cap + retries. Survives API restarts. |
| D-16 | Render concurrency | **1 concurrent Manim render**; everything else queues as `pending` with queue position surfaced via generation-status. |
| D-17 | Video URLs | **Public CDN URLs** (`MEDIA_CDN_BASE + key`, public-read bucket) per `docs/database.md`. |
| D-18 | Scale target | **One classroom pilot**: ~30–60 concurrent students, few hundred total users. Pool sizes, rate limits, and caches tuned to this. |
| D-19 | Deployment | **Single VPS** eventually (API + Postgres + Redis; render box stays the homelab). Everything kept in docker-compose so `compose up` ≈ the deployment. |

### D-13 (decided): rename the gold topic IDs

The gold seeds `phy9-newton3` / `phy9-inertia` (grade "9") are renamed for grade
consistency with D-3 (they live in the class-11 Laws of Motion chapter):

- `phy9-newton3` → **`phy11-newton3`**, `phy9-inertia` → **`phy11-inertia`** (script/rubric content unchanged; `grade` becomes `"11"`)
- `math10-quadratic` unchanged (quadratic-equations is class-10 maths; catalog-only, gold content still seeded)

Touches: `packages/akara_rag/retrieve.py`, `services/voice/agent.py`
(`DEFAULT_TOPIC_DATA`), `tests/test_api.py`, `tests/test_contracts.py`.
Done as part of Phase 1 seed work. Zero real data exists, so it's a rename in
three files plus their tests.

Note for demos: the demo student's class decides visibility. Class 10 → Science +
Maths (chemical-reactions, real-numbers). Class 11 → Physics/Chem/Bio/Maths
(laws-of-motion). Demo accounts should pick the class matching what you're showing.

---

## 1. Schema: 20 tables (19 from `docs/database.md` + 1 addition)

Follow `docs/database.md` as written, with these deltas:

1. **`concepts.topic_name TEXT NOT NULL`** — the topic-group label the frontend
   constellation and library need (e.g. `"Chemical Equations & Balancing"`).
   Display-only grouping; `order_index` orders concepts inside the group. Without
   this column the constellation's `TopicGroup[]` shape cannot be served.
2. **New table `daily_activity`** (D-8):
   `user_id TEXT FK→users`, `date DATE`, `minutes INT DEFAULT 0`,
   PK `(user_id, date)`, plus index `(user_id, date DESC)`. Heartbeat endpoint
   upserts (`minutes = minutes + delta` or absolute set — heartbeat sends delta).
3. **`users.created_at` doubles as `joined_date`** for the frontend profile
   (`.date()` at the API layer). No new column.
4. **`language_requests` seeds empty** (D-12). `UNIQUE (user_id, language, month)`
   gives the `alreadyRequested` dedup; demand counts = `GROUP BY language`.
5. Everything else exactly per `docs/database.md`: users, user_preferences,
   subjects, chapters, concepts, concept_media, video_render_jobs,
   concept_quizzes, sessions, transcripts, transcript_turns, rubric_points,
   coverage_points, user_concept_mastery, misconceptions, user_interests,
   language_requests, offline_downloads, provider_costs.

Package layout:

```
packages/akara_db/
  __init__.py
  base.py            # async engine/session factory, Base, get_session()
  enums.py           # status enums (media, mastery, coverage, severity, ...)
  models/
    identity.py      # users, user_preferences
    curriculum.py    # subjects, chapters, concepts
    media.py         # concept_media, video_render_jobs, concept_quizzes
    learning.py      # sessions, transcripts, transcript_turns, rubric_points,
                     # coverage_points, user_concept_mastery, misconceptions
    misc.py          # user_interests, language_requests, offline_downloads,
                     # provider_costs, daily_activity
```

Alembic lives at repo root (`alembic.ini` + `alembic/versions/0001_initial.py`),
running on the sync URL; the app uses the async URL.

Env additions (`.env.example`):

```
DATABASE_URL=postgresql+psycopg://akara:akara@localhost:5432/akara        # alembic + scripts
ASYNC_DATABASE_URL=postgresql+asyncpg://akara:akara@localhost:5432/akara  # app
REDIS_URL=redis://localhost:6379/0                                        # caches, locks, arq queue
JWT_SECRET=change-me
GOOGLE_CLIENT_ID=
WEBHOOK_SECRET=            # shared secret for voice-worker → API webhook + video → API callback
VIDEO_SERVICE_URL=http://video:8001   # compose-internal hostname (http://localhost:8001 when running the video service bare on the host)
WEB_ORIGIN=http://localhost:3000,http://localhost   # CORS allow-list (comma-separated; irrelevant when served through the compose nginx)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=akara-media
MEDIA_CDN_BASE=            # e.g. https://cdn.akara.example (custom domain or public r2.dev URL)
```

## 2. Seed data (D-2, D-3)

### 2.1 Canonical ID convention

`{subject_prefix}{grade}-{slug}`, subject prefixes: `sci` (Science 6–10),
`math`, `phy`, `chem`, `bio`. Slugs are short kebab-case. Examples:

| Frontend ID (retired) | Canonical ID | Chapter |
|---|---|---|
| cr-01 | `sci10-word-equations` | chemical-reactions |
| cr-02 | `sci10-balancing-equations` | chemical-reactions |
| cr-03 | `sci10-conservation-mass` | chemical-reactions |
| cr-04 | `sci10-combination-reactions` | chemical-reactions |
| cr-05 | `sci10-decomposition-reactions` | chemical-reactions |
| cr-06 | `sci10-displacement-reactions` | chemical-reactions |
| cr-07 | `sci10-double-displacement` | chemical-reactions |
| cr-08 | `sci10-redox-reactions` | chemical-reactions |
| cr-09 | `sci10-corrosion-rusting` | chemical-reactions |
| cr-10 | `sci10-rancidity-antioxidants` | chemical-reactions |
| rn-01 | `math10-euclid-lemma` | real-numbers |
| rn-02 | `math10-euclid-algorithm` | real-numbers |
| rn-03 | `math10-divisibility-applications` | real-numbers |
| rn-04 | `math10-fundamental-theorem` | real-numbers |
| rn-05 | `math10-hcf-lcm` | real-numbers |
| rn-06 | `math10-irrational-numbers` | real-numbers |
| rn-07 | `math10-decimal-expansions` | real-numbers |
| (gold) | `phy11-newton3` | laws-of-motion |
| (gold) | `phy11-inertia` | laws-of-motion |
| (new) | `phy11-*` ×7 more | laws-of-motion (9 concepts, matching frontend `total_concepts`) |

The seed script emits the **complete** mapping (all ~40 ported concepts across all
chapters/subjects) to `docs/id-map.md` so future frontend rewiring is mechanical.

### 2.2 Seed scripts

1. **`scripts/seed_curriculum.py`** — subjects (science, maths, physics,
   chemistry, biology with class_min/class_max), all chapters from the frontend
   catalog (12 science, 14 maths, 9 physics, 8 chemistry, 9 biology), and all
   ported concepts with: name, short_description, domain, topic_name (topic
   group), order_index, prerequisite_id (full chains from `constellationData.ts`
   + `libraryData.ts`), ncert_citation. `script`/`rubric`/`rubric_levels` NULL
   except MVP concepts. Idempotent (upsert by id).
2. **`scripts/seed_gold_topics.py`** — syncs `akara_rag.SEED_TOPICS` into
   `concepts.script/rubric/rubric_levels` + flattens into `rubric_points` rows
   (composite PK `(concept_id, id)`), for `phy11-newton3`, `phy11-inertia`,
   `math10-quadratic`.
3. **`scripts/seed_demo_state.py`** (optional, behind a flag) — a demo user with
   plausible mastery/misconception rows matching the frontend mock data, for
   visually complete demos.

### 2.3 `akara_rag` becomes DB-backed

`fetch_topic(topic_id, lang)` reads `concepts` (script, rubric, rubric_levels)
from Postgres first; falls back to the in-memory seed dict when the DB is empty
or unreachable (keeps `lk agent console` + existing tests green). Same signature,
callers unchanged.

---

## 3. Phase 1 — DB + Redis foundation

1. `docker-compose.yml` (repo root): `postgres:16-alpine` (db `akara`, user
   `akara`, port 5432, named volume) **and `redis:7-alpine`** (port 6379,
   append-only off — pure cache/queue, disposable).
2. `packages/akara_db` models per §1; register the workspace member (already
   covered by `packages/*` glob). Engine: one shared async engine per process,
   `pool_size=10 / max_overflow=20 / pool_pre_ping=True` (D-18 sizing).
3. Alembic init + `0001_initial` migration.
4. Run the three seed scripts.
5. **Checkpoint:** `docker compose up -d && alembic upgrade head && uv run
   scripts/seed_curriculum.py` → psql shows 20 tables, ~5 subjects, ~50 chapters,
   ~40+ concepts, 3 gold concepts with rubric_points; `redis-cli ping` → PONG.
   Existing pytest still green.

### 3b. Concurrency architecture (cross-cutting, applies to Phases 3–5)

Everything below lives in Redis, **never in process memory** — the API runs
multiple uvicorn workers (planned: `uvicorn --workers 4` on the VPS), so
process-local state would silently break under D-18.

| Concern | Mechanism | Key / pattern |
|---|---|---|
| Render stampede dedup | distributed lock | `lock:render:{concept_id}:{lang}` = `SET NX PX 600000`; holder creates the job, losers attach to it and poll |
| Render concurrency cap (D-16) | arq job + worker `max_jobs=1` for the render queue; API-side pending rows carry `queue_position` = count of pending jobs ahead |
| Global content cache | cache-aside + TTL | `cache:curriculum:{class}`, `cache:chapters:{subject}:{class}`, `cache:library:summary`, `cache:library:hierarchy`, `cache:media:{concept}:{lang}` — TTL 10 min, invalidated by seed scripts + render callback |
| Per-user cache | short TTL + write-invalidation | `cache:mastery:{user_id}` TTL 60s; invalidated in the mastery transaction; progress/summary reads hit this |
| generation-status | cache + short TTL | `cache:genstatus:{concept}:{lang}` TTL 2s, written by render callback + status reader |
| Rate limiting | fixed window | `rl:{route}:{ip}` `INCR` + `EXPIRE` — login 10/min, signup 5/min, evaluate 20/min, language-request 5/day per user, heartbeat 2/min |
| Scoring jobs (D-15) | arq queue `scoring` | webhook enqueues; worker `max_jobs=4`; job id = session id ⇒ retries no-op on duplicate |
| Idempotent webhook | DB unique + scored_at | `sessions.id = room_name` UNIQUE; scoring skips when `scored_at` already set |

Failure stance: Redis down ⇒ cache misses fall through to Postgres (slower but
correct); rate limiting fails open; render locks fall back to a Postgres
advisory lock (`pg_try_advisory_lock` on `hashtext(concept_id, lang)`). The arq
queue is the only hard dependency — if Redis is down the webhook still persists
the transcript and returns 202, and scoring drains once Redis returns
(`transcripts` rows without `scored_at` are re-enqueued by a startup sweep).

### 3c. Runtime topology — single `docker compose up` (D-19)

One command boots the whole app. Dev topology = prod topology on the VPS.

```
                        http://localhost (nginx, port 80)
  ┌─────────────────────────────────────────────────────────────┐
  │  web:  apps/web built SPA served by nginx                   │
  │        /            → static dist (SPA fallback)            │
  │        /api/*       → proxy_pass http://api:8000            │  (no CORS needed)
  └─────────────────────────────────────────────────────────────┘
        │ /api                        │ outbound WSS
        ▼                             ▼
  ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐   ┌─────────────┐
  │ api (8000)    │  │ worker (arq)  │  │ video (8001)     │   │ voice       │
  │ FastAPI ×4 wrk│→ │ scoring queue │  │ Manim 5-stage    │   │ LiveKit     │
  └───────┬───────┘  └───────┬───────┘  │ → uploads to R2  │   │ agent worker│
          │                  │          └──────────────────┘   └──────┬──────┘
          ▼                  ▼                                        ▼ outbound
  ┌───────────────┐  ┌───────────────┐                        LiveKit Cloud
  │ postgres:16   │  │ redis:7       │                        (+ VEXYL-STT,
  └───────────────┘  └───────────────┘                         external repo)
```

| Service | Image / build | Notes |
|---|---|---|
| `postgres` | postgres:16-alpine | named volume `pgdata`, healthcheck `pg_isready` |
| `redis` | redis:7-alpine | healthcheck `redis-cli ping` |
| `api` | new `services/api/Dockerfile` | entrypoint: `alembic upgrade head && python scripts/seed_if_empty.py && uvicorn services.api.main:app --workers 4` — seeds are idempotent upserts, safe on every boot |
| `worker` | same image as `api` | command: `arq services.worker.main.WorkerSettings` |
| `video` | existing `services/video/Dockerfile` | **fix first**: it COPYs a `requirements.txt` that doesn't exist — generate it from `services/video/pyproject.toml`; `outputs/` volume |
| `web` | new multi-stage `apps/web/Dockerfile` | `node:20-alpine` build (`npm ci && npm run build`) → `nginx:alpine` serving `dist` with SPA fallback + `/api` proxy to `api:8000`; published on port 80 — **this is the only URL users touch** |
| `voice` | new `services/voice/Dockerfile` | compose **profile `voice`** (full loop = `docker compose --profile voice up`); kept out of the default `up` because it needs LIVEKIT creds + VEXYL-STT (separate repo, run on host or GPU box). `restart: unless-stopped` so it reconnects on LiveKit drops |

Ports published to host: web **80**, api 8000 (debug), video 8001 (debug),
postgres 5432 + redis 6379 (dev tooling only — do not publish on the VPS).

`docker compose up` after this plan = app at `http://localhost`, API docs at
`http://localhost:8000/docs`, seeds auto-applied, scoring worker live. Frontend
URL note: composed mode is same-origin `/api/...` (zero CORS config); Vite dev
mode still needs `WEB_ORIGIN` CORS on the API and `VITE_API_BASE` in the app.

Google OAuth config (GIS id_token flow per contract §1.3): **no redirect URI** —
register **Authorized JavaScript origins** instead: `http://localhost:3000`
(Vite dev), `http://localhost` (composed nginx), LAN IP if testing from phones,
`https://<domain>` for prod (GIS requires TLS outside localhost). Frontend
exception to D-11: wire the real GIS button + credential into
`Login.tsx`/`Signup.tsx` `handleGoogleAuth()` (~20 lines) so the endpoint is
end-to-end testable.

## 4. Phase 2 — Auth (`services/api`)

New `services/api/security.py` + `deps.py` + `routers/auth.py`:

- `POST /api/auth/signup` — name/email/password (bcrypt hash), 201, 409 on dup.
- `POST /api/auth/login` — 200 `{token, user}`, 401 on bad creds, updates
  `last_login_at`.
- `POST /api/auth/google` — verify `id_token` via `google-auth` (audience =
  `GOOGLE_CLIENT_ID`), upsert by `google_id`/email, auto-create on first login,
  return profile + `onboarding_completed` for routing. 501 if `GOOGLE_CLIENT_ID`
  unset.
- JWT access tokens (pyjwt, 7d expiry, no refresh table per `docs/database.md` §10).
- `get_current_user` dependency; CORS allow-list from env (`WEB_ORIGIN`).
- `GET/PATCH /api/users/me/profile` — onboarding rule: `class` ∈ 6–12 and
  `default_language` present ⇒ `onboarding_completed = true`.

**Checkpoint:** signup → login → patch onboarding → get profile via curl/httpx.

## 5. Phase 3 — Read endpoints (frontend data requirements)

`services/api/routers/` — every response shape copied from
`apps/web/backend-endpoints.md`:

| Router | Endpoints | Tables |
|---|---|---|
| `curriculum.py` | `GET /api/curriculum/subjects?class=` · `/subjects/:s/chapters` · `/subjects/:s/chapters/:c` | subjects, chapters, concepts, user_concept_mastery. Chapter detail returns the **nested topic-group shape** the constellation needs (`topics: [{name, concepts: [...]}]` derived by grouping on `topic_name`/`order_index`) |
| `library.py` | `GET /api/library/summary` · `/concepts?q=&subject=` · `/hierarchy` | concepts, chapters, subjects, concept_media (available_languages = langs with `status='complete'`), coverage tiers, user_concept_mastery + misconceptions cross-ref |
| `concepts.py` | `GET /api/concepts/:id/generation-status?lang=` · `GET /api/concepts/:id/media` | see §7 for the generation-status gate; media bundles video URL (`MEDIA_CDN_BASE + key`), duration, script, quiz, scene_graph, mentor_prompt from `concept_quizzes`, `available_languages` |
| `progress.py` | `GET /api/progress/summary` (concepts_mastered, to_revisit, active_days_this_week) · `/progress/learning-map` (touched concepts grouped by subject, diagnostic_insight inlined) | user_concept_mastery, sessions, daily_activity, misconceptions |
| `activity.py` | `POST /api/activity/heartbeat {minutes}` · calendar read (per-day minutes) | daily_activity |
| `diagnostics.py` | `GET /api/diagnostics/misconceptions` · `POST /api/diagnostics/:id/resolve` | misconceptions (+ joins for names) |
| `profile.py` | `GET/PUT /api/users/me/interests` (set-replace) · `GET/PATCH /api/users/me/preferences` · `GET/DELETE /api/users/me/offline-chapters` | user_interests, user_preferences, offline_downloads |
| `languages.py` | `GET /api/languages/demand` (GROUP BY, zero-start) · `POST /api/languages/request` (monthly dedup via `UNIQUE(user_id, language, month)`, ticket `BATCH-LANG-XXXXXXXX`) | language_requests |

All read endpoints sit behind the §3b cache layer: global curriculum/library/
media payloads are cache-aside with TTL + invalidation on seed/callback;
per-user overlays (mastery map, misconception flags) are 60s-TTL caches
invalidated by the mastery transaction. Cache misses must be single-round-trip
queries (the schema's indexes make them so).

**Checkpoint:** with a JWT you can walk the entire frontend surface (home →
subject → chapter constellation → library → progress → profile) against real data;
second identical request is served from Redis (verify with `MONITOR` or hit counts).

## 6. Phase 4 — Write paths (scoring → DB)

1. **`services/api/routers/webhooks.py` rewrite** — `POST /webhooks/transcript`
   (validates `WEBHOOK_SECRET` header) becomes **enqueue-only, returns `202`**
   (D-15):
   - upsert `sessions` (voice; `session_type='voice'`, id = room_name); if the
     session already exists with `scored_at` set ⇒ return 200 immediately
     (idempotent against the voice agent's 3× retry)
   - insert `transcripts.raw_json` (immutable) + `transcript_turns` (roles,
     per-turn latencies)
   - enqueue arq scoring job (id = session id); **no LLM call in the request**
   - `provider_costs` row written at enqueue time (metrics JSONB + `est_usd`
     from the pricing fn per `docs/auth-traces-cost.md`; extend the voice agent
     payload with usage metrics — it already sends per-turn latencies)
   - JSONL files stay as a debug side-channel for now.
2. **`services/worker/main.py`** — arq worker process (docker-compose service,
   `max_jobs=4`) running the scoring pipeline:
   - scorer (existing `llm_scorer` → heuristic fallback) with per-job timeout +
     3 retries
   - insert `coverage_points` (evidence + scorer_model), set `sessions.scored_at`
   - **mastery transaction** (`services/api/mastery.py`): `SELECT … FOR UPDATE`,
     atomic `best_mastery = GREATEST(best_mastery, :new)`, `attempts += 1`,
     status `mastered` if `best_mastery >= 0.7` else `learning`/`needs-revisit`,
     `mastered_at` on first crossing; flip prereq-gated dependents
     `locked → available`; invalidate `cache:mastery:{user_id}`
   - misconceptions: any `misconceived` point ⇒ upsert row (`needs_review`,
     severity from scorer); covering the same point in a later session ⇒
     auto-`resolved`
   - startup sweep: re-enqueue any session with a transcript but no `scored_at`
     (crash recovery)
3. **`POST /api/concepts/:id/evaluate-explanation`** — create `session`
   (`session_type='text'`, `explanation_text`), enqueue the same scoring job, and
   return the frontend shape from the **synchronous** heuristic scorer so the
   Explain screen gets instant feedback; when the arq LLM result lands it
   refines `coverage_points` + mastery (best-of wins). If this proves
   inconsistent in practice, the fallback is a 30s inline LLM call with a hard
   timeout — decide after dogfooding.
4. **`POST /api/concepts/:id/mark-mastered`** (D-9) — 200 only if a real
   coverage/mastery record ≥ threshold exists; 409 with reason otherwise.
   On success, same dependent-unlock logic as the webhook path.
5. Legacy `GET /token` (voice entry) — now also checks concept unlock +
   `concept_media` for the lang (soft warning only; voice works without video).

**Checkpoint:** end-to-end: voice session (or typed explanation) → webhook →
coverage rows → mastery bumped → misconception created → resolved on re-practice
→ visible via Phase-3 endpoints.

## 7. Phase 5 — Video ↔ R2 ↔ generation-status (D-5, D-6, D-16)

1. **`services/api/r2.py`** — boto3 S3 client (`R2_*` env), `public_url(key)`;
   transfer config tuned for ~50–200 MB MP4s (multipart, 8 MB chunks).
2. **Video worker completion hook** — after stitch succeeds: upload
   `videos/{concept_id}/{lang}/{video_id}/final.mp4` (+ poster frame via ffmpeg,
   + `audio.mp3`) with `Cache-Control: public, max-age=31536000, immutable`
   (D-17: public-read bucket, plain CDN URLs),
   then `POST {API}/internal/render-callback` (`WEBHOOK_SECRET`) with keys,
   duration, size, stage timings.
3. **`POST /internal/render-callback`** — update `video_render_jobs`
   (status/stage_timings/error) + `concept_media`
   (`complete`, keys, duration_seconds, size_bytes, completed_at); refresh
   `cache:genstatus:*` + `cache:media:*` and invalidate curriculum caches
   (available_languages changed); on failure release the render lock and mark
   media `failed` so the next status poll may retry (bounded: max 2 auto-retries
   per (concept, lang), then stay failed until manual re-trigger).
4. **generation-status gate** (exact behavior):
   - concept locked for this student (prereq not mastered) →
     `{status: "locked"}` (frontend never opens the popup anyway — belt and braces)
   - `concept_media` complete for (concept, lang) → `instant`, progress 100
   - job running → `processing`-style status with `current_stage`,
     `progress_percent` (stage-weighted from `stage_timings`),
     `est_seconds_remaining`
   - job queued behind the D-16 cap → same shape + `queue_position`
   - unlocked + nothing exists → **auto-trigger under the dedup lock** (§3b):
     lock `lock:render:{concept}:{lang}` → create `concept_media(pending)` +
     `video_render_jobs(pending)` → call video service `POST /explain`
     (topic_id, language; `topic` resolved from DB gold script) → return
     `generating_first_time`; concurrent callers attach to the same job and get
     identical progress. Lock TTL 10 min; video callback extends/releases it.
   - `available_languages` = langs with complete media
   - status reads served from `cache:genstatus:{concept}:{lang}` (2s TTL)
5. **`scripts/backfill_concept_quizzes.py`** (D-7) — per (concept, lang): LLM
   generates `quiz` (8–10 Qs), `scene_graph`, `summary`
   (summary_bullets/key_definitions/ncert_summary), `mentor_prompt` from
   `concepts.script`; upsert into `concept_quizzes`. Idempotent, `--concept`
   / `--lang` filters, runnable before any video exists. Batch mode also
   enqueues these as arq jobs so the VPS can churn through the catalog slowly
   instead of burst-hitting Azure.
6. Dub-reuse (`source_video_id`) is schema-ready but deferred to a later phase.

**Checkpoint:** request a fresh (concept, lang) on an unlocked concept → job row
appears → video renders → R2 object exists → callback flips media to complete →
`/media` returns a real CDN URL.

## 8. Phase 6 — Tests, docs, polish

- Test DB strategy: pytest fixtures create a throwaway database
  (`akara_test`) per run; transaction-rollback per test; seed minimal curriculum
  fixtures. No SQLite (JSONB semantics). Redis tests run against the compose
  Redis on a dedicated DB index (e.g. `/15`), flushed per test module.
- **Concurrency tests (new, from §3b):** two parallel generation-status calls
  create exactly one `video_render_jobs` row; duplicate webhook deliveries score
  once; parallel mastery updates never lose a bump (`GREATEST`); render callback
  invalidates caches; rate limits trip at configured thresholds.
- **Load smoke (D-18):** `locust` or a simple `asyncio`+`httpx` hammer — 60
  concurrent users walking home → subject → chapter → generation-status for 5
  minutes; assert p95 < 300 ms on cache-hit endpoints and zero duplicate render
  jobs. This is a smoke test for the pilot scale, not a full perf suite.
- New tests: models/migrations smoke, auth flow (incl. Google mock via
  unsigned-token rejection), curriculum shapes, generation-status gate matrix
  (locked / instant / processing / trigger), webhook → mastery → misconception
  pipeline, evaluate-explanation, mark-mastered gating (allow + deny),
  language-request dedup, offline downloads, heartbeat.
- Update `docs/database.md` (deltas from §1: topic_name, daily_activity, joined
  date note), `docs/runbook.md` (docker compose / alembic / seed / backfill
  commands), `.env.example`.
- `ruff check .` + `pytest -q` green; legacy tests updated for D-13 rename.

## 9. Service/API layout after this plan

```
services/api/
  main.py            # FastAPI app assembling all routers (tokens.py merged in)
  Dockerfile         # + entrypoint: alembic upgrade head && seed_if_empty && uvicorn --workers 4
  deps.py            # get_db, get_current_user, get_redis, webhook-secret guard
  security.py        # bcrypt, JWT, google id_token verify
  redis_client.py    # shared redis-py pool + cache/lock/ratelimit helpers
  cache.py           # cache-aside get/set/invalidate helpers used by routers
  mastery.py         # mastery transaction + prereq unlock (single source)
  r2.py              # R2 client + public_url
  video_client.py    # POST http://video:8001/explain trigger + internal callback
  costs.py           # pricing fn → est_usd
  routers/           # auth, curriculum, library, concepts, progress,
                     # activity, diagnostics, profile, languages, webhooks,
                     # internal
services/worker/
  main.py            # arq worker: scoring queue (D-15) + crash-recovery sweep
apps/web/Dockerfile  # multi-stage: node build → nginx (SPA + /api proxy to api:8000)
docker-compose.yml   # postgres, redis, api, worker, video, web(+profile voice)
```

docker-compose is the runtime (§3c): `postgres`, `redis`, `api`, `worker`,
`video`, `web` (nginx, port 80, the only user-facing URL), plus `voice` behind
the `voice` profile. The video render box = the same compose stack (homelab);
if rendering is later split onto its own machine, move only the `video` +
`worker` services and point `VIDEO_SERVICE_URL`/`DATABASE_URL` at the VPS over
WireGuard/tailnet — nothing else changes.

Estimated new/changed files: ~30 backend + 4 scripts + compose/alembic, plus
test files. Build order is strictly: **DB + Redis → auth → reads → writes →
video/R2 → tests/docs**, each phase ending in a runnable checkpoint.

## 10. Credentials & API keys needed from you

| Key | Where from | Needed by | Status |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | Google Cloud Console → OAuth client (Web). **No redirect URI** — GIS id_token flow: register Authorized **JavaScript origins**: `http://localhost:3000`, `http://localhost`, LAN IP for phone testing; `https://<domain>` for prod (GIS needs TLS off-localhost) | Phase 2 Google auth (D-10) | **you must provide** |
| `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=akara-media`, `MEDIA_CDN_BASE` | Cloudflare dash → R2 → Manage R2 API Tokens (Edit perms) + enable public access / custom domain | Phase 5 (D-5/D-17) | **you must provide** |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` | already used by the LLM scorer | Phase 4 scoring, Phase 5 quiz backfill | verify present in `.env.local` |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | already used by video TTS | Phase 5 renders | verify present |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | already used by tokens.py | Phase 4 `/token` | verify present |
| `JWT_SECRET`, `WEBHOOK_SECRET` | generate via `openssl rand -hex 32` | Phases 2/4/5 | generated, no action |
| `DATABASE_URL`, `ASYNC_DATABASE_URL`, `REDIS_URL`, `VIDEO_SERVICE_URL` | compose defaults | Phase 1 | none |

No other paid accounts this phase: Redis is the Docker container (D-14) and
Postgres runs in compose. When the VPS deployment happens, the only change is
pointing these same env vars at managed endpoints if you choose to.

## 11. Google OAuth — exact values to paste into Google Cloud Console

OAuth client (Web application). **Authorized JavaScript origins** (this flow has
no redirect URIs):

```
http://localhost:3000
http://localhost
http://<your-lan-ip>:3000      # if you'll test from phones on the LAN
https://<your-prod-domain>     # add when the VPS gets a domain + TLS
```

**Authorized redirect URIs: leave empty.** §1.3 contracts `POST /api/auth/google`
with an `id_token` — the GIS button runs in-page, nothing redirects. (Only if we
ever switch to the classic code flow would we add
`http://localhost:3000/auth/google/callback` + a client secret.)
