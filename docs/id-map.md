# Concept ID scheme (D-1)

The catalog is seeded from `packages/akara_db/syllabus.json` — every concept id
follows `{subj}{class}-{slug}` (e.g. `sci10-chemical-reactions`,
`math10-quadratic-equations`, `phy11-newton3`). Chapter ids are
`c{class}-{syllabus_id}` because syllabus ids collide across classes.

The per-frontend-concept mapping from the earlier mock-catalog seed is
obsolete; it will be regenerated during the frontend rewiring phase.

## Gold-topic renames (D-13)

| Syllabus topic | Canonical topic_id |
|---|---|
| Inertia of a body (class 11 Physics, Laws of Motion) | `phy11-inertia` |
| Action and Reaction forces (class 11 Physics, Laws of Motion) | `phy11-newton3` |
