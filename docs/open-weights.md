# Open weights path (YuvAI compliance)

YuvAI requires open-source LLMs as hero/sidekick. Current dev stack: STT is
**already open-weight** (VEXYL-STT self-hosted); TTS is hosted
`cartesia/sonic-3` and the tutor LLM is hosted Gemma — kept deliberately for
velocity ("worked like butter"). Swap before submission.

## Swap map (constructors isolated in `services/voice/agent.py`)

| Layer | Now (hybrid) | Open target | Notes |
|---|---|---|---|
| STT | ✅ **DONE** — VEXYL-STT (AI4Bharat IndicConformer 600M, self-hosted) | — | See `vexyl-stt.md`. Swapped from Deepgram Nova-3. |
| LLM tutor | Gemma-4-31b hosted | Qwen2.5-7B-Instruct (+ LoRA Socratic, DPO no-leak) | Self-host via vLLM/Ollama; tutor + scorer share base, different adapters |
| TTS | Cartesia Sonic-3 | AI4Bharat IndicTTS / Kyutai Unmute / Coqui XTTS-v2 | Regional pitch tuning; one voice per lang, re-dub without re-render |
| VAD | inference.VAD | Silero VAD (`livekit-plugins-silero`) | Already open, trivial swap |
| Embed | — | multilingual-e5 | Already the plan for `akara-rag` |
| E2E alt | — | Kyutai Moshi (speech-in/speech-out) | Only if pipeline STT->LLM->TTS latency fails on self-host GPUs |

## Rules for the swap

- Change only the three constructors (`stt=`, `llm=`, `tts=`). Prompt,
  metadata contract, transcript/score JSON stay identical.
- Re-run the `multilingual.md` test matrix + latency budget
  (target: <1.2s turn p50 on hosted; accept higher on homelab, document it).
- Self-host cost becomes `GPU $/min`, not API $/min — update `auth-traces-cost.md`.
- Keep student voice data on compliant infra; document retention in `auth-traces-cost.md`.
