# Backend ↔ Frontend API Mapping & Single-Command Stack

Two things are recorded here:

1. **VEXYL-STT is now a first-class compose service** — `docker compose up` runs the
   entire product, voice STT included. HF token requirement spelled out (§1).
2. **Every endpoint in `apps/web/backend-endpoints.md` is mapped against the live
   backend** — what's wired, what deviates, what's not mapped (§2/§3).

Verified live on 2026-09-14: 13/13 pytest, ruff clean, full stack up, STT health +
real WebSocket PCM→transcript roundtrip.

---

## 1. VEXYL-STT in the single `docker compose up`

### What changed

| Piece | Where | Notes |
|---|---|---|
| STT server code | `services/stt/vexyl_stt_server.py` | Vendored from `projects-explore/vexyl-stt` (single-file WebSocket server, Apache-2.0) |
| License | `services/stt/LICENSE.vexyl-stt` | Upstream Apache-2.0, kept verbatim |
| Image | `services/stt/Dockerfile` + `entrypoint.sh` | CPU torch, downloads the model **at container start** into the `stt_models` volume |
| Compose service | `stt` in `docker-compose.yml` | Default profile — runs with plain `docker compose up` |
| Voice wiring | `voice` service env | `VEXYL_STT_HOST=stt` (previously `host.docker.internal` — the host-run `./run.sh` is no longer needed) |

The repo is now **self-contained**: nothing outside it is required to run the whole
product. The old flow (`cd ../vexyl-stt && ./run.sh`) still works for local dev but
is no longer part of the stack.

### ⚠️ HuggingFace token — REQUIRED on a fresh VPS

The model (`ai4bharat/indic-conformer-600m-multilingual`, ~2.4GB) is a **gated**
HuggingFace repo. On any machine whose `stt_models` volume is empty, the `stt`
container downloads it on first boot and **requires**:

```bash
# .env.local
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxx   # token with read access to the gated repo
```

Setup on a fresh VPS:

1. Request access at https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual
2. Create a read token at https://huggingface.co/settings/tokens
3. Put `HF_TOKEN=...` in `.env.local` (`.env.example` documents this)
4. `docker compose up -d` — watch `docker compose logs -f stt`; first boot
   downloads ~2.4GB (5–15 min), then loads the model (~25s on CPU) and serves
   `ws://stt:8091`. Later boots are cache hits (volume persists across rebuilds).

If the token is missing/invalid the container exits with an explicit message
telling you exactly which repo to unlock — it does not silently retry.

GPU VPS: set `VEXYL_STT_DEVICE=cuda` in `.env.local` (falls back to `cpu`).

The local Mac already had the model in `~/.cache/huggingface` and a valid token;
`HF_TOKEN` was added to `.env.local` (user-approved) and validated against the
gated repo before writing.

### Verified live

- `GET :8091/health` → 200 (`{"model_loaded": true, ...}`)
- Real roundtrip: macOS `say` Hindi audio → 16kHz PCM → WebSocket stream →
  `{"type":"final","text":"...","lang":"ml-IN"}`. Note: IndicConformer's built-in
  language-ID can mislabel synthetic TTS audio (it detected Malayalam script for
  Hindi speech); real student audio performs better, and the plugin overrides
  language per session anyway.

---

## 2. Endpoint mapping — `apps/web/backend-endpoints.md` ↔ backend

Legend: ✅ mapped and verified · 🟡 mapped with deviation · ❌ not mapped

### Auth (§1)

| Contract | Backend | Verdict |
|---|---|---|
| `POST /api/auth/login` → `{token, user{...}}` | `routers/auth.py::login` — bcrypt verify, rate-limited, `last_login_at` updated | ✅ exact shape |
| `POST /api/auth/signup` → 201 `{token, user{...}}` | `routers/auth.py::signup` — 409 on duplicate email, `onboarding_completed=false` | ✅ exact shape |
| `POST /api/auth/google` (GIS id_token) | `routers/auth.py::google_auth` — verifies Google JWKS signature against `GOOGLE_CLIENT_ID`, auto-creates user with `google_id`/picture, upsert-on-login | ✅ exact shape (`{id_token, provider}` accepted) |

### Profile & onboarding (§2, §3.1)

| Contract | Backend | Verdict |
|---|---|---|
| `GET /api/users/me/profile` | `routers/users.py::get_profile` — all contract fields incl. `onboarding_completed` | ✅ |
| `PATCH /api/users/me/profile` (class+lang ⇒ completed) | `patch_profile` — implements the exact business rule, 6≤class≤12 validated | ✅ |

### Curriculum (§3.2–3.4)

| Contract | Backend | Verdict |
|---|---|---|
| `GET /api/curriculum/subjects?class=` | `routers/curriculum.py::get_subjects` — `Query(alias="class")`, per-class chapters/concepts, per-user `mastered_concepts`; Science only for 6–10 (physics/chemistry/biology/maths for 11–12, seeded from syllabus.json) | ✅ |
| `GET /api/curriculum/subjects/:sid/chapters?class=` | `get_chapters` — `chapter_number`, per-user mastery counts | ✅ |
| `GET /api/curriculum/subjects/:sid/chapters/:cid` | `get_chapter_detail` — concepts with `status` (locked/available/mastered) | ✅ concept IDs are DB-canonical (`sci10-chemical-reactions-...` style), **not** the mock's `c1/c2/c3` |

### Library (§8)

