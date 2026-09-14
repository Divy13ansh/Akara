# Scoring (`services/scorer/` + `services/api/*` + `services/worker/main.py`)

Two tiers. Neither blocks audio.

## Tier 1 — live signal (in-call, lightweight)

Goal: steer the tutor, not grade. Keep in memory, emit every ~2 turns:

- Which rubric points look covered/missed so far (heuristic or tiny NLI).
- No extra LLM call. If using the tutor LLM, read its internal reasoning;
  don't add a `Score Tool` function call in the hot path (latency + cost).

Output stays inside the session. Never shown as a grade to the student.

## Tier 2 — post-call judge (async, auditable)

Trigger: `POST /webhooks/transcript` with `transcript.json`.
Model: `Qwen2.5-7B` DPO-aligned not to leak (same family as tutor, separate
adapter). Steps per rubric point:

1. `multilingual-e5` cosine: transcript sentences vs rubric point -> candidates.
2. Entailment check: does the student text entail the point, or just parrot
   keywords? Labels: `covered / missed / misconceived` + evidence quote.
3. `mastery = mean(weights)`, misconceived = 0, missed = 0, covered = 1.
   Bonus example point weighs 0.5.

Why better than pure LLM-as-judge: per-point recall + quotes make it auditable
by teachers; similarity pre-filter reduces hallucinated credit for fluency;
human spot-checks can overturn a point without re-running everything.

## Storage

- Raw: `transcript.json` per room (immutable).
- Derived: `coverage_points` rows per (student_id, concept_id) via the arq
  worker (`score_session`), mastery rolled up in `services/api/mastery.py`.
- `GET /progress/{student_id}` returns mastery trail for dashboards later.

## Eval before trusting scores

- 50-100 labeled transcripts: teacher marks per-point covered/missed.
- Report per-point precision/recall, not just overall accuracy.
- Keep scorer model version in every JSON (`scorer_model` field).
