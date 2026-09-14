import ast
import json
import re
import shutil
import subprocess
from pathlib import Path

from utils.json_safe import _strip_code_fences, extract_json
from utils.llm import call_llm
from utils.timestamps_extractor import extract_timestamps

# ============================================================
# PATHS (ABSOLUTE, SINGLE SOURCE OF TRUTH)
# ============================================================

# This file: app/stages/stage2_manim.py
PROJECT_ROOT = Path(__file__).resolve().parents[2]

APP_DIR = PROJECT_ROOT / "app"
PROMPTS_DIR = APP_DIR / "prompts"

MEDIA_DIR = PROJECT_ROOT / "media"
OUTPUTS_DIR = PROJECT_ROOT / "outputs"

ANIMATION_PY = OUTPUTS_DIR / "animation.py"
TIMESTAMPS_JSON = OUTPUTS_DIR / "timestamps.json"
SCENES_OUT_DIR = OUTPUTS_DIR / "scenes"

# ============================================================
# REGEX
# ============================================================

SCENE_CLASS_RE = re.compile(
    r"class\s+(Scene\d+(?:_[A-Za-z0-9_]+)?)\s*\((?:Scene|ThreeDScene|MovingCameraScene)\)"
)

# ------------------------------------------------------------
# Indic-in-Tex sanitizer
#
# Manim's Tex/MathTex compile through LaTeX, which cannot render
# Devanagari/Indic glyphs. The project rule (docs + subject prompts) is
# that non-English text goes through Pango `Text`, but LLM codegen still
# slips Indic strings into MathTex (e.g. MathTex("a", r"\text{ बहुपद…")),
# burning the whole LLM fixer budget before a black placeholder. This
# rewrites those call sites deterministically to Text(...) BEFORE any
# render attempt — zero tokens, and pure-ASCII math is left untouched.
# ------------------------------------------------------------

_TEX_CALL_RE = re.compile(r"(?<![\w])(MathTex|Tex)\s*\(")
_NON_LATIN_RE = re.compile(r"[^\x00-\x7F]")
_PY_STRING_RE = re.compile(r"([rRbBuUfF]{0,2})(['\"])((?:\\.|(?!\2).)*)\2", re.DOTALL)


def _matching_paren(code: str, open_idx: int) -> int:
    """Index of the ')' matching the '(' at open_idx (quote-aware), or -1."""
    depth = 0
    i = open_idx
    in_str = False
    quote = ""
    while i < len(code):
        ch = code[i]
        if in_str:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                in_str = False
        elif ch in "'\"":
            in_str = True
            quote = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def _unwrap_tex_string(value: str) -> str:
    """Strip LaTeX wrappers that only make sense inside Tex ($…$, \text{…})."""
    v = value.strip()
    for _ in range(2):
        if len(v) > 1 and v.startswith("$") and v.endswith("$"):
            v = v[1:-1].strip()
        m = re.fullmatch(r"\\text\{(.*)\}", v, re.DOTALL)
        if m:
            v = m.group(1).strip()
    return v


def _sanitize_indic_tex(code: str) -> str:
    """Rewrite Tex/MathTex calls containing non-Latin (Indic) text into Text calls.

    Pure-ASCII math calls and unparseable call sites are left untouched — the
    LLM fixer remains the fallback for anything exotic.
    """
    out: list[str] = []
    last = 0
    for m in _TEX_CALL_RE.finditer(code):
        if m.start() < last:
            continue  # inside a span already rewritten
        open_idx = m.end() - 1
        close_idx = _matching_paren(code, open_idx)
        if close_idx == -1:
            continue
        arg_span = code[open_idx + 1 : close_idx]
        # Only rewrite call sites we can fully parse as an expression, and
        # only when a string literal in the args actually carries non-Latin text.
        try:
            compile("f(" + arg_span + ")", "<sanitize>", "eval")
        except SyntaxError:
            continue
        if not _NON_LATIN_RE.search(arg_span):
            continue

        # Unwrap $…$ / \text{…} in string literals so Text() shows clean prose.
        def _rebuild_span(span: str) -> str:
            result = []
            pos = 0
            for sm in _PY_STRING_RE.finditer(span):
                result.append(span[pos : sm.start()])
                try:
                    value = ast.literal_eval(sm.group(0))
                except Exception:  # noqa: BLE001 - keep unparseable literals as-is
                    result.append(sm.group(0))
                    pos = sm.end()
                    continue
                if isinstance(value, str) and _NON_LATIN_RE.search(value):
                    result.append(repr(_unwrap_tex_string(value)))
                else:
                    result.append(sm.group(0))
                pos = sm.end()
            result.append(span[pos:])
            return "".join(result)

        new_span = _rebuild_span(arg_span)
        suffix = "" if re.search(r"\bfont_size\s*=", new_span) else ", font_size=48"
        out.append(code[last : m.start()])
        out.append("Text(" + new_span + suffix + ")")
        last = close_idx + 1
    if not out:
        return code
    out.append(code[last:])
    return "".join(out)


