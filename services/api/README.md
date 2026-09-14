# API service

HTTP boundary for web + voice (FastAPI, 4 uvicorn workers in compose).
See `docs/architecture.md` and `docs/backend-api-mapping.md`.

- `main.py` — app assembly + boot init (schema check + seed-if-empty)
- `boot.py` — advisory-lock-guarded migrate-verify + catalog seed
- `config.py` / `deps.py` — settings, auth dependencies (JWT), webhook guard
- `security.py` — bcrypt + JWT + Google id_token verification
- `redis_client.py` — cache-aside, distributed locks, rate limits, render slots
- `r2.py` — Cloudflare R2 (videos, TTS audio, avatars) + public CDN URLs
- `video_client.py` — dispatches render jobs to the video service
- `mastery.py` — coverage → mastery rollup + prerequisite unlocking
- `queue.py` — arq enqueue (scoring, quiz generation)
- `quiz_gen.py` — on-demand quiz/flashcard/scene-graph generation (D-7)

Routers (`routers/`): auth, users, curriculum, library, concepts
(generation-status / media / doubts / evaluate), explanations
(evaluate + mark-mastered), progress, activity, diagnostics, languages,
webhooks (voice transcript intake), internal (render-callback, /token).
