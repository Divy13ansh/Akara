# Akara Database Design (Postgres)

> Derived from: `docs/architecture/data-contracts.md` (TopicData / Transcript / Coverage),
> `apps/web/backend-endpoints.md` (full frontend contract), `docs/pipelines/video-pipeline.md`
> (5-stage pipeline + R2 push), `docs/pipelines/scoring.md` (auditable mastery),
> `docs/product/auth-traces-cost.md` (cost lines). Videos live in **Cloudflare R2**;
> the DB stores **object keys, never URLs** (see §R2).

## 0. Design rules

1. **One join key everywhere: `topic_id`** (aka `concept.id`). Video library, FAISS
   index, voice sessions, scores, curriculum all join on it — keep it stable.
2. **Raw artifacts are immutable.** `transcripts.raw_json` and transcript files are
   never mutated; derived tables (`coverage_points`) reference them.
3. **JSONB for volatile shapes, columns for queried fields.** Anything a dashboard
   filters/aggregates on (mastery, status, subject_id) is a real column; anything
   that is "write once, read whole" (scene graph, quiz, cost detail) is JSONB.
4. **Keys are `TEXT` with app-generated ids** (`usr_…`, `phy11-newton3`) following
   the canonical scheme `{subj}{class}-{slug}` (D-1). Auto-increment only for pure
   log rows.
5. **Every table gets `created_at`; mutable tables get `updated_at`.**

> **Implementation deltas (as built — `packages/akara_db/models.py`):**
> 20 tables (adds `daily_activity` for the watch-minutes heartbeat), `concepts.topic_name`
> column for the constellation's topic-group shape, chapter ids are `c{class}-{syllabus_id}`
> (syllabus ids collide across classes), and the catalog is seeded from
> `packages/akara_db/syllabus.json` by `scripts/seed_curriculum.py` (2,027 concepts,
> 239 chapters, 5 subjects) — not the frontend mock catalog. Gold topics:
> `phy11-inertia`, `phy11-newton3`, `math10-quadratic` (D-13 renames applied in the seeder).
> Migration history: `ad8f17b309e7` (initial 20 tables) + `94cc4063d201`
> (`concept_quizzes.generation_status`).

## 1. Entity overview (20 tables)

```
IDENTITY        curriculum                    PIPELINE (content)
users           subjects                      concept_media
(user_          chapters                      video_render_jobs
 preferences)   concepts ──────────────┐      concept_quizzes
                    ▲                  │
LEARNING        ____ │ ________________│____  USAGE (evidence)
sessions ◄──── /     │                ▼
transcripts          │           concept_media
transcript_turns     │
coverage_points ►────┤── rubric_points
user_concept_mastery │
misconceptions       │
                     │
PERSONALIZATION      │      COSTS
user_interests       │      provider_costs
language_requests ───┘
offline_downloads
```

## 2. Identity & profile

### `users`
| column | type | notes |
|---|---|---|
| id | TEXT PK | `usr_9872341` (matches frontend contract) |
| name | TEXT NOT NULL | |
| email | TEXT UNIQUE | nullable only if we ever do phone auth; unique where present |
| password_hash | TEXT | NULL for Google-only accounts |
| google_id | TEXT UNIQUE | Google `sub` claim; NULL for password accounts |
| profile_photo | TEXT | Google picture URL or R2 avatar key |
| class | SMALLINT | 6–12; NULL until onboarding step 1 |
| default_language | TEXT(10) | `hi`, `en`, …; NULL until onboarding step 2 |
| onboarding_completed | BOOL DEFAULT false | true when class+language both set |
| last_login_at | TIMESTAMPTZ | |
| created_at / updated_at | TIMESTAMPTZ | |

Indexes: `email` (unique), `google_id` (unique).
Auth endpoints affected: `/api/auth/login`, `/api/auth/signup`, `/api/auth/google`,
`GET|PATCH /api/users/me/profile`.

### `user_preferences`
One row per user; separate table so profile PATCHes don't contend.
| column | type | notes |
|---|---|---|
| user_id | TEXT PK FK→users | |
| data_saver_mode | BOOL DEFAULT false | Data Saver toggle |
| updated_at | TIMESTAMPTZ | |

