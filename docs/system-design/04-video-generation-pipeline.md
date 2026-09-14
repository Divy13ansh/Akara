# Video Generation Pipeline

One render per (concept, lang) → every student streams the same mp4 from R2.
Code: `services/video/app/` (stages), trigger in `services/api/video_client.py`,
status gate in `services/api/routers/concepts.py`, callback in
`services/api/routers/internal.py`.

## 1. The five stages

```mermaid
flowchart TD
    T["Trigger<br/>api registers VideoRenderJob<br/>POST video:8001/render"] --> S1["① Scene planning<br/>LLM → scene list<br/>RAG: NCERT excerpts"]
    S1 --> S2["② Manim render<br/>LLM codegen → manim<br/>LLM auto-fix × N<br/>placeholder fallback"]
    S2 --> S3["③ Script<br/>LLM → narration<br/>+ transcript"]
    S3 --> S4["④ TTS<br/>Azure Speech<br/>per-scene audio"]
    S4 --> S5["⑤ Stitch & mux<br/>ffmpeg + audio<br/>SadTalker optional"]
    S5 --> R2["R2 publish<br/>videos/{c}/{l}/{vid}/final.mp4"]
    R2 --> CB["Callback<br/>POST /internal/render-callback<br/>complete | failed"]
    CB --> Q["Enqueue quiz pack<br/>(one Azure call)"]

    classDef trig fill:#F5D5D0,stroke:#6d0e00,stroke-width:2px,color:#4a0d00
    classDef st fill:#EDE9FE,stroke:#6D28D9,stroke-width:2px,color:#3b1470
    classDef data fill:#DCFCE7,stroke:#15803D,stroke-width:2px,color:#0b3d1e
    classDef job fill:#FEF3C7,stroke:#B45309,stroke-width:2px,color:#5c3a06
    class T,CB trig
    class S1,S2,S3,S4,S5 st
    class R2 data
    class Q job
```
![04-video-stages](./04-video-stages.svg)


Stage notes:

- **Scene planning** — LLM turns the gold script + NCERT RAG excerpts into a timed scene list.
- **Manim** — LLM writes Manim CE code; each scene renders in isolation; on failure the
  stderr goes back to the LLM for a fix (bounded attempts), then a black placeholder
  keeps the video watchable. Non-English text uses `Text`, never `Tex`/`MathTex`;
  pure math uses `MathTex` — compiled by the TeX baked into the image
  (`texlive-latex-base`, `dvisvgm`, `cm-super`; `/health` reports both).
- **Script + TTS** — narration generated per scene, voiced by Azure Speech in the
  target language, aligned to scene timestamps.
- **Stitch** — ffmpeg muxes scene mp4s + audio; SadTalker presenter pass is optional;
  the final audio track is extracted for the Listen activity.
- **Publish + callback** — mp4 (and audio/thumb when produced) upload to R2, then
  the video service calls back with `complete`/`failed`, R2 keys, duration and timings.

## 2. End-to-end sequence (first student triggers it)

```mermaid
sequenceDiagram
    autonumber
    participant S as Student
    participant API as api
    participant V as video:8001
    participant AZ as Azure
    participant R2 as R2 CDN
    S->>API: GET generation-status?lang=pa
    API->>API: no media · lock won · budget left
    API->>V: POST /render {concept, lang, video_id}
    API-->>S: generating_first_time (ETA ~15 min)
    V->>AZ: scenes + script + code-fix (LLM)
    V->>V: manim render each scene
    V->>AZ: TTS per scene
    V->>V: ffmpeg stitch + mux
    V->>R2: upload final.mp4
    V->>API: POST /internal/render-callback complete
    API->>API: media COMPLETE · free slot · quiz enqueue
    API-->>S: instant (poll flips) — video streams from R2
```
![04-video-sequence](./04-video-sequence.svg)


Second student for the same concept/language: `instant` immediately — zero tokens spent.

## 3. Failure handling (the token-saving part)

```mermaid
flowchart TD
    F["Render fails<br/>(callback: failed)"] --> B{"retry_count < 2?"}
    B -->|yes| R["Next poll re-triggers<br/>retry_count + 1"]
    B -->|no| D["Status failed<br/>no more renders, ever"]
    R --> F
    S["Stale job (>20 min, no progress)<br/>video container died"] --> R

    classDef bad fill:#FDE2E2,stroke:#B91C1C,stroke-width:2px,color:#5c0a0a
    classDef job fill:#FEF3C7,stroke:#B45309,stroke-width:2px,color:#5c3a06
    class F,D bad
    class B,R,S job
```
![04-video-failures](./04-video-failures.svg)


- Deterministic failures (e.g. missing system dependency) can never loop forever.
- A second student arriving mid-render attaches to the in-flight job under the
  same distributed lock — never a duplicate render.
- Render slots (D-16 cap) queue excess demand instead of piling Manim jobs.
