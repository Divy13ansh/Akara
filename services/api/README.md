# API service

HTTP boundary for web + voice. See `docs/architecture.md`.

- `tokens.py` — `/token` mint + pre-session TopicData lookup
- `library.py` — video/topic catalog (future)
- `progress.py` — mastery reads/writes (future)
- `webhooks.py` — transcript intake -> scorer trigger
