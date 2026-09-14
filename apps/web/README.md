# Web app

Learner SPA (React + Vite, nginx in prod). User-facing at `http://localhost`;
nginx proxies same-origin `/api` to the FastAPI backend.

**Status: built and designed, still reading mock services.** Wiring the mock
services in `src/services/` to the real endpoints is the remaining work —
see `docs/archive/pending.md` §2 for the page-by-page mapping table and
`backend-endpoints.md` for the original contract.

The Google Sign-In button is already wired (GIS id_token → `POST /api/auth/google`).
