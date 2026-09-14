# Frontend (`apps/web`)

Learner interface: topic/grade/language selection, video player, "Explain
back" voice button, practice modes (listen / concept cards / mind map / quiz).

## Contract with backend

- Talks only to `services/api` (nginx proxies same-origin `/api`). LiveKit
  voice joins via the `/token` mint + `livekit-client`.
- Full endpoint contract: `apps/web/backend-endpoints.md` (all live) with the
  field-by-field audit in `docs/backend-api-mapping.md`.
- Wiring guide (mock service → real endpoint per page): `docs/pending.md` §2.
- Language: `?lang=` is OPTIONAL on every media/concept endpoint — omit it and
  the backend applies the profile's `default_language` (videos, quizzes,
  flashcards, doubts, and the voice agent all follow it).
- The Google Sign-In button is already wired (GIS id_token → `POST /api/auth/google`).
