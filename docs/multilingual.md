# Multilingual

Requirement: learn + assess in the language the student actually uses
(Hindi / regional / English / Hinglish codeswitch).

## Current behavior (and gap)

- STT `language="multi"` (Nova-3 multilingual, includes Hindi) — good.
- TTS `language="hi"` hardcoded — bad. Forces Hindi prosody even for English
  answers, mismatched with British Lady voice. Fix next (see below).
- `keyterm_detection` is English-only on Deepgram — no-op for Hindi, not error.
- Prompt says "match the student's language, don't force pure English" — good,
  but needs the audio layers to cooperate.

## Target contract

1. `apps/web` picker sends explicit `lang` (e.g. `hi`, `en`, `hinglish`) to
   `GET /token`.
2. `services/api/tokens.py` puts `lang` into `TopicData` + job metadata.
3. `services/voice/agent.py` uses it to init STT + TTS per session, and
   re-matches per turn if the student switches (Hinglish is normal).
4. Transcript records `stt_lang` + confidence per student turn for audit.

## Test matrix (do before claiming multilingual)

- Pure Hindi, pure English, Hinglish mid-sentence switch, noisy classroom Hindi.
- Check: STT transcript quality, tutor reply language, TTS intelligibility.
- Regional languages beyond Hindi are future — add one at a time with
  `AI4Bharat IndicASR/TTS` legs (see `open-weights.md`).

## Content note

Rubrics/scripts need Hindi (+ regional) variants per `topic_id`, not machine
translation on the fly. Retrieval filters by `lang`, falls back to EN.
