# akara-common

Shared `TopicData` / `Transcript` / `Coverage` schemas (pydantic) + enums.
Import this, don't redefine schemas per service. `TopicData.from_metadata_json`
parses the LiveKit job metadata the API embeds in `/token` responses.
