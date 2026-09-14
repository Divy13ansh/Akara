# NCERT RAG (`packages/akara_rag`)

Offline only. Voice never queries the VectorDB mid-call — `services/api`
resolves `topic_id -> TopicData` before the room starts.

## Corpus

All NCERT textbooks grades 6-12 (need 9-12 first for Physics/Chem/Maths/Bio).
Keep PDFs/MD in `data/raw/` (gitignored). Curate once, version by checksum.

## What to index (not whole chapters)

Chunk by **concept-block**: 150-300 tokens, one idea per chunk. A 20-page
chapter becomes ~30-60 chunks, each tagged:

```
text, topic_id, grade, subject, chapter, lang, script?, rubric?
```

- Embed with `multilingual-e5` (handles EN + Hindi + regional).
- Index with FAISS (`data/indices/`). Metadata sidecar (SQLite/JSONL) maps
  FAISS id -> TopicData fields.
- One `topic_id` = one script + one rubric. That pair is the gold standard
  for both video generation and voice tutoring. Same source, same wording.

## Rubric authoring (the part that decides quality)

Each rubric needs 3-5 numbered points + the classic misconception spelled out.
Example (Newton 3): pairs / equal+opposite / DIFFERENT objects (not cancelling)
+ bonus real-world example with both objects identified. If the misconception
isn't in the rubric, the tutor can't probe it and the scorer can't catch it.

## Language handling

- Store canonical EN + Hindi (and regional as added) per chunk where possible.
- Retrieval filters by `lang` first, falls back to EN with translation note.
- Re-dubbing a video ≠ re-rendering: same `topic_id`, new TTS voice track.

## Future pipeline steps (not built yet)

1. `scripts/ingest_ncert.py`: PDF -> clean text -> concept chunks -> JSONL
2. `scripts/embed_index.py`: e5 embed -> FAISS build
3. `retrieve.py::fetch_topic(topic_id)`: FAISS + metadata -> TopicData
4. Eval: hit-rate@3 per topic_id on held-out questions before wiring to `/token`.
