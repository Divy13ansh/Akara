# High-Level Design (HLD)

## 1. What Akara is

Akara teaches NCERT concepts (Grades 6–12) in the student's own language:
**watch** a generated video explainer (Learn) → **teach it back** to an AI
mentor by voice or typing (Explain/Feynman check) → **practice** with
audio, concept cards, mind maps and quizzes → **track** mastery on the
Progress page. One render per concept/language serves every student.

## 2. System context

```mermaid
flowchart LR
    subgraph STUD["Students"]
        S1["📱 Browser<br/>(Hindi / Punjabi / …)"]
    end
    subgraph AKARA["Akara (docker compose)"]
        WEB["Web SPA<br/>nginx + Vite"]
        API["API<br/>FastAPI"]
        WRK["Worker<br/>arq jobs"]
        VID["Video<br/>Manim pipeline"]
        VOI["Voice<br/>LiveKit agent"]
        STT["STT<br/>IndicConformer"]
    end
    subgraph EXT["External providers"]
        G["Google<br/>GIS auth"]
        AZ["Azure<br/>OpenAI + Speech"]
        CF["Cloudflare R2<br/>media CDN"]
        LK["LiveKit Cloud<br/>rooms"]
    end
    S1 --> WEB
    WEB --> API
    API --> WRK
    API --> VID
    VOI --> API
    VOI --> STT
    VOI --> LK
    S1 --> LK
    WEB --> G
    API --> G
    API --> AZ
    VID --> AZ
    VID --> CF
    VOI --> AZ
    WEB --> CF

    classDef client fill:#DBEAFE,stroke:#3B82F6,stroke-width:2px,color:#1E3A8A
    classDef svc fill:#F5D5D0,stroke:#6d0e00,stroke-width:2px,color:#4a0d00
    classDef job fill:#FEF3C7,stroke:#B45309,stroke-width:2px,color:#5c3a06
    classDef vid fill:#EDE9FE,stroke:#6D28D9,stroke-width:2px,color:#3b1470
    classDef voi fill:#CCFBF1,stroke:#0F766E,stroke-width:2px,color:#073b36
    classDef ext fill:#FFEDD5,stroke:#C2410C,stroke-width:2px,color:#5f2605
    classDef data fill:#DCFCE7,stroke:#15803D,stroke-width:2px,color:#0b3d1e
    class S1 client
    class WEB svc
    class API svc
    class WRK job
    class VID vid
    class VOI,STT voi
    class G,AZ,CF,LK ext
```
![01-hld-context](./01-hld-context.svg)


## 3. Containers (one compose stack)

| Container | Image / build | Job |
|---|---|---|
| `postgres` | `postgres:16-alpine` | 20-table source of truth |
| `redis` | `redis:7-alpine` | Cache, locks, arq queue, render slots |
| `api` | `services/api/Dockerfile` | FastAPI: auth, curriculum, media, scoring intake |
| `worker` | same image, `arq` cmd | `score_session`, `quiz_generation_task` |
| `video` | `services/video/Dockerfile` | Manim render pipeline (TeX baked in) |
| `web` | `apps/web/Dockerfile` → nginx | Vite SPA, proxies `/api` + `/token` |
| `stt` | `services/stt/Dockerfile` | Self-hosted IndicConformer STT |
| `voice` | `services/voice/Dockerfile` (`voice` profile) | LiveKit Feynman agent |

```mermaid
flowchart TD
    U["👩‍🎓 Student browser<br/>http://localhost"] --> N["nginx (web:80)<br/>/ → SPA<br/>/api/* → api:8000<br/>/token → api:8000"]
    N --> API["api:8000<br/>FastAPI + alembic boot"]
    API <--> PG[("postgres<br/>akara db")]
    API <--> RD[("redis<br/>cache · locks · queue")]
    API -->|trigger render| VS["video:8001<br/>5-stage pipeline"]
    VS -->|callback| API
    VS --> R2[("R2 bucket akara<br/>mp4 · audio · thumbs")]
    N -->|media URLs| R2
    API -->|enqueue| RD
    RD --> W["worker (arq)<br/>scoring · quiz gen"]
    W --> PG
    U -->|voice room| LKC[("LiveKit Cloud")]
    VA["voice agent"] <--> LKC
    VA --> STT["stt:8091<br/>VEXYL-STT"]
    VA -->|transcript webhook| API

    classDef client fill:#DBEAFE,stroke:#3B82F6,stroke-width:2px,color:#1E3A8A
    classDef edge fill:#E7E5E4,stroke:#57534C,stroke-width:2px,color:#292524
    classDef svc fill:#F5D5D0,stroke:#6d0e00,stroke-width:2px,color:#4a0d00
    classDef job fill:#FEF3C7,stroke:#B45309,stroke-width:2px,color:#5c3a06
    classDef vid fill:#EDE9FE,stroke:#6D28D9,stroke-width:2px,color:#3b1470
    classDef voi fill:#CCFBF1,stroke:#0F766E,stroke-width:2px,color:#073b36
    classDef data fill:#DCFCE7,stroke:#15803D,stroke-width:2px,color:#0b3d1e
    class U client
    class N edge
    class API svc
    class W job
    class VS vid
    class VA,STT voi
    class PG,RD,R2,LKC data
```
![01-hld-containers](./01-hld-containers.svg)


## 4. Tech stack

- **Frontend:** React 19 + Vite + Tailwind 4 + motion, same-origin `/api` (zero CORS).
- **API:** FastAPI, SQLAlchemy 2 async, Alembic, PyJWT, bcrypt, `google-auth`.
- **Jobs:** arq over Redis (dedup by job id).
- **Video:** Manim CE, Azure OpenAI (scenes/script/code-fix), Azure Speech (TTS),
  ffmpeg stitch, SadTalker optional, R2 publish.
- **Voice:** LiveKit Agents 1.2 (VAD, preemptive generation), VEXYL-STT
  self-hosted, Gemma LLM, Cartesia TTS; Azure GPT scorer with heuristic fallback.
- **Media:** Cloudflare R2 (`videos/{concept}/{lang}/{video_id}/final.mp4`), public CDN.

## 5. Core user journeys

```mermaid
flowchart TD
    A["Signup / Login<br/>(email or Google)"] --> B["Onboarding<br/>class + language"]
    B --> C["Home constellation<br/>locked → available → mastered"]
    C --> D["Learn<br/>video + doubts chat"]
    D --> E["Explain<br/>teach Akara by voice"]
    E --> F["Practice<br/>listen · cards · mindmap · quiz"]
    F --> G["Progress<br/>weak topics + habit calendar"]
    G --> C

    classDef client fill:#DBEAFE,stroke:#3B82F6,stroke-width:2px,color:#1E3A8A
    classDef svc fill:#F5D5D0,stroke:#6d0e00,stroke-width:2px,color:#4a0d00
    classDef data fill:#DCFCE7,stroke:#15803D,stroke-width:2px,color:#0b3d1e
    class A,B client
    class C,D,E,F svc
    class G data
```
![01-hld-journeys](./01-hld-journeys.svg)


## 6. Cross-cutting rules

- **One render per (concept, lang)** serves all students — dedup lock + shared media rows.
- **Token frugality:** quiz/scene-graph/summary generate once per (concept, lang);
  failures are capped (`retry_count`, fresh arq job ids for recovery).
- **Language rule:** explicit `?lang=` wins, else profile `default_language`, else `hi` —
  enforced identically in API, voice token, STT/TTS and prompts.
- **Mastery gate 0.7:** unlocking, Feynman bands and weak-topic flags all key off it.
