# Feynman Pipeline (Teach-It-Back)

The student explains the concept back; Akara probes the gaps until mastery.
Two loops, one scoring core. Code: `services/voice/agent.py`,
`services/api/routers/explanations.py`, `services/worker/main.py`,
`services/api/mastery.py`.

## 1. Voice loop (Explain → tap Akara → LiveKit)

```mermaid
sequenceDiagram
    autonumber
    participant S as Student
    participant W as Web (blob)
    participant API as api /token
    participant LK as LiveKit Cloud
    participant A as Voice agent
    participant STT as VEXYL-STT
    participant LLM as Gemma LLM
    participant TTS as Cartesia TTS
    S->>W: tap Akara
    W->>API: GET /token?topic&lang
    API-->>W: LiveKit token + room
    W->>LK: join room + mic
    LK->>A: dispatch (metadata: topic, lang, student)
    A->>A: instructions IN session language
    A->>S: greeting + first question (student's language)
    loop every turn
        S->>STT: speech (hi-IN …)
        STT-->>A: transcript
        A->>LLM: rubric-level probe
        LLM-->>A: one question
        A->>TTS: speak (session lang)
        TTS-->>S: audio (blob pulses)
    end
    S->>W: tap Akara / EndCallTool
    A->>API: POST /webhooks/transcript (secret)
    API->>API: enqueue score_session
```
![05-voice-sequence](./05-voice-sequence.svg)


- STT language is full BCP-47 (`hi-IN`); TTS voice follows the session language.
- The blob is purely visual: `user-speaking` while you talk, `blob-speaking`
  while mentor audio plays — all sound comes from LiveKit, never browser TTS.
- The agent walks rubric levels L1→L4 in order, one question per turn, and only
  ends the call when every level is evidenced (or the student stops).

## 2. Text loop (Feynman check)

```mermaid
sequenceDiagram
    autonumber
    participant S as Student
    participant W as Web
    participant API as api
    participant WRK as worker
    S->>W: type explanation + submit
    W->>API: POST evaluate-explanation
    API->>API: heuristic score (instant)
    API->>API: coverage rows + mastery apply
    API->>WRK: enqueue score_session (LLM refine)
    WRK->>API: best-of coverage wins
    API-->>W: headline + % + covered / to-revisit
```
![05-text-sequence](./05-text-sequence.svg)


- Instant heuristic (stopwords removed EN+HI, stem/substring match) answers
  immediately; the arq LLM job refines afterwards — best-of wins.
- Clearing the 0.7 gate resolves open misconception diagnostics for the concept.

## 3. Scoring → mastery → unlocks

```mermaid
flowchart TD
    E["Evidence<br/>coverage_points + evidence quotes"] --> M{"best_mastery ≥ 0.7?"}
    M -->|yes| U["MASTERED<br/>unlock dependents<br/>resolve diagnostics"]
    M -->|no, errors| R["needs-revisit<br/>misconception rows"]
    M -->|no, thin| L["learning<br/>keep probing"]
    R --> P["Progress: Topics to Revisit"]
    U --> P2["Progress: mastery % up"]

    classDef data fill:#DCFCE7,stroke:#15803D,stroke-width:2px,color:#0b3d1e
    classDef svc fill:#F5D5D0,stroke:#6d0e00,stroke-width:2px,color:#4a0d00
    classDef job fill:#FEF3C7,stroke:#B45309,stroke-width:2px,color:#5c3a06
    class E data
    class M job
    class U,R,L svc
    class P,P2 data
```
![05-scoring-flow](./05-scoring-flow.svg)

