# Secrets & API Keys — What Each Developer Should Generate

The repo's `.env.local` is **git-ignored** and holds Rachit's personal keys.
If you're setting up the stack on your own machine (or verifying the online
services yourself), generate your **own** credentials below — every one has a
free tier. Copy `.env.example` → `.env.local` and fill in what you generate.

> Never commit real keys. Never paste someone else's token into your own
> `.env.local` unless they explicitly hand it to you.

## Required (stack won't fully work without these)

### 1. HuggingFace token — gated STT model (free)
- **Why**: the `stt` service downloads `ai4bharat/indic-conformer-600m-multilingual`
  (~2.4GB) on first boot. The model repo is **gated** — your account must have
  access, and the download needs a token.
- **Generate**: sign up at https://huggingface.co → visit
  https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual → click
  **"Agree and access repository"** (instant, free) → create a **read** token at
  https://huggingface.co/settings/tokens
- **Env vars**: `HF_TOKEN=hf_...`
- **Verify**: `docker compose up stt && docker compose logs -f stt` →
  `[stt] model ready` then `server ready`; health at :8091/health

### 2. LiveKit — voice agent (free tier)
- **Why**: the `voice` worker registers with a LiveKit project; the browser
  talks to the agent through it.
- **Generate**: create a project at https://cloud.livekit.io (free tier) →
  Settings → **API Keys** → Create key → copy key + secret; project URL is on
  the dashboard
- **Env vars**: `LIVEKIT_URL=wss://<project>.livekit.cloud`,
  `LIVEKIT_API_KEY=...`, `LIVEKIT_API_SECRET=...`
- **Verify**: `docker compose --profile voice up -d voice` → logs show
  `"registered worker"`; then `GET http://localhost/token?student_id=t&topic_id=phy11-inertia`
  returns a JWT and open https://livekit.io/playground with the same URL/creds
  to hear the agent

### 3. Cloudflare R2 — video/audio/avatar storage (free tier: 10GB)
- **Why**: rendered videos, TTS audio, and profile photos are stored in an R2
  bucket and served from its public `r2.dev` URL.
- **Generate**: Cloudflare dashboard → **R2** → (enable with a one-time click;
  no card needed for the free tier) → **Create bucket** (any name, e.g. `akara-dev`)
  → **Settings → Public access: allow / connect r2.dev subdomain** →
  **R2 → API → Manage API tokens → Create API token** with **Object Read & Write**
  scoped to *only your bucket* (not Account-wide)
- **Env vars**: `R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com`,
  `R2_ACCESS_KEY_ID=...`, `R2_SECRET_ACCESS_KEY=...`, `R2_BUCKET=<bucket>`,
  `MEDIA_CDN_BASE=https://pub-<hash>.r2.dev` (shown in bucket Settings),
  `R2_PUBLIC_URL=same`
- **Verify**: `PUT /api/users/me/profile/photo` with a small png → returned
  `profile_photo` URL should serve `image/png` publicly

## Required for content generation (free tiers / credits)

### 4. Azure OpenAI — quiz/flashcards/doubts/scoring
- **Why**: on-demand quiz + scene-graph + flashcards + doubts answers + LLM
  transcript scoring.
- **Generate**: Azure Portal → create an **Azure OpenAI** resource → deploy a
  chat model (e.g. `gpt-4o-mini`) under "Deployments" → grab endpoint + key
- **Env vars**: `AZURE_OPENAI_ENDPOINT=https://<res>.openai.azure.com/`,
  `AZURE_API_KEY=...`, `AZURE_OPENAI_DEPLOYMENT=<deployment-name>`,
  `AZURE_OPENAI_API_VERSION=2024-06-01`
- **Verify**: load `/api/concepts/phy11-inertia/media` twice — second call
  should show `quiz_status: ready` with quiz items (worker log: one Azure call)

### 5. Azure Speech — video narration TTS
- **Why**: stage 4 of the video pipeline (neural voice-over).
- **Generate**: Azure Portal → **Speech service** (free tier F0: 500k chars/mo)
  → Keys and Endpoint
- **Env vars**: `AZURE_SPEECH_KEY=...`, `AZURE_SPEECH_REGION=<e.g. eastus>`
- **Verify**: trigger a render (poll generation-status on an unrendered
  concept) — worker stage `tts` passes, final.mp4 has audio

## Optional

### 6. Google OAuth client — Google sign-in button
- **Why**: `POST /api/auth/google` verifies GIS id_tokens against a client ID.
- **Generate**: https://console.cloud.google.com → APIs & Services →
  Credentials → **OAuth client ID** (Web application) → add JavaScript origins
  `http://localhost:3000` and `http://localhost`. No client_secret needed
  (id_token flow).
- **Env vars**: `GOOGLE_CLIENT_ID=...apps.googleusercontent.com`
- **Verify**: the Continue-with-Google button on /login returns a real token

### 7. Generated locally (NOT from any provider — just run the command)
```sh
openssl rand -hex 32   # → JWT_SECRET
openssl rand -hex 32   # → WEBHOOK_SECRET
```
`JWT_SECRET` signs user sessions; `WEBHOOK_SECRET` guards /webhooks/* and
/internal/* (must match on both sides).

## Minimum viable .env.local for a quick spin

Without Azure content/TTS keys, everything still boots — you just get
no-quiz/no-voice videos. Truly required to boot:

```sh
JWT_SECRET=<openssl rand -hex 32>
WEBHOOK_SECRET=<openssl rand -hex 32>
HF_TOKEN=hf_...                          # stt service
DATABASE_URL=postgresql+psycopg://akara:akara@localhost:5432/akara
ASYNC_DATABASE_URL=postgresql+asyncpg://akara:akara@localhost:5432/akara
REDIS_URL=redis://localhost:6379/0
```

Then `docker compose up -d --build` — web/api/worker/video/stt/postgres/redis
all come up, auth + curriculum + library + progress work out of the box
(seeded from syllabus.json), and media generation activates once you add the
Azure keys.
