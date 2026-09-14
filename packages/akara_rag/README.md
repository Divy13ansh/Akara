# akara-rag

NCERT chunk + embed + FAISS helpers. Offline only — voice loop receives
already-resolved `TopicData` via job metadata. `fetch_topic` now reads the
three gold topics (with script/rubric) from **Postgres** first
(`phy11-inertia`, `phy11-newton3`, `math10-quadratic`), falling back to
SEED_TOPICS when the DB has no row for the topic id.
