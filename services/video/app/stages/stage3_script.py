import json
from utils.llm import call_llm
from utils.json_safe import extract_json
from pathlib import Path
from paths import PROMPTS_DIR, OUTPUTS_DIR

def generate_script(
    scenes,
    timestamps,
    persona: str = "teacher",
    level: str = "school",
    rag_context: str | None = None,
    language: str = "english",
    topic_id: str | None = None,
    base_script: str | None = None,
):
    if topic_id and not base_script:
        try:
            from packages.akara_rag.retrieve import fetch_topic
            topic_data = fetch_topic(topic_id, lang=language)
            if topic_data and topic_data.script:
                base_script = topic_data.script
        except ImportError:
            pass

    prompt = (PROMPTS_DIR / "script_writer.txt").read_text(encoding="utf-8")

    if base_script and base_script.strip():
        safe_base = str(base_script).replace("{", "{{").replace("}", "}}")
        prompt += (
            f"\n\nGold Canonical Explainer Script:\n"
            f"IMPORTANT: The narration MUST align with the following canonical NCERT script text. "
            f"Do NOT invent new concepts. Divide and adapt this text to match the rendered scene timing:\n"
            f"{safe_base}"
        )

    if rag_context and rag_context.strip():
        safe_rag = str(rag_context).replace("{", "{{").replace("}", "}}")
        prompt += (
            f"\n\nNCERT Textbook Reference (RAG):\n"
            f"IMPORTANT: Use the following textbook excerpts for narration accuracy. "
            f"Quotes, definitions and terminology must match the textbook exactly:\n"
            f"{safe_rag}"
        )

    prompt = prompt.format(
        scenes=json.dumps(scenes),
        timestamps=json.dumps(timestamps),
        persona=persona,
        level=level,
        language=language
    )

    output = call_llm(prompt)
    script = extract_json(output)

    (OUTPUTS_DIR / "script.json").write_text(json.dumps(script, indent=2))
    return script

