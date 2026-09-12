# Voice loop (`services/voice/agent.py`)

## Components

`AgentSession(stt, llm, tts, vad, turn_detection)` hosted by LiveKit Agents
`AgentServer.rtc_session`. Transport = LiveKit room audio. Brain = Socratic
prompt injected with `{topic, script, rubric}` from `ctx.job.metadata`.

Current dev stack (hybrid, swapping to open — see `open-weights.md`):

- `stt=VexylSTT(language="hi-IN")` — self-hosted AI4Bharat IndicConformer via
  VEXYL-STT WebSocket server. See `vexyl-stt.md` for full details.
  Replaced: `inference.STT(model="deepgram/nova-3")`.
- `llm=inference.LLM(model="google/gemma-4-31b-it")`
- `tts=inference.TTS(model="cartesia/sonic-3", voice="British Lady", language=...)`
- `vad=inference.VAD()`, `TurnDetector()` + `preemptive_generation` ON
- `audio_input` noise cancellation via `ai_coustics QUAIL_VF_S`

## Prompt contract

`INSTRUCTIONS_TEMPLATE` in `agent.py`:

- Role: Socratic tutor, grades 9-12, not a lecturer. Find gaps via Feynman.
- Loop per turn: check transcript vs rubric silently -> pick SINGLE biggest gap
  -> ask exactly ONE short follow-up. No summaries, no bullet lists, no markdown
  (spoken audio). 1-3 short sentences, warm TA tone.
- Never leak answers, even as hints. Escalation: correct -> harder application
  Q; partial -> target gap; lost/silent -> scaffold down to concrete physical Q;
  nails hard Q -> declare mastery, end.
- `on_enter`: greet + "explain what you understood about {topic}".
- `EndCallTool` only after mastery or user confirms stop.

## Known bug (fix next)

`tts language="hi"` is hardcoded while STT is `multi`. English answers still get
Hindi prosody + mismatched British Lady voice. Fix: thread `lang` from
`/token` (picker) + STT detection into both STT-init and TTS per session.
If student code-switches mid-call, match their language that turn.

## Turn-taking tuning

- `TurnDetector` + `preemptive_generation.enabled` = low perceived latency but
  risk of talking over kids. Tune `min_endpointing_delay` / interruption
  thresholds on real classroom recordings, not headphones.
- Keep `allow_interruptions=True` on greet, test barge-in explicitly.
- Log per-turn: `stt_lat, llm_ttft, tts_ttfb` — required for cost/latency work.

## Local testing

- `lk agent console` has no job metadata -> code falls back to
  `DEFAULT_TOPIC_DATA` (Newton's Third Law). That's expected.
- Real path: join via token from `services/api/tokens.py` so metadata is set.

## What NOT to add here

- No `RAG Tool`, no `Score Tool` as blocking function calls. Scoring signals
  stay as lightweight in-memory coverage; heavy judge runs in `scorer.py`
  post-call. See `scoring.md`.