## 3. Curriculum (mostly seed/admin-written, mirrors `akara_rag`)

### `subjects`
| column | type | notes |
|---|---|---|
| id | TEXT PK | `science`, `maths`, `physics` |
| name | TEXT | display name |
| code | TEXT(8) | `SCI`, `MATH` |
| description | TEXT | |
| icon | TEXT | emoji/illustration key |
| class_min / class_max | SMALLINT | 6–10 → Science; 11–12 → Physics/Chem/Bio/Maths |
| created_at | TIMESTAMPTZ | |

The "Science must NOT appear for classes 11–12" rule = `class_min <= :class <= class_max`.

### `chapters`
| column | type | notes |
|---|---|---|
| id | TEXT PK | `chemical-reactions` |
| subject_id | TEXT FK→subjects | |
| chapter_number | SMALLINT | NCERT chapter order |
| name | TEXT | |
| class | SMALLINT | 6–12 (NCERT splits Science at 10) |
| created_at | TIMESTAMPTZ | |

Index: `(subject_id, chapter_number)`.

### `concepts` ← **the central table; `id` == `topic_id`**
| column | type | notes |
|---|---|---|
| id | TEXT PK | `phy11-newton3`, `sci10-chemical-reactions` |
| chapter_id | TEXT FK→chapters | |
| subject_id | TEXT FK→subjects | denormalized for library filters |
| domain | TEXT | `Chemistry`, `Algebra`… (library hierarchy groups by this) |
| name | TEXT | |
| short_description | TEXT | library card text |
| ncert_citation | TEXT | "NCERT — Class 10 Science · Chapter … · Section …" |
| order_index | SMALLINT | position within chapter (constellation path) |
| class | SMALLINT | denormalized from chapter |
| script | TEXT | gold script — identical wording feeds Manim + tutor |
| rubric | TEXT | legacy flat rubric (video pipeline still consumes it) |
| rubric_levels | JSONB | `[{level, name, description, points[], mastery_threshold}]` |
| prerequisite_id | TEXT FK→concepts | NULL = unlocked root (constellation locks) |
| created_at / updated_at | TIMESTAMPTZ | |

Indexes: `chapter_id`, `subject_id`, unique `(chapter_id, order_index)`.

## 4. Video pipeline + R2 storage

### `concept_media` — **one row per (concept, language)**; this is what the
player streams and what `generation-status` reads.
| column | type | notes |
|---|---|---|
| id | BIGSERIAL PK | |
| concept_id | TEXT FK→concepts | the topic_id join |
| lang | TEXT(10) | `en`, `hi`, `mr`, … |
| status | TEXT | `pending` \| `processing` \| `complete` \| `failed` |
| current_stage | TEXT | `scene_planning` \| `manim_rendering` \| `script_generation` \| `tts` \| `stitching` \| NULL |
| progress_percent | SMALLINT DEFAULT 0 | drives the frontend % |
| est_seconds_remaining | SMALLINT | for the "Finishing the dub…" notice |
| error | TEXT | last failure reason |
| video_r2_key | TEXT | `videos/{concept_id}/{lang}/{video_id}/final.mp4` |
| thumbnail_r2_key | TEXT | `…/poster.jpg` |
| audio_r2_key | TEXT | `…/audio.mp3` (dub-only re-render reuse) |
| duration_seconds | SMALLINT | final muxed duration |
| size_bytes | BIGINT | for Data Saver + offline download accounting |
| source_video_id | TEXT | set when a lang variant was re-dubbed from an existing render |
| completed_at | TIMESTAMPTZ | |
| created_at / updated_at | TIMESTAMPTZ | |

**UNIQUE `(concept_id, lang)`** — the generation-status endpoint is:
`SELECT status, current_stage, progress_percent … WHERE concept_id=? AND lang=?`.

