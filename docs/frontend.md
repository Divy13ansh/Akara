# Frontend (future, `apps/web`)

Learner interface: topic/grade/language selection, video player, RAG-backed
suggestions, "Explain back" voice button.

## Contract with backend

- Talks only to `services/api` (HTTPS). Never to LiveKit directly except via
  token + room join.
- Flow: `GET /topics` -> pick -> `GET /videos/{topic_id}` (watch) ->
  `GET /token` (voice check) -> join room -> `GET /progress/{student_id}`.
- Sends explicit `lang` on every `/token` call (see `multilingual.md`).
- Mobile/web share the same endpoints; voice room is the same LiveKit room.

## Out of scope now

Player UI, render queue UI, mastery dashboards. Build API shapes first
(`library.py`, `progress.py`), UI later.
