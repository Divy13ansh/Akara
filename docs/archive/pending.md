# pending.md — Handoff for the Next Agent

**Status as of 2026-09-14: the backend + database are COMPLETE and running.**
The only remaining work is **connecting the frontend to the backend** (plus small
refinements). Everything the frontend mocks simulate exists, live, behind the
same URLs and shapes documented below.

---

## 0. How to run / verify

```sh
docker compose up -d --build       # web api worker video stt postgres redis
docker compose --profile voice up -d   # + LiveKit voice worker (uses `stt` service)
```

- App: http://localhost (nginx SPA, `/api` proxied to the FastAPI backend)
- API docs: http://localhost:8000/docs · STT health: http://localhost:8091/health
- `HF_TOKEN` in `.env.local` is required on a fresh VPS (stt model download, once)
- Full API contract: `apps/web/backend-endpoints.md` + `docs/architecture/backend-api-mapping.md`

---

## 1. ✅ DONE (backend + database — nothing left here)

| Area | Status |
|---|---|
| **Database** | 20 tables, Alembic migrations current. Full NCERT catalog seeded from `packages/akara_db/syllabus.json`: 5 subjects, 239 chapters, **2,027 concepts** (classes 6–12), chained prerequisites, 3 gold topics with rubrics (`phy11-inertia`, `phy11-newton3`, `math10-quadratic`). Auto-seeds on boot if DB is empty (advisory-lock guarded). |
| **Auth** | `POST /api/auth/signup` · `POST /api/auth/login` · `POST /api/auth/google` (GIS id_token, auto-provision). JWT 24h. |
| **Profile & prefs** | GET/PATCH profile (onboarding rule: class+lang ⇒ completed) · GET/PATCH preferences (data saver) · GET/PUT interests · GET/POST/DELETE offline-chapters · **PUT /api/users/me/profile/photo (R2 upload, verified live)** |
| **Curriculum** | subjects (?class= alias) · chapters · chapter detail (constellation w/ statuses) — per-user mastery overlays |
| **Library** | summary counters · concepts search/filter · hierarchy — `available_languages` from real completed media |
| **Progress/diagnostics** | progress summary · learning map · misconceptions · resolve |
| **Language demand** | GET demand · POST request (monthly dedup + tickets) |
| **Concept media** | generation-status (D-6 auto-trigger, D-16 render cap, stale-job sweep, 2s cache) · media bundle · **evaluate-explanation** (heuristic sync + async LLM refine, resolves misconceptions on mastery) · **mark-mastered** (D-9 server gate) |
| **Video pipeline** | Manim 5-stage + Azure TTS → R2 upload → callback → `complete`. **E2E proven**: rendered video streams from R2 through the app. |
| **STT (voice)** | VEXYL-STT vendored at `services/stt/`, compose service, health-checked. WebSocket PCM→transcript roundtrip verified. |
| **Voice worker** | LiveKit agent registered (`akara-voice`, LiveKit Cloud India South). Per-session STT/TTS language from job metadata. |
| **Quizzes/flashcards/scene-graph** | **On-demand** (token-saving): auto-generated the moment a render completes (or first /media fetch) — one Azure call per (concept, lang). `/media` returns `quiz_status: ready|generating|failed` + `flashcards[]`. Verified: 9 questions, scene graph, summary, mentor prompt, flashcards. |
| **Doubts chat** | `POST /api/concepts/:id/doubts` — grounded LLM tutor answers in the student's language (verified). |
| **Multi-user/scalability** | Redis cache-aside everywhere, distributed locks, rate limits, arq worker (scoring + quiz gen), 4 uvicorn workers, stateless API. |

---

## 2. 🔴 PENDING — the ONLY real work left: frontend ↔ backend wiring

Every frontend page still reads **mock services**. Map each mock to its real
endpoint (all exist, contract-shaped, running):