### `video_render_jobs` — one row per pipeline run (retries create new rows)
| column | type | notes |
|---|---|---|
| id | TEXT PK | `video_id` from `generate_video_id()` |
| concept_id | TEXT FK→concepts | NULL only for ad-hoc `topic` renders |
| lang | TEXT(10) | |
| media_id | BIGINT FK→concept_media | row this run will fulfill |
| status | TEXT | `pending` \| `processing` \| `complete` \| `failed` |
| current_stage | TEXT | mirrors the 5 stages |
| stage_timings | JSONB | `{scene_planning: 12.4, manim_rendering: 210.1, …}` |
| error | TEXT | |
| started_at / finished_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

Index: `(concept_id, lang, created_at DESC)` — "latest run wins" for status.

### `concept_quizzes` — script-derived quiz per (concept, lang)
| column | type | notes |
|---|---|---|
| id | BIGSERIAL PK | |
| concept_id | TEXT FK→concepts | |
| lang | TEXT(10) | |
| quiz | JSONB | `[{id, question, options[], correct_index, explanation}]` |
| scene_graph | JSONB | `{nodes[], edges[]}` for Mind Map mode |
| summary | JSONB | `{summary_bullets[], key_definitions[], ncert_summary, flashcards[{front,back}]}` |
| mentor_prompt | JSONB | `{scenario, question_text}` |
| generation_status | TEXT(16) | `ready` (default) \| `generating` \| `failed` — D-7 on-demand lifecycle marker |
| created_at | TIMESTAMPTZ | |

UNIQUE `(concept_id, lang)`. (Separate from `concept_media` so quizzes can be
regenerated without re-uploading video.) All four blobs together satisfy
`GET /api/concepts/:id/media` in one query.

**Generation is ON-DEMAND (D-7, token-saving):** rows are created when a video
render completes (render-callback enqueues `quiz_generation_task` on the arq
worker) or the first time `/media` is fetched without content. One Azure call
per (concept, lang), deduped; the row doubles as the dedup marker
(`generation_status='generating'` before the LLM call). Bulk backfill remains
available: `scripts/backfill_concept_quizzes.py --all`.

### Cloudflare R2 conventions
- **Bucket layout** (single bucket `akara-media`, keys are immutable):
  ```
  videos/{concept_id}/{lang}/{video_id}/final.mp4
  videos/{concept_id}/{lang}/{video_id}/poster.jpg
  videos/{concept_id}/{lang}/{video_id}/audio.mp3
  avatars/{user_id}/{uuid}.{ext}
  ```
- **DB stores keys only.** Public URL = `MEDIA_CDN_BASE + "/" + key`, where
  `MEDIA_CDN_BASE` is a Cloudflare custom domain or public dev URL from env.
  Changing bucket/domain later = one env var, zero migrations.
- **Write path**: `video_render_jobs` finishes → worker uploads to R2 via S3 API
  (boto3/r2) → `UPDATE concept_media SET status='complete', video_r2_key=…`.
  R2 put is idempotent per key, so a retry can re-upload safely.
- **Cache**: R2 keys are content-versioned by `video_id`, so set
  `Cache-Control: public, max-age=31536000, immutable`. Data Saver / offline mode
  uses `size_bytes` before fetching.
- **Access**: videos public-read via CDN domain; transcripts/scores never go to R2
  (they contain student voice data) — they stay in Postgres/disk.

## 5. Voice sessions & transcripts (immutable evidence)

### `sessions` — both voice (LiveKit) and typed (evaluate-explanation) runs
| column | type | notes |
|---|---|---|
| id | TEXT PK | = `room_name` for voice (`phy11-newton3-s1-1726…`) |
| session_type | TEXT | `voice` \| `text` |
| student_id | TEXT FK→users | |
| concept_id | TEXT FK→concepts | the topic_id |
| lang | TEXT(10) | requested language |
| dur_s | FLOAT | session duration |
| explanation_text | TEXT | typed answer for `text` sessions; NULL for voice |
| started_at / ended_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

Indexes: `(student_id, concept_id, created_at DESC)`, `(concept_id)`.

### `transcripts` — raw immutable JSON per session (voice only)
| column | type | notes |
|---|---|---|
| id | BIGSERIAL PK | |
| session_id | TEXT FK→sessions UNIQUE | one dump per room |
| raw_json | JSONB | the full webhook payload — never mutated |
| created_at | TIMESTAMPTZ | |

