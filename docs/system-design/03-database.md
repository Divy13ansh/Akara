# Database — Full Map

Postgres 16 · 20 tables · `packages/akara_db/models.py` is the source of truth.
Conventions: TEXT app-generated PKs (`usr_…`, `vid-…`), `created_at` everywhere,
`updated_at` on mutable rows, JSONB for write-once blobs, TEXT enums.

## 1. Entity-relationship diagram

```mermaid
erDiagram
    users ||--o| user_preferences : "has"
    users ||--o{ user_concept_mastery : "tracks"
    users ||--o{ misconceptions : "diagnosed"
    users ||--o{ sessions : "attempts"
    users ||--o{ user_interests : "likes"
    users ||--o{ language_requests : "requests"
    users ||--o{ offline_downloads : "saves"
    users ||--o{ daily_activity : "logs"
    subjects ||--o{ chapters : "contains"
    chapters ||--o{ concepts : "contains"
    subjects ||--o{ concepts : "denormalized"
    concepts ||--o| concepts : "prerequisite"
    concepts ||--o{ concept_media : "renders"
    concepts ||--o{ video_render_jobs : "runs"
    concepts ||--o{ concept_quizzes : "quiz-pack"
    concepts ||--o{ rubric_points : "flattens"
    concepts ||--o{ user_concept_mastery : "progress"
    concepts ||--o{ coverage_points : "evidenced"
    concepts ||--o{ misconceptions : "about"
    sessions ||--|| transcripts : "records"
    transcripts ||--o{ transcript_turns : "turns"
    sessions ||--o{ coverage_points : "scores"
    sessions ||--o{ provider_costs : "bills"
    video_render_jobs ||--o{ provider_costs : "bills"
    sessions ||--o{ misconceptions : "seeds"

    users {
        text id PK "usr_xxxxxxxxxx"
        text name
        text email UK "null for Google-only"
        text password_hash "null for Google-only"
        text google_id UK "Google sub"
        text profile_photo
        smallint class "6-12"
        string default_language
        bool onboarding_completed
    }
    concepts {
        text id PK "{subject}{grade}-{slug}"
        text chapter_id FK
        text subject_id FK
        text topic_name "English title"
        text script "gold script"
        text rubric
        jsonb rubric_levels "Feynman ladder L1-L4"
        text prerequisite_id FK "null = root"
    }
    concept_media {
        bigint id PK
        text concept_id FK
        string lang
        string status "pending|processing|complete|failed"
        string current_stage
        smallint progress_percent
        smallint retry_count "render budget"
        text video_r2_key
        text audio_r2_key
    }
    video_render_jobs {
        text id PK "vid-xxxxxxxxxxxx"
        text concept_id FK
        string lang
        string status "pending|processing|complete|failed"
        string current_stage
        jsonb stage_timings
    }
    concept_quizzes {
        bigint id PK
        text concept_id FK
        string lang
        jsonb quiz "8-10 items"
        jsonb scene_graph
        jsonb summary "incl. localized topic_name"
        jsonb mentor_prompt
        string generation_status "generating|ready|failed"
    }
    user_concept_mastery {
        text student_id PK_FK
        text concept_id PK_FK
        string status "locked|available|learning|mastered|needs-revisit"
        float best_mastery "gate 0.7"
        int attempts
    }
    sessions {
        text id PK "room name for voice"
        string session_type "voice|text"
        text student_id FK
        text concept_id FK
        string lang
        text explanation_text "typed answer"
    }
    coverage_points {
        bigint id PK
        text session_id FK
        text concept_id FK
        text student_id FK
        smallint rubric_point_id
        string status "covered|missed|misconceived"
        text evidence "student quote"
    }
```
![03-er](./03-er.svg)


## 2. Table-by-table guide

### Identity — `users`, `user_preferences`, `user_interests`
One row per student. Google-only accounts have `password_hash = NULL`;
password-only accounts have `google_id = NULL`; linking fills both.
Preferences carry `data_saver_mode`; interests are free-form tags.

### Curriculum — `subjects`, `chapters`, `concepts`, `rubric_points`
`subjects` span grade bands (`class_min/max`: Science 6–10, Physics 11–12…).
`concepts.id` doubles as `topic_id` everywhere (`math10-euclid-…`).
`prerequisite_id` chains the constellation; `rubric_levels` is the Feynman
ladder (levels → points → misconceptions), flattened into `rubric_points`
for the scorer join.

### Media pipeline — `concept_media`, `video_render_jobs`, `concept_quizzes`
One `concept_media` per **(concept, lang)** — shared by all students, so one
render serves everyone. `retry_count` caps re-renders after terminal failures.
Each pipeline run is a `video_render_jobs` row (retries = new rows, latest wins).
`concept_quizzes` holds the one-shot LLM pack (quiz, scene graph, summary with
localized `topic_name`, mentor prompt) with `generation_status` as the dedup marker.

### Learning evidence — `sessions`, `transcripts`, `transcript_turns`, `coverage_points`
Voice and typed attempts are both `sessions` (voice id = LiveKit room name).
Transcripts are immutable JSON + per-turn rows (never truncated before scoring).
`coverage_points` is the audit trail: one verdict per (session, rubric point)
with the student's exact quote as evidence.

### Progress — `user_concept_mastery`, `misconceptions`
`user_concept_mastery` is the progress source of truth: `best_mastery ≥ 0.7`
flips `mastered`, unlocking dependents. `misconceptions` are the "Worth Another
Look" diagnostics (`needs_review` → `resolved` on proof of mastery).

### Personalization & cost — `language_requests`, `offline_downloads`, `daily_activity`, `provider_costs`
Demand board (unique per user/lang/month), offline packs, per-day minutes, and
one cost ledger for both voice sessions and video renders.

## 3. Enum values

| Enum | Values |
|---|---|
| `MediaStatus` | `pending` · `processing` · `complete` · `failed` |
| `VideoStage` / `RenderStage` | `queued` · `scene_planning` · `manim_rendering` · `script_generation` · `tts_generation` · `stitch_and_mux` · (`sadtalker`) · `done` · `error` |
| `MasteryStatus` | `locked` · `available` · `learning` · `mastered` · `needs-revisit` |
| `CoverageStatus` | `covered` · `missed` · `misconceived` |
| `MisconceptionStatus` | `needs_review` · `resolved` |

## 4. Key lifecycles

```mermaid
flowchart LR
    subgraph RENDER["Render lifecycle"]
        M1["media PENDING"] --> M2["PROCESSING"] --> M3["COMPLETE"]
        M2 --> M4["FAILED"]
        M4 --> M1
    end
    subgraph QUIZ["Quiz lifecycle"]
        Q1["row generating"] --> Q2["ready"]
        Q1 --> Q3["failed"]
        Q3 --> Q1
    end
    subgraph MASTERY["Mastery lifecycle"]
        S1["locked"] --> S2["available"] --> S3["learning"] --> S4["mastered"]
        S3 --> S5["needs-revisit"]
        S5 --> S3
    end

    classDef data fill:#DCFCE7,stroke:#15803D,stroke-width:2px,color:#0b3d1e
    classDef job fill:#FEF3C7,stroke:#B45309,stroke-width:2px,color:#5c3a06
    classDef svc fill:#F5D5D0,stroke:#6d0e00,stroke-width:2px,color:#4a0d00
    class M1,M2,M3,M4 job
    class Q1,Q2,Q3 data
    class S1,S2,S3,S4,S5 svc
```
![03-lifecycles](./03-lifecycles.svg)