| Frontend mock / page | Replace with real endpoint(s) |
|---|---|
| `services/api.ts` (login/signup mocks) | `POST /api/auth/login`, `POST /api/auth/signup` — response `{token, user}`; store token, send `Authorization: Bearer` |
| Google button (`googleIdentity.ts`) | ALREADY WIRED to `POST /api/auth/google` — verify only |
| `OnboardingClass/OnboardingLanguage` | `PATCH /api/users/me/profile` `{class, default_language}` |
| `HomeDashboard` (`curriculumData.ts` mock) | `GET /api/curriculum/subjects?class=N` + `GET /api/users/me/profile` |
| `SubjectChapters` | `GET /api/curriculum/subjects/:sid/chapters?class=N` |
| `ChapterDetail` (constellation, `constellationData.ts`) | `GET /api/curriculum/subjects/:sid/chapters/:cid` — node statuses: `locked/available/mastered`; "Mark as Mastered" → `POST /api/concepts/:id/mark-mastered` (409 = must practice first) |
| `Learn` (`conceptMediaService.getGenerationStatus` + localStorage cache) | `GET /api/concepts/:id/generation-status?lang=` — `lang` is OPTIONAL now (backend uses profile default). Poll while `generating_first_time`/`finishing_dub`. `status: instant` → play. |
| `Learn` video player | `GET /api/concepts/:id/media` → `video.url` (R2 mp4). `DoubtsChat` → `POST /api/concepts/:id/doubts` `{question, history[]}` → `{answer}` |
| `Explain` | `GET .../media` + `POST /api/concepts/:id/evaluate-explanation` `{student_answer_text, language}` → `{is_mastered, score_percent, points_covered/missed, diagnostic_resolved}` |
| `Practice` **Quiz mode** | `GET .../media` → `quiz[]` (`{id, question, options[], correct_index, explanation}`); if `quiz_status: generating` → show spinner, refetch in ~10s |
| `Practice` **Concept Card (flashcards)** | `GET .../media` → `flashcards[]` `[{front, back}]` (frontend's `CHEMISTRY_FLASHCARDS` is hardcoded — replace; also `script.key_definitions`) |
| `Practice` **Mind Map** | `GET .../media` → `scene_graph` `{nodes[{id,label,type,description}], edges[{from,to,label}]}` (frontend `defaultNodes` hardcoded — replace) |
| `Practice` **Listen mode** | `GET .../media` → `video.audio_url` (M4A from Azure TTS) + `script.full_transcript` for scrub captions |
| `Library` (`libraryData.ts`) | `GET /api/library/summary` · `GET /api/library/concepts?q=&subject=` · `GET /api/library/hierarchy` |
| `Progress` (`progressData.ts` + `diagnosticData.ts`) | `GET /api/progress/summary` · `GET /api/progress/learning-map` · `GET /api/diagnostics/misconceptions` · `POST /api/diagnostics/:id/resolve` |
| `Profile` (`profilePreferences.ts`) | `GET/PATCH /api/users/me/preferences` · `GET/PUT /api/users/me/interests` · `GET/POST/DELETE offline-chapters` · **photo: `PUT /api/users/me/profile/photo` (multipart `file`) → returns full profile with new `profile_photo` URL** |
| Language demand (`languageDemandService.ts`) | `GET /api/languages/demand` · `POST /api/languages/request` |
| Auth interceptor | 401 → redirect `/login`; attach token in a fetch wrapper (see `apps/web/src/services/api.ts`) |

**Field-name note:** the backend serves snake_case (`correct_index`,
`summary_bullets`, `is_mastered`, `video.duration_seconds`); the frontend
interfaces use camelCase. Pick ONE strategy up front — either map once in a
small adapter layer, or change the TS interfaces to match the backend
(recommended; smaller surface). Do NOT silently rename backend keys.

**Language note:** every media/concept endpoint takes optional `?lang=`.
Omit it and the backend uses the student's profile `default_language` — that
already drives video rendering, quizzes, flashcards, doubts, and the voice
pipeline. The frontend only needs `?lang=` for the explicit language picker.

---

## 3. 🔊 LiveKit voice → frontend integration (the one open question)

The agent worker **is running and registered** with LiveKit Cloud
(`akara-voice`, verified in logs). What's missing is the browser side:

1. **Backend already mints join tokens**: `GET /token?student_id=...&topic_id=...`
   (send the user's JWT as `Authorization: Bearer` so language defaults apply).
   Returns `{token, room, url}`. The token embeds room dispatch metadata
   (topic script, rubric, student lang) so the agent speaks the right
   language/concept.
2. **Browser**: `npm i livekit-client`, then:
   ```ts
   import { Room, RoomEvent, Track } from 'livekit-client';
   const room = new Room();
   await room.prepareConnection(url);            // url from /token response
   await room.connect(url, token);               // agent is auto-dispatched to the room
   room.on(RoomEvent.TrackSubscribed, (track) => {
     if (track.kind === Track.Kind.Audio) track.attach(); // agent voice out
   });
   await room.localParticipant.setMicrophoneEnabled(true); // student voice in
   ```
3. **Add a "Talk to your AI Mentor" button** on `/learn/:conceptId` that calls
   `/token` and connects as above; show live transcript by listening for
   data messages from the agent if desired (agent pushes `FINAL_TRANSCRIPT`
   events internally; simplest v1 = voice-only).
4. **Gotchas**: browser mic requires HTTPS (or `http://localhost` — fine in
   dev); LiveKit Cloud origin allowlist may need your prod domain added in the
   LiveKit dashboard; the `voice` service runs under `--profile voice`.

---

## 4. 🟡 Small refinements (optional, post-wiring)

- Latex (texlive) in the video image for MathTex-heavy renders
- Refresh-token flow (JWTs are 24h stateless now)
- Offline chapter caching on the client (backend registration endpoints exist)
- Add `PUT /profile/photo` + `quiz_status` + `flashcards` + `doubts` to
  `apps/web/backend-endpoints.md` (contract doc lags the implementation)

## 5. Where everything lives (map for the next agent)

| Path | What |
|---|---|
| `services/api/routers/*.py` | all endpoint implementations (12 routers) |
| `services/api/routers/concepts.py` | generation-status, media (+quiz/flashcards), doubts, evaluate |
| `services/api/quiz_gen.py` | on-demand quiz/flashcard generation (arq `quiz_generation_task`) |
| `services/worker/main.py` | arq tasks: `score_session`, `quiz_generation_task` |
| `services/api/r2.py` | R2 helpers (`avatar_key`, `upload_bytes`, `public_url`) |
| `services/stt/` | vendored VEXYL-STT (compose service `stt`) |
| `services/voice/agent.py` | LiveKit agent (metadata → language/topic) |
| `packages/akara_db/` | models + syllabus.json catalog |
| `alembic/versions/` | migrations (latest: `concept_quizzes.generation_status`) |
| `docs/architecture/backend-api-mapping.md` | field-by-field contract audit (read with this file) |
| `docs/getting-started/runbook.md` | ops/troubleshooting |