### `transcript_turns` — queryable turn rows (mirrors `TranscriptTurn`)
| column | type | notes |
|---|---|---|
| id | BIGSERIAL PK | |
| transcript_id | BIGINT FK→transcripts | |
| turn_index | SMALLINT | |
| role | TEXT | `tutor` \| `student` (system filtered out) |
| text | TEXT | never truncated before scoring |
| ts | FLOAT | offset seconds |
| stt_lang | TEXT | detected language |
| conf | FLOAT | STT confidence |
| stt_lat_ms / llm_ttft_ms / tts_ttfb_ms | INT | per-turn latencies (p50/p95 computed on read) |

Index: `(transcript_id, turn_index)`. Latency aggregates for
`auth-traces-cost.md` come from here, not from re-parsing JSON.

## 6. Scoring & mastery

### `rubric_points` — flattened `rubric_levels`, seeded from `akara_rag`
| column | type | notes |
|---|---|---|
| id | SMALLINT PK | point id from TopicData (1,2,3…) — scoped per concept below |
| concept_id | TEXT FK→concepts | |
| level | SMALLINT | 1–4 (NULL when topic only has flat rubric) |
| level_name | TEXT | `Recall`… |
| text | TEXT | |
| misconception | TEXT | explicit misconception text |
| mastery_threshold | REAL | per level |

PK `(concept_id, id)` — composite. Gives `coverage_points` a real FK target and
lets teachers audit "what was the student scored against" at any time.

### `coverage_points` — one row per (session, rubric point) verdict
| column | type | notes |
|---|---|---|
| id | BIGSERIAL PK | |
| session_id | TEXT FK→sessions | |
| concept_id | TEXT FK→concepts | denormalized |
| student_id | TEXT FK→users | denormalized |
| rubric_point_id | SMALLINT | + concept_id → FK to rubric_points |
| status | TEXT | `covered` \| `missed` \| `misconceived` |
| evidence | TEXT | exact student quote (audit trail — required by scoring.md) |
| scorer_model | TEXT | `azure-gpt-5.4-mini` \| `heuristic-v0` \| … |
| scored_at | TIMESTAMPTZ | |

Indexes: `(student_id, concept_id)`, `(session_id)`.

### `user_concept_mastery` — **the progress source of truth**, one row per
(student, concept). This is what `/progress` and all the counters read.
| column | type | notes |
|---|---|---|
| student_id | TEXT FK→users | |
| concept_id | TEXT FK→concepts | |
| status | TEXT | `locked` \| `available` \| `learning` \| `mastered` \| `needs-revisit` |
| best_mastery | REAL DEFAULT 0 | max across attempts |
| attempts | SMALLINT DEFAULT 0 | session count |
| mastered_at | TIMESTAMPTZ | first time ≥ threshold (0.7) |
| last_session_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

PK `(student_id, concept_id)`. `mastered` = `best_mastery >= 0.7` enforced in the
update transaction, not trusted from the client ("Mark as Mastered" still goes
through coverage).

### `misconceptions` — "Worth Another Look" diagnostics
| column | type | notes |
|---|---|---|
| id | TEXT PK | `diag-01` |
| student_id | TEXT FK→users | |
| concept_id | TEXT FK→concepts | |
| session_id | TEXT FK→sessions | the session that produced it |
| rubric_point_id | SMALLINT | which point was misconceived |
| severity | TEXT | `high` \| `medium` \| `low` |
| diagnostic_insight | TEXT | "Tendency to modify subscripts…" |
| actionable_hint | TEXT | teacher-facing hint |
| status | TEXT | `needs_review` \| `resolved` |
| detected_at | TIMESTAMPTZ | |
| resolved_at | TIMESTAMPTZ | resolve endpoint flips status |

Index: `(student_id, status)`. Seeded by the scorer when any point comes back
`misconceived`; auto-`resolved` when a later session covers that same point.

## 7. Personalization

### `user_interests`
| column | type | notes |
|---|---|---|
| user_id | TEXT FK→users | |
| interest | TEXT | `Cricket`, `Farming`… |

PK `(user_id, interest)` — set-replaces on PUT.

