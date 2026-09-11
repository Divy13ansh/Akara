# Voice service

LiveKit Feynman loop worker. See `docs/voice-loop.md`.

- `agent.py` — `AgentSession` + Socratic prompt, metadata-injected `{topic, script, rubric}`
- `scorer.py` — async post-call scorer (transcript + rubric -> coverage JSON)
