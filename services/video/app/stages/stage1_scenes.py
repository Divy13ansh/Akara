import json
from pathlib import Path

from utils.json_safe import extract_json
from utils.llm import call_llm


def generate_scenes(topic: str, level: str = "school", rag_context: str | None = None, language: str = "english", topic_id: str | None = None):
    BASE_DIR = Path(__file__).resolve().parent.parent
    OUTPUT_DIR = BASE_DIR / "outputs"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if topic_id and not rag_context:
        try:
            from packages.akara_rag.retrieve import fetch_topic
            topic_data = fetch_topic(topic_id, lang=language)
            if topic_data:
                if not topic:
                    topic = topic_data.topic
                rag_context = f"Script: {topic_data.script}\nRubric: {topic_data.rubric}"
        except ImportError:
            pass

    prompt = (BASE_DIR / "prompts" / "scene_planner.txt").read_text(encoding="utf-8")
    if rag_context and rag_context.strip():
        safe_rag = str(rag_context).replace("{", "{{").replace("}", "}}")
        prompt += (
            f"\n\nNCERT Textbook Reference (RAG):\n"
            f"IMPORTANT: Base the scene sequence on the following actual textbook excerpts. "
            f"Use the terminology, definitions, and structure exactly as they appear in the textbook:\n"
            f"{safe_rag}"
        )
    if language and language.lower() != "english":
        prompt += (
            f"\n\nIMPORTANT: The target language for the video is {language}. "
            f"You MUST generate the scene JSON fields 'concept', 'action', 'labels_or_equations', and 'color_emphasis' "
            f"entirely in {language}. Keep the 'objects' array names (like 'Circle', 'MathTex') in English so they map to Manim classes."
        )
    prompt = prompt.format(topic=topic, level=level)
    output = call_llm(prompt)
    scenes = extract_json(output)

    (OUTPUT_DIR / "scenes.json").write_text(json.dumps(scenes, indent=2))
    return scenes

