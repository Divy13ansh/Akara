"""Seed the ENTIRE NCERT catalog into Postgres from packages/akara_db/syllabus.json.

(D-2: backend owns the catalog; D-1: canonical IDs {subj}{class}-{slug}.)

What it does:
  - subjects: 5 fixed rows (science/maths 6-10|12, physics/chemistry/biology 11-12)
  - chapters: every chapter in syllabus.json → chapters.id = "c{class}-{syllabus_id}"
    (syllabus IDs collide across classes, e.g. `integers` in 6 & 7, `statistics` in 10/11/12)
  - classes 11-12 bundle P/C/B under "science" in the JSON; the chapter-id prefix
    (physics-chapter-N-… / chemistry-unit-N-… / biology-chapter-N-…) splits them into
    the proper subjects, with per-subject chapter numbers parsed from the ID.
  - concepts: one per syllabus topic → id "{subjcode}{class}-{slug}", ordered within
    the chapter, with chained prerequisites (topic N requires topic N-1).
  - junk topics (chapter-intro sentences, investigatory-project notes) are skipped.

GOLD OVERRIDES: two Laws-of-Motion topics are renamed to the canonical gold IDs the
voice agent / scorer / tests already use (D-13): "Inertia of a body" → phy11-inertia,
"Action and Reaction forces" → phy11-newton3 (prereq: phy11-inertia).

Idempotent: wipes the catalog tables (TRUNCATE ... CASCADE — also clears sessions,
mastery, media etc. that reference concepts; users survive) and reseeds. On every
`docker compose up` it only runs when the catalog is empty (seed_if_empty.py);
run manually with `uv run python scripts/seed_curriculum.py`.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "packages"))
sys.path.insert(0, str(ROOT / "services"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env.local")

import akara_db.models  # noqa: F401
from akara_db.base import get_sessionmaker
from akara_db.models import Chapter, Concept, Subject
from sqlalchemy import text

SYLLABUS_PATH = ROOT / "packages" / "akara_db" / "syllabus.json"

# ───────────────────────────────────────────────────────────── subjects

SUBJECTS = [
    {"id": "science", "name": "Science", "code": "SCI",
     "description": "Physics, Chemistry & Biology principles from NCERT",
     "class_min": 6, "class_max": 10},
    {"id": "maths", "name": "Maths", "code": "MATH",
     "description": "Algebra, Geometry, Trigonometry, Statistics & Number Systems",
     "class_min": 6, "class_max": 12},
    {"id": "physics", "name": "Physics", "code": "PHY",
     "description": "Mechanics, Electromagnetism, Optics and Modern Physics",
     "class_min": 11, "class_max": 12},
    {"id": "chemistry", "name": "Chemistry", "code": "CHEM",
     "description": "Physical, Inorganic, and Organic Chemistry fundamentals",
     "class_min": 11, "class_max": 12},
    {"id": "biology", "name": "Biology", "code": "BIO",
     "description": "Diversity of Life, Cell Biology, Genetics & Physiology",
     "class_min": 11, "class_max": 12},
]

# syllabus.json subject key → (subject_id, concept_id code)
SUBJECT_KEY_MAP = {
    "mathematics": ("maths", "math"),
    "science": ("science", "sci"),  # classes 6-10; split below for 11-12
}

# 11-12 "science" chapter-id prefix → (subject_id, concept_id code)
SCI_SPLIT_PREFIX = {
    "physics-": ("physics", "phy"),
    "chemistry-": ("chemistry", "chem"),
    "biology-": ("biology", "bio"),
}

CHAPTER_NUM_RE = re.compile(r"(?:chapter|unit)-(\d+)")
CHAPTER_NAME_PREFIX_RE = re.compile(r"^(Physics|Chemistry|Biology)\s+(Chapter|Unit)\s+\d+:\s*")

# topic text that is a chapter blurb / project note rather than a teachable topic
JUNK_PATTERNS = (
    re.compile(r"^[a-h]\)\s"),  # investigatory-project step lists
    re.compile(r"^note\b", re.IGNORECASE),
    re.compile(r"investigatory project", re.IGNORECASE),
)

# Gold-topic renames (D-13): syllabus topic slug → canonical concept id
GOLD_RENAMES: dict[str, dict[str, str]] = {
    # class 11 physics → "c11-chapter-4-laws-of-motion" (prefix stripped)
    "c11-chapter-4-laws-of-motion": {
        "inertia": "phy11-inertia",
        "newton-s-third-law-of-motion": "phy11-newton3",
    },
    # class 10 maths → keep the gold quadratic concept id used by akara_rag/tests
    "c10-quadratic-equations": {
        "standard-form-of-a-quadratic-equation-ax2-bx-c-0": "math10-quadratic",
    },
}

# Extra metadata for specific concept ids (constellation topic-groups, domains)
ENRICH: dict[str, dict[str, str]] = {
    "phy11-inertia": {"topic_name": "Newton's Laws", "domain": "Mechanics"},
    "phy11-newton3": {"topic_name": "Newton's Laws", "domain": "Mechanics"},
}


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:60] or "topic"


def is_junk(topic: str) -> bool:
    return len(topic) > 90 or any(p.search(topic) for p in JUNK_PATTERNS)


def _append_concepts(out: list[dict], ch: dict, chapter_id: str,
                     subject_id: str, code: str, cls: int, chapter_number: int,
                     used_ids: set[str]) -> None:
    """Append one concept per teachable topic. `used_ids` guarantees global id
    uniqueness: the first occurrence of a slug keeps the clean id, a reuse in
    another chapter gets '-ch{N}', a reuse within the same chapter gets -2, -3…"""
    renames = GOLD_RENAMES.get(chapter_id, {})
    order = 0
    prev_id: str | None = None
    for raw in ch.get("topics", []):
        topic = clean_topic(raw)
        if not topic:
            continue
        # continuation fragment: merge into the previous topic (e.g.
        # "momentum and Newton's" + "second law of motion")
        if prev_id is not None and topic[:1].islower() and out and MERGE_TAIL_RE.search(out[-1]["name"]):
            out[-1]["name"] = f"{out[-1]['name']} {topic}"
            continue
        if is_junk(topic):
            continue
        base_slug = slugify(topic)
        concept_id = renames.get(base_slug, f"{code}{cls}-{base_slug}")
        if concept_id in used_ids:  # collision → chapter-scoped, then numbered
            concept_id = f"{code}{cls}-{base_slug}-ch{chapter_number}"
            k = 2
            while concept_id in used_ids:
                concept_id = f"{code}{cls}-{base_slug}-{k}"
                k += 1
        used_ids.add(concept_id)
        order += 1
        out.append({
            "id": concept_id,
            "chapter_id": chapter_id,
            "subject_id": subject_id,
            "name": topic,
            "order": order,
            "prereq": prev_id if prev_id != concept_id else None,
            "class_": cls,
        })
        prev_id = concept_id


MERGE_TAIL_RE = re.compile(r"('s|\b(and|or|of|the|in|with|for)\s*)$", re.IGNORECASE)


def clean_topic(topic: str) -> str:
    """Normalise a syllabus topic line: strip trailing periods and unbalanced
    parens (the 11/12 entries split phrases like '(vehicle on a level circular
    road' across lines)."""
    topic = topic.strip().rstrip(".").strip()
    if topic.startswith("(") and not topic.endswith(")"):
        topic = topic[1:].strip()
    if topic.endswith(")") and not topic.startswith("(") and "(" not in topic:
        topic = topic[:-1].strip()
    return topic


def apply_gold_overrides(concepts: list[dict]) -> None:
    """Renamed gold topics need their chain rewired (D-13 semantics: inertia
    BEFORE newton3). In the syllabus inertia is topic 2 and the third law is
    topic 7, so the order is already correct — just point newton3's prereq at
    inertia (a valid DAG edge even with topics between them). Swap orders if a
    future syllabus edit ever inverts them."""
    by_id = {c["id"]: c for c in concepts}
    inertia = by_id.get("phy11-inertia")
    newton3 = by_id.get("phy11-newton3")
    if inertia is None or newton3 is None:
        return
    if newton3["order"] < inertia["order"]:
        inertia["order"], newton3["order"] = newton3["order"], inertia["order"]
    newton3["prereq"] = "phy11-inertia"


def load_catalog() -> tuple[
    list[dict],  # subjects
    list[dict],  # chapters
    list[dict],  # concepts
]:
    data = json.loads(SYLLABUS_PATH.read_text())

    chapters: list[dict] = []
    concepts: list[dict] = []
    used_ids: set[str] = set()

    for block in sorted(data, key=lambda b: b["class"]):
        cls = block["class"]
        for subj_key, sdata in block["subjects"].items():
            if cls >= 11 and subj_key == "science":
                # split bundled P/C/B chapters by id prefix
                for ch in sdata["chapters"]:
                    match = next((v for k, v in SCI_SPLIT_PREFIX.items()
                                  if ch["id"].startswith(k)), None)
                    if match is None:  # unknown prefix — keep under science
                        match = ("science", "sci")
                    subject_id, code = match
                    bare = re.sub(r"^(physics|chemistry|biology)-", "", ch["id"])
                    num_m = CHAPTER_NUM_RE.search(bare)
                    chapter_id = f"c{cls}-{bare}"
                    chapters.append({
                        "id": chapter_id,
                        "subject_id": subject_id,
                        "chapter_number": int(num_m.group(1)) if num_m else 0,
                        "name": CHAPTER_NAME_PREFIX_RE.sub("", ch["name"]),
                        "description": None,
                        "class_": cls,
                    })
                    _append_concepts(concepts, ch, chapter_id, subject_id, code, cls,
                                     chapters[-1]["chapter_number"], used_ids)
            else:
                subject_id, code = SUBJECT_KEY_MAP[subj_key]
                for pos, ch in enumerate(sdata["chapters"], start=1):
                    chapter_id = f"c{cls}-{ch['id']}"
                    chapters.append({
                        "id": chapter_id,
                        "subject_id": subject_id,
                        "chapter_number": pos,
                        "name": ch["name"],
                        "description": None,
                        "class_": cls,
                    })
                    _append_concepts(concepts, ch, chapter_id, subject_id, code, cls,
                                     pos, used_ids)

    apply_gold_overrides(concepts)

    return SUBJECTS, chapters, concepts


async def seed() -> None:
    subjects, chapters, concepts = load_catalog()
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        # Wipe the catalog (CASCADE clears dependent rows: media, render jobs,
        # sessions, mastery, misconceptions, rubric_points, costs). users survive.
        await session.execute(text(
            "TRUNCATE subjects, chapters, concepts RESTART IDENTITY CASCADE"))
        await session.flush()

        for s in subjects:
            session.add(Subject(**s))
        await session.flush()  # ensure subjects insert before chapters
        for ch in chapters:
            session.add(Chapter(**ch))
        await session.flush()  # ensure chapters insert before concepts
        for c in concepts:
            enrich = ENRICH.get(c["id"], {})
            session.add(Concept(
                id=c["id"],
                chapter_id=c["chapter_id"],
                subject_id=c["subject_id"],
                domain=enrich.get("domain"),
                name=c["name"],
                short_description=None,
                topic_name=enrich.get("topic_name"),
                ncert_citation=None,
                order_index=c["order"],
                class_=c["class_"],
                prerequisite_id=c["prereq"],
            ))

        await session.commit()

    print(f"seeded: {len(subjects)} subjects, {len(chapters)} chapters, {len(concepts)} concepts")


def write_id_map() -> None:
    _, _, concepts = load_catalog()
    gold = [c for c in concepts if c["id"] in ("phy11-inertia", "phy11-newton3")]
    lines = [
        "# Concept ID scheme (D-1)",
        "",
        "The catalog is seeded from `packages/akara_db/syllabus.json` — every concept id",
        "follows `{subj}{class}-{slug}` (e.g. `sci10-chemical-reactions`,",
        "`math10-quadratic-equations`, `phy11-newton3`). Chapter ids are",
        "`c{class}-{syllabus_id}` because syllabus ids collide across classes.",
        "",
        "The per-frontend-concept mapping from the earlier mock-catalog seed is",
        "obsolete; it will be regenerated during the frontend rewiring phase.",
        "",
        "## Gold-topic renames (D-13)",
        "",
        "| Syllabus topic | Canonical topic_id |",
        "|---|---|",
    ]
    names = {"phy11-inertia": "Inertia of a body", "phy11-newton3": "Action and Reaction forces"}
    for c in gold:
        lines.append(f"| {names[c['id']]} (class 11 Physics, Laws of Motion) | `{c['id']}` |")
    out = ROOT / "docs" / "id-map.md"
    out.write_text("\n".join(lines) + "\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    asyncio.run(seed())
    write_id_map()