# ------------------------------------------------------------
# LaTeX-in-Text sanitizer
#
# `Text()` renders through Pango, which knows nothing about LaTeX — an LLM
# that writes Text("H_2 \\rightarrow H_2O") or Text(r"\\text{अम्ल}") puts the
# markup on screen literally. Convert the common TeX vocabulary to Unicode
# (sub/superscripts, arrows, Greek, symbols) BEFORE rendering; Tex/MathTex
# calls are left alone — there LaTeX markup is correct.
# ------------------------------------------------------------

_TEX_TEXT_CALL_RE = re.compile(r"(?<![\w])(MarkupText|Text)\s*\(")
_TEX_WRAPPERS_RE = re.compile(r"\\(?:text|textrm|mathrm|mathbf|mathit|operatorname)\{([^{}]*)\}")
_TEX_FRAC_RE = re.compile(r"\\frac\{([^{}]*)\}\{([^{}]*)\}")
_TEX_SQRT_RE = re.compile(r"\\sqrt\{([^{}]*)\}")
_TEX_CMD_RE = re.compile(r"\\([A-Za-z]+)\s*")  # TeX gobbles space after a control word

_TEX_GREEK = {
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "Delta": "Δ",
    "epsilon": "ε", "zeta": "ζ", "eta": "η", "theta": "θ", "iota": "ι",
    "kappa": "κ", "lambda": "λ", "mu": "μ", "nu": "ν", "xi": "ξ",
    "pi": "π", "rho": "ρ", "sigma": "σ", "Sigma": "Σ", "tau": "τ",
    "phi": "φ", "chi": "χ", "psi": "ψ", "omega": "ω", "Omega": "Ω",
}
_TEX_SYMBOLS = {
    "rightarrow": "→", "to": "→", "leftarrow": "←", "leftrightarrow": "↔",
    "rightleftharpoons": "⇌", "Rightarrow": "⇒", "times": "×", "div": "÷",
    "cdot": "·", "pm": "±", "mp": "∓", "leq": "≤", "geq": "≥", "neq": "≠",
    "ne": "≠", "approx": "≈", "equiv": "≡", "propto": "∝", "infty": "∞",
    "circ": "°", "degree": "°", "perp": "⊥", "parallel": "∥", "angle": "∠",
    "triangle": "△", "prime": "′", "ldots": "…", "cdots": "⋯", "sum": "Σ",
}
_SUPER_MAP = {"0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", "n": "ⁿ", "i": "ⁱ"}
_SUB_MAP = {"0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", "a": "ₐ", "e": "ₑ", "o": "ₒ", "x": "ₓ"}

# A backslash-command we know how to translate (used to detect TeX intent in
# plain literals whose escapes Python already consumed, e.g. "\rightarrow").
_KNOWN_TEX_NAME_RE = re.compile(
    r"\\(?:" + "|".join(sorted(
        set(_TEX_GREEK) | set(_TEX_SYMBOLS) | {"text", "textrm", "mathrm", "mathbf", "mathit", "operatorname", "frac", "sqrt"},
        key=len, reverse=True,
    )) + r")\b"
)

# Symbols that read naturally surrounded by spaces in a Pango label
# (arrows, relations, operators) — Greek letters glue on ("ΔH", not "Δ H").
_SPACED_SYMBOLS = {
    "rightarrow", "to", "leftarrow", "leftrightarrow", "rightleftharpoons",
    "Rightarrow", "times", "div", "cdot", "pm", "mp", "leq", "geq", "neq",
    "ne", "approx", "equiv", "propto", "perp", "parallel",
}


def _map_script(s: str, mapping: dict) -> str | None:
    """Unicode script chars if every char maps, else None (leave verbatim)."""
    if s and all(ch in mapping for ch in s):
        return "".join(mapping[ch] for ch in s)
    return None


def _script_sub(m: re.Match, mapping: dict) -> str:
    content = m.group(1) if m.group(1) is not None else m.group(2)
    mapped = _map_script(content, mapping)
    return mapped if mapped is not None else m.group(0)


