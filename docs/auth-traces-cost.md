# Auth, traces, cost (minimal prod slice)

Only three prod concerns for now. Everything else (user DB, dashboards,
moderation) is deferred.

## Auth — token server (`services/api/tokens.py`)

- `GET /token?student_id=...&topic_id=...&lang=...`
- Steps: validate params -> `akara-rag.fetch_topic(topic_id)` ->
  mint LiveKit token (room = `{topic_id}-{student_id}-{ts}`) ->
  attach TopicData JSON as job metadata -> return `{token, room, topic}`.
- `student_id` can be a school roll ID for now. No passwords, no user table.
- Voice worker trusts metadata but falls back to `DEFAULT_TOPIC_DATA` when
  empty (local console). Log a warning when fallback triggers.

Env: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (see `.env.example`).

## Traces / observability

Per `room_name`, persist:

- `transcript.json` (full turns + `stt_lang`/conf) — immutable source of truth
- Turn latencies: `stt_lat, llm_ttft, tts_ttfb` p50/p95
- Metadata: `topic_id, student_id, lang, model versions`
- Scorer output: `coverage.json` with evidence quotes

Use LiveKit OTel + JSON dump in `services/api/webhooks.py`. Human spot-checks
read transcripts, not derived scores.

## Cost per minute

Hosted (now):

```
cost/min = livekit_min + stt_min(vexyl: $0, self-hosted CPU/GPU) + tts_chars(cartesia) + llm_tokens(gemma)
```

Log LiveKit + provider usage per room in the webhook. Emit one CSV/JSONL line
per session: `{room, dur_s, stt_s, tts_chars, llm_tok_in/out, est_usd}`.

Self-host (later): `cost/min = room_dur_min × gpu_$/min (+ egress)`.
Keep the same log shape, swap the pricing function. Target users understand
rural cost constraints — publish the number, don't hide it.
