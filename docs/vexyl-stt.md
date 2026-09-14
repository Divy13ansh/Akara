# VEXYL-STT: Self-Hosted Open-Weight STT (`services/voice/vexyl_stt_plugin.py`)

Self-hosted STT using [VEXYL-STT](https://github.com/vexyl-ai/vexyl-stt)
running AI4Bharat's `indic-conformer-600m-multilingual` model (600M params,
14 Indian languages). Replaces Deepgram Nova-3 for open-weight compliance
(see `open-weights.md`).

## What's running

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────────────────┐
│   Web Browser   │  WebRTC │  LiveKit Cloud   │  WebRTC │   Agent Worker (agent.py)   │
│  (Student/User) │◄────────┤   (Room Server)  │◄────────┤                             │
└─────────────────┘         └──────────────────┘         │  VexylSTT plugin            │
                                                         │    ↕ WebSocket (localhost)   │
                                                         │  VEXYL-STT Server (:8091)   │
                                                         │    AI4Bharat IndicConformer  │
                                                         └─────────────────────────────┘
```

### Data flow per turn

1. Student speaks → audio reaches agent via LiveKit WebRTC
2. LiveKit's `VoicePipelineAgent` pushes `AudioFrame`s to the STT stream
3. `VexylSTTStream` sends raw 16-bit PCM bytes over WebSocket to VEXYL-STT
4. VEXYL-STT runs inference (IndicConformer CTC), waits for 0.6s silence (internal VAD)
5. Server sends `{"type": "final", "text": "...", "lang": "hi-IN"}` back
6. Plugin emits `START_OF_SPEECH` → `FINAL_TRANSCRIPT` → `END_OF_SPEECH` events
7. LLM generates Socratic follow-up → TTS speaks it back

### Files

| File | Location | Purpose |
|------|----------|---------|
| `vexyl_stt_plugin.py` | `services/voice/` | LiveKit STT plugin — WebSocket client to VEXYL-STT |
| `agent.py` | `services/voice/` | Voice agent — `build_stt()` returns `VexylSTT` instance |
| `.env.local` | `services/voice/` | LiveKit creds + VEXYL-STT host/port (git-ignored) |

## Setup

### 1. VEXYL-STT server — now a compose service (default)

The server is **vendored at `services/stt/`** and runs as the `stt` compose
service — plain `docker compose up` includes it; no host-side `./run.sh` needed.
The gated model downloads on first boot into the `stt_models` volume.

**REQUIRED on a fresh machine/VPS — HuggingFace token** (the model repo is
gated): request access at
https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual, create a
read token at https://huggingface.co/settings/tokens, then:

```bash
# .env.local
HF_TOKEN=hf_xxxxxxxxxxxxxxxx

docker compose up -d stt
docker compose logs -f stt   # one-time ~2.4GB download, then 'server ready'
```

See docs/backend-api-mapping.md §1 for the full integration record.

Health check: `curl http://localhost:8091/health`

#### Legacy host-run flow (optional, for plugin development)

```bash
cd ../vexyl-stt
./setup.sh          # downloads model (~2.4GB), creates .env + run.sh
./run.sh            # starts WebSocket server on ws://127.0.0.1:8091
```

### 2. Agent worker

```bash
cd services/voice
pip install websockets>=13.0    # or: uv sync from repo root
python agent.py start
```

### 3. Test via LiveKit Playground

- Agent name: `akara-voice`
- Speak → wait ~1s silence → watch for `[VEXYL] Final: '...'` in terminal

## Configuration

### Environment variables (`.env.local` or shell)

| Variable | Default | Description |
|----------|---------|-------------|
| `VEXYL_STT_HOST` | `127.0.0.1` | VEXYL-STT server host (`stt` inside compose; `127.0.0.1` for host-run agent) |
| `VEXYL_STT_PORT` | `8091` | VEXYL-STT server port |
| `VEXYL_STT_LANG` | `hi-IN` | Default language (overridden per-session via job metadata) |
| `HF_TOKEN` | — | **Required for the `stt` compose service** on a fresh machine — downloads the gated model once into the `stt_models` volume |
| `VEXYL_STT_DEVICE` | `cpu` | Set `cuda` on a GPU VPS (~3GB VRAM) |

### Supported languages

`hi-IN` `ta-IN` `te-IN` `kn-IN` `ml-IN` `bn-IN` `gu-IN` `mr-IN` `pa-IN`
`or-IN` `as-IN` `ur-IN` `sa-IN` `ne-IN`

### GPU acceleration

Edit `../vexyl-stt/.env`: set `VEXYL_STT_DEVICE=cuda` (requires NVIDIA GPU, ~3GB VRAM).
Reduces inference latency from ~400ms to ~100ms.

## How the plugin works

`VexylSTT` (subclass of `stt.STT`) creates `VexylSTTStream` (subclass of
`stt.SpeechStream`) which implements `_run()`:

1. **`_connect()`** — Opens WebSocket, waits for `ready`, sends `start` with
   session ID and language.

2. **`send_task()`** — Reads frames from `self._input_ch` (base class provides
   these, already resampled to 16kHz via `sample_rate=16000` constructor arg).
   Calls `frame.data.tobytes()` to get raw int16 PCM, sends as binary WebSocket
   message.

3. **`recv_task()`** — Listens for JSON messages. On `{"type": "final"}`,
   calls `_process_final_transcript()` which emits the three speech events
   LiveKit needs: `START_OF_SPEECH`, `FINAL_TRANSCRIPT`, `END_OF_SPEECH`.

4. On input channel close, sends `{"type": "stop"}` to flush remaining audio.

## Performance trade-offs

| Metric | Deepgram Nova-3 (cloud) | VEXYL-STT (CPU) | VEXYL-STT (GPU) |
|--------|------------------------|------------------|------------------|
| End-of-speech latency | 80–150ms | 800–1500ms | 400–700ms |
| Interim results | ✓ | ✗ | ✗ |
| Cost per hour | ~$0.01–0.02 | $0 | $0 |
| Data privacy | Sent to cloud | Fully local | Fully local |
| Languages | 36+ | 14 (Indian) | 14 (Indian) |

**Key limitation:** No interim/partial results. VEXYL-STT only emits finals
after its internal VAD detects 0.6s silence. This means higher perceived
end-of-speech latency vs Deepgram. Turn detection still works (we emit
`START/END_OF_SPEECH`), but barge-in responsiveness is lower.

## Reverting to Deepgram

Edit `build_stt()` in `services/voice/agent.py`:

```python
def build_stt():
    return inference.STT(model="deepgram/nova-3", language="multi")
```

And re-add `stt_context_options={"keyterm_detection": {"enabled": True}}` to
the `AgentSession()` constructor. Remove `from vexyl_stt_plugin import VexylSTT`.

## Bugs fixed (historical)

The plugin went through several iterations. Key bugs that were found and fixed:

1. **Audio data conversion crash** — `frame.data * 32767` TypeError (memoryview
   is int16, not float). Fixed: `frame.data.tobytes()`.
2. **Missing `sample_rate`** in base class constructor — prevented auto-resampling.
3. **Wrong flush sentinel check** — `isinstance(frame, list)` instead of
   `self._FlushSentinel`.
4. **Missing speech events** — no `START_OF_SPEECH`/`END_OF_SPEECH`, broke turn
   detection.
5. **Missing `APIConnectionError` import** — `NameError` masked connection failures.
6. **Broken manual resampler** — `AudioResampler.push()` returns a list, was
   treated as single frame. Removed in favor of base class auto-resampling.

All fixed in the current `vexyl_stt_plugin.py`.