def _sym(m: re.Match) -> str:
    name = m.group(1)
    sym = _TEX_SYMBOLS.get(name) or _TEX_GREEK.get(name)
    if sym is None:
        return name  # unknown command: keep the word, drop the backslash
    return f" {sym} " if name in _SPACED_SYMBOLS else sym


def _tex_to_unicode(s: str) -> str:
    """Best-effort LaTeX → plain Unicode for Pango-rendered Text labels."""
    prev = None
    while prev != s:  # unwrap nested \\text{…} etc.
        prev = s
        s = _TEX_WRAPPERS_RE.sub(r"\1", s)
    # TeX gobbles whitespace after a control word: 25^\circ C renders "25°C".
    s = s.replace("\\^{\\circ} ", "°").replace("\\^{\\circ}", "°")
    s = s.replace("^\\circ ", "°").replace("^\\circ", "°")
    s = re.sub(r"\^\{([^{}]*)\}|\^(.)", lambda m: _script_sub(m, _SUPER_MAP), s)
    s = re.sub(r"_\{([^{}]*)\}|_(.)", lambda m: _script_sub(m, _SUB_MAP), s)
    s = _TEX_FRAC_RE.sub(r"\1/\2", s)
    s = _TEX_SQRT_RE.sub(r"√\1", s)
    s = _TEX_CMD_RE.sub(_sym, s)
    s = s.replace("{", "").replace("}", "")
    return re.sub(r"  +", " ", s).strip()


def _unescape_body(body: str) -> str:
    """Raw-literal body → runtime value (only \\\\ collapses to a backslash)."""
    return body.replace("\\\\", "\x00BSL\x00").replace("\x00BSL\x00", "\\")


def _convert_tex_literals(span: str) -> str:
    """Apply _tex_to_unicode to TeX-bearing string literals in the span.

    Raw literals carry TeX in the source body — convert the body directly.
    For plain literals, Python has already consumed escapes at runtime
    ("\\rightarrow" → CR + "ightarrow"), so when the body names a known TeX
    command we convert the SOURCE body (what the author meant); otherwise we
    convert the evaluated value for bare ^/_ markup like "H^+" or "H_2O".
    """
    result: list[str] = []
    pos = 0
    for sm in _PY_STRING_RE.finditer(span):
        result.append(span[pos : sm.start()])
        prefix, body = sm.group(1) or "", sm.group(3)
        is_raw = "r" in prefix.lower()
        is_bytes = "b" in prefix.lower()
        converted: str | None = None
        if not is_bytes and (_KNOWN_TEX_NAME_RE.search(body) or re.search(r"[\^_]|\\\\", body)):
            if is_raw or _KNOWN_TEX_NAME_RE.search(body):
                converted = _tex_to_unicode(_unescape_body(body))
            else:
                try:
                    value = ast.literal_eval(sm.group(0))
                except Exception:  # noqa: BLE001 - keep unparseable literals as-is
                    value = None
                if isinstance(value, str):
                    converted = _tex_to_unicode(value)
        if converted is None:
            result.append(sm.group(0))
        else:
            result.append(repr(converted))
        pos = sm.end()
    result.append(span[pos:])
    return "".join(result)


def _sanitize_text_calls(code: str) -> str:
    """Rewrite LaTeX markup inside Text()/MarkupText() string literals to Unicode."""
    out: list[str] = []
    last = 0
    for m in _TEX_TEXT_CALL_RE.finditer(code):
        if m.start() < last:
            continue  # inside a span already rewritten
        open_idx = m.end() - 1
        close_idx = _matching_paren(code, open_idx)
        if close_idx == -1:
            continue
        span = code[open_idx + 1 : close_idx]
        if "\\" not in span and not re.search(r"[\^_]", span):
            continue  # nothing LaTeX-ish — leave untouched
        out.append(code[last : m.start()])
        out.append(m.group(0) + _convert_tex_literals(span) + ")")
        last = close_idx + 1
    if not out:
        return code
    out.append(code[last:])
    return "".join(out)

# ============================================================
# HELPERS
# ============================================================

def split_manim_code_to_files(manim_code: str) -> dict[str, Path]:
    """
    Split full animation.py into one file per scene class.
    Returns {scene_class_name: file_path}
    """
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Split on class boundaries, keeping the class definition with its body
    parts = re.split(r"(?=^class\s+Scene)", manim_code, flags=re.MULTILINE)
    
    header_lines = []
    scene_files = {}
    
    for part in parts:
        part = part.strip()
        if not part:
            continue
        
        match = SCENE_CLASS_RE.search(part)
        if match:
            class_name = match.group(1)
            file_path = OUTPUTS_DIR / f"{class_name}.py"
            file_path.write_text("\n".join(header_lines) + "\n\n" + part + "\n", encoding="utf-8")
            scene_files[class_name] = file_path
        else:
            # This is the header (imports, helpers before first class)
            header_lines = part.splitlines()
    
    return scene_files

