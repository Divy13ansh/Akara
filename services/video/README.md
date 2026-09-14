# Video service

Manim CE + Azure Neural TTS 5-stage render pipeline: scene files → TTS audio →
stitch → R2 upload → callback to the API. See `docs/pipelines/video-pipeline.md`.

Runs as the `video` compose service (:8001). The API's
`POST /internal/render-callback` is fed by this service after upload; render
jobs are created by the API's generation-status endpoint (D-6 auto-trigger)
under a global render-slot cap (D-16).

