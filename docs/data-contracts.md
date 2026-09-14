# Data contracts (`packages/akara_common`)

Single source of truth. Import `TopicData`, never redefine shapes per service.

## TopicData (pre-session, api -> voice via job metadata)

```json
{
  "topic_id": "phy11-newton3",
  "topic": "Newton's Third Law of Motion",
  "script": "Every action has...",
  "rubric": "1. pairs... 2. equal/opposite... 3. DIFFERENT objects... 4. example...",
  "grade": "9",
  "subject": "physics",
  "lang": "hi"
}
```

- `topic_id`: stable key = `{subject}{grade}-{slug}`. Joins video library,
  FAISS index, voice sessions, scores.
- `script`: gold NCERT-grounded explainer text (also source for Manim video).
- `rubric`: numbered key ideas a correct explanation must contain, including
  the classic misconception explicitly.
- Produced by `packages/akara_rag/retrieve.py::fetch_topic(topic_id)`.

## Transcript (voice -> scorer via webhook)

```json
{
  "room_name": "phy11-newton3-s1-1726...",
  "topic_id": "phy11-newton3",
  "student_id": "s1",
  "lang": "hi",
  "turns": [
    {"role": "tutor", "text": "...", "ts": 0.0},
    {"role": "student", "text": "...", "ts": 4.2, "stt_lang": "hi", "conf": 0.87}
  ],
  "latencies": {"stt_p50": 0.4, "llm_ttft_p50": 0.9, "tts_ttfb_p50": 0.5}
}
```

Save raw `.json` per `room_name`. Never truncate student text before scoring.

## Coverage / score (scorer -> progress)

```json
{
  "topic_id": "phy11-newton3",
  "student_id": "s1",
  "mastery": 0.72,
  "points": [
    {"id": 1, "status": "covered", "evidence": "student quote..."},
    {"id": 2, "status": "covered", "evidence": "..."},
    {"id": 3, "status": "misconceived", "evidence": "...cancel each other..."},
    {"id": 4, "status": "missed", "evidence": ""}
  ],
  "scorer_model": "qwen2.5-7b-dpo",
  "scored_at": "2026-..."
}
```

`status ∈ {covered, missed, misconceived}`. Always keep evidence quotes for audit.
`mastery` = weighted mean, misconceived weighs 0. See `scoring.md`.
