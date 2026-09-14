# Video pipeline (`services/video`)

Manim CE STEM explainer rendering engine. Integrated into `services/video` as an independent FastAPI microservice. Decoupled from the voice hot path via `topic_id`.

## 5-Stage Rendering Pipeline

```
NCERT Topic / Passage (via akara-rag or topic_id)
 ├─► Stage 1: Scene Planning (LLM prompt -> scene graph JSON)
 ├─► Stage 2: Manim Rendering (Per-scene code gen, headless render, LLM auto-fix loop)
 ├─► Stage 3: Script Alignment (Aligns canonical TopicData.script with scene timestamps)
 ├─► Stage 4: Neural TTS Generation (Azure Neural TTS per language: hi, en, ta, te, gu, etc.)
 └─► Stage 5: Audio-Video Stitching & Muxing (FFmpeg duration padding, audio muxing & concat)
```

## API Interface

- `POST /explain` (or `POST /render`):
  - Request body: `{ topic_id, topic, level, persona, language, face_enabled, rag_context, sync }`
  - Asynchronous mode (`sync: false`): Spawns background task, returns `{ video_id, status: "processing", status_url: "/video/{video_id}/status" }`.
  - Synchronous mode (`sync: true`): Blocks until rendering completes and returns full cost breakdown & video path.
- `GET /video/{video_id}/status`:
  - Returns current status (`pending` -> `processing` -> `complete` | `failed`), active stage, and cost log.
- `GET /video/{video_id}`:
  - Serves the final rendered `final.mp4`.

## Decoupled Join Key (`topic_id`)

- `topic_id` is the single join key across video explainers, FAISS indices, voice sessions, and post-call scoring.
- When `topic_id` is supplied, `services/video` pulls canonical NCERT script and rubric from `packages/akara_rag` to ensure the explainer narration and the Socratic voice tutor share **the exact same wording**.

## Environment Variables

- `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` (LLM code generation)
- `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` (Neural TTS audio generation)

## Service Location

Code lives in `services/video/` with its own environment and container spec (`services/video/Dockerfile`).
