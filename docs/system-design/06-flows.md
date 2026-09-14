# Key Flows (Auth · Voice Token · Practice Assembly)

## 1. Email auth

```mermaid
sequenceDiagram
    autonumber
    participant S as Student
    participant W as Web
    participant API as api
    S->>W: name + email + password
    W->>API: POST /api/auth/signup
    API-->>W: 201 {token, user}
    W->>W: onboarding (class + language)
    W->>API: PATCH profile
    S->>W: later: email + password
    W->>API: POST /api/auth/login
    API-->>W: 200 {token, user}
```
![06-auth-email](./06-auth-email.svg)


## 2. Google auth (sign-in AND sign-up)

One Tap `id_token` first, popup `access_token` fallback; the backend
auto-creates first-timers and links existing password accounts.
Audience is checked against every configured client id.

```mermaid
sequenceDiagram
    autonumber
    participant S as Student
    participant W as Web
    participant G as Google
    participant API as api
    S->>W: Continue with Google
    W->>G: One Tap prompt
    alt credential returned
        G-->>W: id_token
        W->>API: POST /api/auth/google {id_token}
    else suppressed / dismissed
        W->>G: OAuth popup (token client)
        G-->>W: access_token
        W->>API: POST /api/auth/google {access_token}
    end
    API->>G: verify signature + aud
    API->>API: find by google_id → or email (link) → or auto-create
    API-->>W: 200 {token, user}
```
![06-auth-google](./06-auth-google.svg)


## 3. LiveKit token (drives the whole voice session)

`GET /token?student_id&topic_id&lang` → concept unlock check (soft warnings),
room name, and job metadata `{topic (script, rubric, lang), student_id}`.
The agent reads `lang` for STT (`hi-IN`), TTS voice, and every prompt word.

## 4. Practice tab assembly (one bundle, four activities)

```mermaid
flowchart TD
    P["GET media?lang<br/>(video + quiz + cards + mindmap + mentor)"] --> L["Listen<br/>R2 audio, else mp4 audio track"]
    P --> C["Concept cards<br/>backend flashcards (localized title)"]
    P --> M["Mindmap<br/>backend scene_graph layout"]
    P --> Q["Quiz<br/>backend questions + timer + score"]
    P --> E{"missing piece?"}
    E -->|yes| W["friendly getting-ready<br/>poll + retry, never stale"]
    E -->|no| R["render"]

    classDef svc fill:#F5D5D0,stroke:#6d0e00,stroke-width:2px,color:#4a0d00
    classDef client fill:#DBEAFE,stroke:#3B82F6,stroke-width:2px,color:#1E3A8A
    classDef job fill:#FEF3C7,stroke:#B45309,stroke-width:2px,color:#5c3a06
    class P svc
    class L,C,M,Q client
    class E job
    class W,R svc
```
![06-practice-assembly](./06-practice-assembly.svg)


## 5. Doubts chat (Learn)

```mermaid
sequenceDiagram
    autonumber
    participant S as Student
    participant W as Web
    participant API as api
    participant AZ as Azure
    S->>W: question (+ last 10 turns)
    W->>API: POST doubts {question, history, language}
    API->>AZ: answer grounded in gold script
    AZ-->>API: ≤120 words, formatted, session language
    API-->>W: {answer}
    W->>W: bold + sentence-split render
```
![06-doubts-chat](./06-doubts-chat.svg)

