# Video pipeline (future, disconnected)

Manim CE explainer library. Deliberately NOT wired to voice yet — voice works
from hand-written `script/rubric` per `topic_id`.

## Intended flow (when linked)

```
NCERT passage (via akara-rag)
 -> Scene Decomposition (Scene Graph JSON: hierarchy, concept blocks)
 -> Narrative/Timing engine (timestamped script + persona tuning)
 -> Manim CodeGen (Qwen2.5-7B LoRA -> Python AST -> Manim CE headless render -> mp4)
 -> Neural TTS dub (.wav + phoneme timestamps, per lang, no re-render)
 -> Remotion/FFmpeg stitch (PiP, subtitles, keyframes) -> final mp4
 -> tag {topic_id, grade, chapter, lang} -> repo (instant replays, queue renders)
```

Persona/SadTalker avatar = documented future only; current system audio-only.

## Why disconnected now

- Voice needs `script/rubric` quality first; video needs render throughput
  (benchmark: ~360 vids/day one homelab machine, 500-700 concepts <2 weeks).
- Join key later is just `topic_id`. Same grounded script produces both the
  video narration and the diagnostic Feynman question ("closes with a spoken
  checkpoint").

## Home for this code

`services/video/` (own env: manim system deps, GPU torch, ffmpeg).
Do not import video code from voice or api. Share only `topic_id` + `script`.
