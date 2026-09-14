# Demo Video — Narration Guide

Maps the `docs/system-design/` diagrams to a talk track. Each beat names the
diagram file to put on screen.

## Beat 1 — The problem (30 s)
> "Every student re-watches the same topic, but every tutor explains it
> differently — and never in the student's own language."

## Beat 2 — What Akara is (45 s)
- **On screen:** `01-hld-journeys.svg`
- "Signup, pick a class and language, and travel Learn → Explain → Practice →
  Progress on a constellation that unlocks as you master concepts."

## Beat 3 — One render serves everyone (60 s)
- **On screen:** `04-video-sequence.svg`, then `04-video-stages.svg`
- "The first student to open a topic triggers a five-stage Manim pipeline —
  scenes, animation, script, voice, stitch — published to a CDN. The second
  student gets it instantly. Zero tokens spent twice."

## Beat 4 — Teach-it-back (60 s)
- **On screen:** `05-voice-sequence.svg`
- "Tap Akara and a LiveKit voice mentor asks you to explain — in Hindi,
  Punjabi, whatever you chose. It walks a four-level rubric, one question at
  a time, and only lets you through when you've proved each level."

## Beat 5 — Proof of learning (30 s)
- **On screen:** `05-scoring-flow.svg`, `02-state-machine.svg`
- "Every answer becomes auditable coverage evidence; 0.7 mastery unlocks the
  next concept, and misses become 'Topics to Revisit'."

## Beat 6 — Under the hood (30 s, optional)
- **On screen:** `01-hld-containers.svg`, `03-er.svg`
- "One compose stack — FastAPI, arq worker, Manim, LiveKit agent, Postgres,
  Redis, R2 — twenty tables, one source of truth."

## B-roll checklist
- Learn page video + formatted doubts chat
- Tapping Akara → live voice session, sound rings
- Practice: listen, cards, mindmap, quiz result popup
- Progress page weak-topic cards