### `language_requests` — demand board (monthly dedup)
| column | type | notes |
|---|---|---|
| id | BIGSERIAL PK | |
| language | TEXT | `Maithili` |
| native_script | TEXT | `मैथिली` |
| user_id | TEXT FK→users | |
| month | TEXT(7) | `2026-09` — dedup key |
| ticket_id | TEXT | `BATCH-LANG-7A9B2C` batch queue reference |
| created_at | TIMESTAMPTZ | |

UNIQUE `(user_id, language, month)` → the `alreadyRequested` 200 response.
Demand counts = `GROUP BY language` — no counter cache needed.

### `offline_downloads`
| column | type | notes |
|---|---|---|
| id | TEXT PK | `dl-01` |
| user_id | TEXT FK→users | |
| chapter_id | TEXT FK→chapters | |
| lang | TEXT(10) | |
| size_mb | REAL | sum of `concept_media.size_bytes` at download time |
| concept_count | SMALLINT | |
| downloaded_at | DATE | |

Index: `(user_id)`. DELETE endpoint removes the row; cached files are client-side.

## 8. Costs (one ledger, two producers)

### `provider_costs`
| column | type | notes |
|---|---|---|
| id | BIGSERIAL PK | |
| job_type | TEXT | `voice_session` \| `video_render` |
| session_id | TEXT FK→sessions | voice producer |
| render_job_id | TEXT FK→video_render_jobs | video producer |
| metrics | JSONB | voice: `{stt_s, tts_chars, llm_tok_in, llm_tok_out, livekit_min}` / video: `{llm_calls[], tts_chars, stages{}}` |
| est_usd | NUMERIC(10,4) | pricing function per `auth-traces-cost.md` |
| created_at | TIMESTAMPTZ | |

Same log shape for both producers → swap pricing functions without schema churn.

## 9. Table → endpoint map (proves nothing is missing)

| Endpoint (backend-endpoints.md) | Tables touched |
|---|---|
| `POST /api/auth/*` | users (+ last_login_at) |
| `GET/PATCH /api/users/me/profile` | users |
| `GET/PATCH /api/users/me/preferences` | user_preferences |
| `GET /api/curriculum/subjects?class=` | subjects (+ mastery agg) |
| `GET /api/curriculum/subjects/:s/chapters[/…c]` | chapters, concepts, user_concept_mastery |
| `GET /api/library/summary` | concept_media (counts), concepts, subjects |
| `GET /api/library/concepts` | concepts, chapters, subjects, concept_media (langs), user_concept_mastery, misconceptions |
| `GET /api/library/hierarchy` | subjects → concepts (domain grouping) |
| `GET /api/concepts/:id/generation-status?lang=` | concept_media |
| `GET /api/concepts/:id/media` | concepts, concept_media, concept_quizzes |
| `POST /api/concepts/:id/evaluate-explanation` | sessions(text), coverage_points, user_concept_mastery, misconceptions |
| `POST /webhooks/transcript` (voice) | sessions, transcripts, transcript_turns, coverage_points, user_concept_mastery, misconceptions, provider_costs |
| `GET /api/progress/summary` | user_concept_mastery (agg), sessions (active days) |
| `GET /api/progress/learning-map` | user_concept_mastery, concepts, chapters |
| `GET /api/diagnostics/misconceptions` + resolve | misconceptions |
| `GET/PUT /api/users/me/interests` | user_interests |
| `GET/POST /api/languages/*` | language_requests |
| `GET/DELETE /api/users/me/offline-chapters` | offline_downloads |
| `GET /token` (voice entry) | concepts, concept_media (lang check) |
| `POST /explain` (video entry) | video_render_jobs, concept_media, provider_costs |

## 10. What is deliberately NOT a table (yet)

- **FAISS vectors / NCERT chunks** — stay in `data/indices/` + metadata sidecar;
  they're an offline artifact, not OLTP data. Only `concepts` mirrors the gold
  script/rubric.
- **Live "in-call" Tier-1 signals** (scoring.md) — in-memory, never persisted.
- **Refresh tokens / sessions for auth** — start with stateless JWTs; add a
  `refresh_tokens` table only when logout-everywhere or revocation is needed.
- **Video watch analytics** — defer until there's a consumer.
