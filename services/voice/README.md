# Voice service

LiveKit Feynman loop worker. See `docs/pipelines/voice-loop.md`.

- `agent.py` — `AgentSession` + Socratic prompt, metadata-injected `{topic, script, rubric}`
- `vexyl_stt_plugin.py` — Custom STT plugin: self-hosted VEXYL-STT (AI4Bharat IndicConformer) via WebSocket
- `scorer.py` — async post-call scorer (transcript + rubric → coverage JSON)
- `.env.local` — LiveKit credentials + VEXYL-STT config (git-ignored, see `.env.example`)

## STT: VEXYL-STT (open-weight, self-hosted)

The STT layer uses a self-hosted VEXYL-STT server running AI4Bharat's
`indic-conformer-600m-multilingual` model (600M params, 14 Indian languages).
See `docs/pipelines/vexyl-stt.md` for full setup and architecture.

To revert to Deepgram (cloud), edit `build_stt()` in `agent.py` — the old
constructor is commented inline.