def extract_scene_classes(manim_code: str):
    return SCENE_CLASS_RE.findall(manim_code)


def clean_manim_temp():
    """Remove ALL manim temporary artifacts."""
    for p in [
        MEDIA_DIR / "videos",
        MEDIA_DIR / "Tex",
        MEDIA_DIR / "text",
        MEDIA_DIR / "images",
    ]:
        shutil.rmtree(p, ignore_errors=True)


def render_scene(scene_class_name: str, scene_file: Path = None):
    """Render exactly ONE scene from its own file."""
    target = scene_file or ANIMATION_PY
    subprocess.run(
        ["manim", "-ql", str(target), scene_class_name],
        cwd=PROJECT_ROOT,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def generate_placeholder_video(scene_id: str, index: int, duration: int = 6):
    """Generate a plain black video as a fallback for scenes that failed to render."""
    SCENES_OUT_DIR.mkdir(parents=True, exist_ok=True)
    dst = SCENES_OUT_DIR / f"{index:02d}_{scene_id}.mp4"
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", f"color=c=black:s=854x480:r=15:d={duration}",
            "-c:v", "libx264",
            "-t", str(duration),
            str(dst),
        ],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    print(f"⬛ Placeholder video generated → {dst}")
    return dst


def extract_scene_video(scene_class_name: str, scene_id: str, index: int):
    """Move rendered scene video from media/ → outputs/scenes/"""
    candidates = list(MEDIA_DIR.rglob(f"{scene_class_name}.mp4"))

    if not candidates:
        raise RuntimeError(f"No video found for {scene_class_name}")

    SCENES_OUT_DIR.mkdir(parents=True, exist_ok=True)

    dst = SCENES_OUT_DIR / f"{index:02d}_{scene_id}.mp4"
    import os
    try:
        shutil.move(candidates[0], dst)
    except PermissionError:
        # In Docker, copystat on mounted volumes can fail with PermissionError (operation not permitted)
        # even though the file content was successfully copied.
        if os.path.exists(dst):
            try:
                os.unlink(candidates[0])
            except Exception:
                pass
        else:
            shutil.copyfile(candidates[0], dst)
            try:
                os.unlink(candidates[0])
            except Exception:
                pass

    print(f"🎬 Saved → {dst}")
    return dst


def fix_manim_code_with_llm(scene_code: str, error: str) -> str:
    prompt = f"""You are an expert Manim debugger.

Rules:
- Fix ONLY the runtime or syntax error shown
- Do NOT rename the Scene class
- NEVER pass Devanagari/Indic text to Tex or MathTex — LaTeX cannot compile Indic scripts; use Text('...') for those labels
- Inside Text('...') labels, write plain Unicode (H₂, H⁺, →, ⇌, α, °) — never LaTeX commands like \\text, \\rightarrow, _2 or ^+ (Pango renders them literally)
- Return ONLY valid Python code, no markdown fences, no explanation

Broken Manim code:
{scene_code}

Error:
{error}
"""
    return call_llm(prompt).strip()


MAX_RETRIES = 2