| Contract | Backend | Verdict |
|---|---|---|
| `GET /api/library/summary` | `routers/library.py::summary` — all 5 keys incl. `coverage_tiers` (full≥12, high≥8, moderate≥4, low) | ✅ |
| `GET /api/library/concepts?q=&subject=` | `concepts` — search + filter + per-user `student_progress` overlay; `available_languages` from complete `concept_media` rows | ✅ |
| `GET /api/library/hierarchy?subject=` | `hierarchy` — sections → domains → concepts | ✅ |

### Progress & diagnostics (§6)

| Contract | Backend | Verdict |
|---|---|---|
| `GET /api/progress/summary` | `routers/progress.py::summary` — `{concepts_mastered, concepts_to_revisit, active_days_this_week}` (Mon–Sun from sessions ∪ heartbeats) | ✅ |
| `GET /api/progress/learning-map` | `learning_map` — touched concepts only, grouped by subject, `needs-revisit` from misconceptions | ✅ (adds `last_session_at` — additive) |
| `GET /api/diagnostics/misconceptions` | `routers/diagnostics.py::list_misconceptions` — all contract fields incl. `actionable_hint`, `severity`, `status` | ✅ |
| `POST /api/diagnostics/:id/resolve` | `resolve` — ownership-checked, `{success, diagnostic_id, status:"resolved"}` | ✅ |

### Profile extras (§7)

| Contract | Backend | Verdict |
|---|---|---|
| `GET/PUT /api/users/me/interests` | `routers/users.py` — set-replace, 30 max | ✅ |
| `GET /api/languages/demand` | `routers/languages.py::demand` — `{language, nativeScript, requestedCount}` | ✅ |
| `POST /api/languages/request` | `request_language` — monthly dedup (UNIQUE user+lang+month), ticket `BATCH-LANG-*`, rate-limited | ✅ |
| `GET/PATCH /api/users/me/preferences` | `get/patch_preferences` — `data_saver_mode` | ✅ |
| `GET /api/users/me/offline-chapters` | `get_offline_chapters` — `downloaded_chapters` + `total_storage_used_mb`, camelCase fields | ✅ |
| `DELETE /api/users/me/offline-chapters/:id` | `delete_offline_download` | ✅ |
| `POST /api/users/me/offline-chapters` | `create_offline_download` — **addition** (contract only lists GET/DELETE); client should call it after caching a chapter | 🟡 additive, needed for GET to return anything |

### Concept learning (§9)

| Contract | Backend | Verdict |
|---|---|---|
| `GET /api/concepts/:cid/generation-status?lang=` | `routers/concepts.py` — `instant / generating_first_time / queued + progress_percent + current_stage + eta`, Redis-cached 2s, D-6 auto-trigger, D-16 render-slot cap, stale-job sweep | ✅ |
| `GET /api/concepts/:cid/media` | `media` — video URL (R2), `script{full_transcript, summary_bullets, key_definitions, ncert_summary}`, `scene_graph`, `quiz`, `mentor_prompt` | ✅ shape; `scene_graph`/`quiz`/`summary_*` are populated by `scripts/backfill_concept_quizzes.py` (LLM cost — run when ready; until then `quiz: []`, `scene_graph: null`) |
| `POST /api/concepts/:cid/evaluate-explanation` | `routers/explanations.py` — heuristic sync score + async LLM refinement (D-15), full contract response shape | ✅ `diagnostic_resolved` now actually resolves open misconceptions on mastery (was hardcoded `false`) |
| `POST /api/concepts/:cid/mark-mastered` | `mark_mastered` — **addition** beyond the contract doc; D-9 server-gated (409 without proof) | 🟡 additive, used by the constellation's "Mark as Mastered" |

### Backend-only routes (not in the frontend contract — intentional)

| Route | Purpose |
|---|---|
| `POST /webhooks/transcript` (`WEBHOOK_SECRET`) | Voice worker pushes live-session transcripts → arq scoring |
| `POST /internal/render-callback` (`WEBHOOK_SECRET`) | Video service signals render completion → R2 URL persisted |
| `GET /token` | Legacy LiveKit token mint for pre-JWT voice flow |
| `POST /api/activity/heartbeat`, `GET /api/activity/calendar` | Streak calendar (not yet in the frontend doc) |
| `GET /health` | Compose healthcheck |

---

## 3. What is NOT mapped (action items)

1. **Frontend still reads mocks** — `api.ts`, `progressData.ts`, `libraryData.ts`,
   `conceptMediaService.ts`, `profilePreferences.ts`, `languageDemandService.ts`,
   `diagnosticData.ts` simulate responses. The backend for every one of those
   calls exists and is contract-shaped; the pages just don't call it yet
   (except the Google button, which is wired). This is the next phase of work.
2. **Quiz / scene-graph content** — schema + backfill script ready
   (`scripts/backfill_concept_quizzes.py`) but rows are empty until you run it
   (Azure OpenAI cost per concept×language).
3. **Offline downloads** — backend tracks registrations; nothing on the frontend
   actually caches media files yet.
4. **Session token rotation / refresh tokens** — contract §1.1 mentions
   `sessions`/`refresh_tokens` tables; we mint stateless JWTs (24h) and don't
   persist sessions server-side. Fine for MVP; add refresh flow when needed.
5. **`profile_photo` uploads** — Google picture is stored as a URL; there's no
   upload endpoint (contract only implies Google-provided photos, so OK).

---

## 4. Runbook deltas (single command)

```bash
cp .env.example .env.local         # fill: HF_TOKEN + the secrets you already have
docker compose up -d --build       # web api worker video stt postgres redis
docker compose logs -f stt         # first boot: model download (~2.4GB, one-time)
# voice (optional):
docker compose --profile voice up -d --build
```

Health: `http://localhost/healthz` (nginx→api), `http://localhost:8091/health` (STT).
