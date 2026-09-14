# Akara — System Design Docs

Visual, demo-ready architecture documentation for Akara (NCERT video + Feynman voice tutor).
Every diagram is Mermaid — paste any file into a Mermaid renderer
(GitHub, Notion, mermaid.live, or the demo slides) and it just works.

## Map

| File | What it explains | Best diagram for the demo |
|---|---|---|
| `01-high-level-design.md` | System context, containers, tech stack, user journeys | Container diagram |
| `02-low-level-design.md` | API modules, worker jobs, Redis keys, R2 layout, state machines | Generation-status state machine |
| `03-database.md` | All 20 tables, relationships, enums, lifecycles | ER diagram |
| `04-video-generation-pipeline.md` | Manim render pipeline, callbacks, retry budgets | Stage flowchart + sequence |
| `05-feynman-pipeline.md` | Voice loop + text loop, scoring, mastery, diagnostics | Voice sequence diagram |
| `06-flows.md` | Auth, LiveKit token, transcript webhook, practice assembly | Google auth sequence |
| `../context/demo-script.md` | Narration guide for the demo video itself | — |

## Shared diagram style

All flowcharts use the same palette so the deck feels like one story:

| Color | Meaning |
|---|---|
| Blue | Student / frontend |
| Slate | Edge (nginx) |
| Maroon `#6d0e00` | API service |
| Amber | Background worker (arq) |
| Purple | Video service (Manim) |
| Teal | Voice (LiveKit agent) |
| Green | Data (Postgres / Redis / R2) |
| Orange | External providers (Google, Azure, Cloudflare) |

## Rendering tips for the demo video

- `mermaid.live` → PNG/SVG export at 2x for slides.
- Flowcharts read best left-to-right on wide slides, top-down on portrait.
- Sequence diagrams: enable `autonumber` (already on) when narrating step-by-step.