def generate_manim(scenes, rag_context: str | None = None, language: str = "english"):
    # ---------- Generate Manim code ----------
    scenes_json = json.dumps(scenes)
    scenes_category = scenes["category"]
    prompt_path = PROMPTS_DIR / f"{scenes_category.lower()}_manim.txt"
    prompt = prompt_path.read_text(encoding="utf-8").replace(
        "{scenes_json}", scenes_json
    )
    if rag_context and rag_context.strip():
        safe_rag = str(rag_context).replace("{", "{{").replace("}", "}}")
        prompt += (
            f"\n\nTextbook Reference Context (RAG):\n"
            f"Use the following NCERT textbook excerpts to ensure the animation "
            f"accurately reflects the curriculum (correct terminology, structure, "
            f"and key concepts):\n{safe_rag}"
        )
    if language and language.lower() != "english":
        prompt += (
            f"\n\nIMPORTANT: Since the target language is {language}, the labels and text will contain non-English characters. "
            f"You MUST use standard Manim `Text('...')` (or `MarkupText('...')`) for all non-English text labels and annotations. "
            f"Do NOT use `Tex('...')` or `MathTex('...')` for non-English unicode text characters as they will fail to compile in LaTeX. "
            f"Only use `MathTex` for pure mathematical formulas (like 'F = m a') using standard math variables."
        )

    manim_code = ""
    scene_classes = []
    
    # Retry up to 3 times to get the correct number of scene classes
    for attempt in range(3):
        try:
            output = call_llm(prompt)
            data = extract_json(output)
            manim_code = _sanitize_text_calls(_sanitize_indic_tex(data["manim_code"]))
            
            # Harden against self.wait(<=0)
            def fix_wait_durations(match):
                try:
                    val = float(match.group(1))
                    if val <= 0:
                        return "self.wait(1.0)"
                except Exception:
                    pass
                return match.group(0)
                
            manim_code = re.sub(
                r"self\.wait\(\s*(-?\d+(?:\.\d+)?)\s*\)",
                fix_wait_durations,
                manim_code
            )
            
            scene_classes = extract_scene_classes(manim_code)
            
            if len(scene_classes) == len(scenes["scenes"]):
                break
            else:
                print(f"⚠️ Scene count mismatch on attempt {attempt+1}: expected {len(scenes['scenes'])}, got {len(scene_classes)}")
        except Exception as e:
            print(f"⚠️ Error during Manim generation attempt {attempt+1}: {e}")
            import traceback
            traceback.print_exc()
            if 'output' in locals():
                print(f"DEBUG: Raw LLM output (first 1000 chars):\n{output[:1000]}")

    if len(scene_classes) != len(scenes["scenes"]):
        raise RuntimeError(
            f"Scene count mismatch between JSON ({len(scenes['scenes'])}) and Manim code ({len(scene_classes)}) after 3 attempts."
        )

    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
# Write the monolithic file (keep for reference/timestamps)
    ANIMATION_PY.write_text(manim_code, encoding="utf-8")

    timestamps = extract_timestamps(manim_code)
    TIMESTAMPS_JSON.write_text(json.dumps(timestamps, indent=2))

    # Split into per-scene files
    scene_files = split_manim_code_to_files(manim_code)

    final_scene_ids = []

    for idx, scene_class in enumerate(scene_classes, start=1):
        scene_id = f"scene_{idx}"
        scene_file = scene_files.get(scene_class)

        if not scene_file or not scene_file.exists():
            print(f"⚠️ No file found for {scene_class} — inserting placeholder.")
            generate_placeholder_video(scene_id, idx)
            final_scene_ids.append((idx, scene_id))
            continue

        success = False
        for attempt in range(1, MAX_RETRIES + 2):  # attempts 1..MAX_RETRIES+1
            try:
                clean_manim_temp()
                render_scene(scene_class, scene_file)
                extract_scene_video(scene_class, scene_id, idx)
                final_scene_ids.append((idx, scene_id))
                print(f"✅ Rendered {scene_class}")
                success = True
                break

            except (subprocess.CalledProcessError, RuntimeError) as e:
                stderr_text = e.stderr if hasattr(e, "stderr") and e.stderr else str(e)
                print(f"\n{'='*80}")
                print(f"❌ Manim error in {scene_class} (attempt {attempt}/{MAX_RETRIES})")
                print(f"{'-'*80}\n{stderr_text}\n{'='*80}")

                if attempt <= MAX_RETRIES:
                    scene_code = scene_file.read_text(encoding="utf-8")
                    fixed_code = fix_manim_code_with_llm(scene_code, stderr_text)
                    fixed_code = _sanitize_text_calls(_sanitize_indic_tex(_strip_code_fences(fixed_code)))  # json_safe + Indic-in-Tex + LaTeX-in-Text guards

                    # Validate before writing
                    try:
                        compile(fixed_code, str(scene_file), "exec")
                    except SyntaxError as se:
                        print(f"⚠️ LLM fix has SyntaxError ({se}) — skipping write.")
                        continue

                    scene_file.write_text(fixed_code, encoding="utf-8")
                    print(f"🛠 Fix written to {scene_file.name}")

        if not success:
            print(f"⬛ {scene_class} failed all retries — inserting placeholder.")
            generate_placeholder_video(scene_id, idx)
            final_scene_ids.append((idx, scene_id))

    return {
        "manim_code": manim_code,
        "timestamps": timestamps,
        "scene_ids": final_scene_ids,
    }

def clean_manim_output():
    video_dir = Path("media/videos/animation/480p15")
    video_dir.mkdir(parents=True, exist_ok=True)

    for f in video_dir.glob("*.mp4"):
        f.unlink()

