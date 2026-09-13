import re
import json

def _strip_code_fences(text: str) -> str:
    stripped = text.strip()
    
    # Handle complete fenced block
    match = re.search(r"```(?:json|python)?\s*(.*?)\s*```", stripped, re.DOTALL)
    if match:
        return match.group(1).strip()
    
    # Handle truncated/unclosed fence
    stripped = re.sub(r"^```(?:json|python)?\s*", "", stripped)
    stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()


def extract_json(text: str):
    cleaned = _strip_code_fences(text)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Determine expected top-level type from first non-whitespace char
    first_char = next((ch for ch in cleaned if not ch.isspace()), "")
    expected_type = {"{": dict, "[": list}.get(first_char)

    if expected_type is None:
        raise ValueError("No JSON object or array found in LLM output")

    decoder = json.JSONDecoder()
    candidates = []
    start_idx = cleaned.index(first_char)  # safe: we know first_char exists

    for idx in range(start_idx, len(cleaned)):
        if cleaned[idx] not in "[{":
            continue
        # Only attempt parse from the outermost opening character
        if idx != start_idx:
            continue
        try:
            value, end_idx = decoder.raw_decode(cleaned[idx:])
            if isinstance(value, expected_type):
                candidates.append((end_idx, value))
        except json.JSONDecodeError:
            continue

    if candidates:
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0][1]

    raise ValueError("No JSON object or array found in LLM output")