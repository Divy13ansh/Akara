"""Tests for the Indic-in-Tex sanitizer (services/video/app/stages/stage2_manim.py).

The pipeline rule is: non-English text goes through Pango `Text`, never LaTeX
`Tex`/`MathTex`. The sanitizer deterministically rewrites violations BEFORE the
render/fix loop so a Devanagari-in-MathTex scene can't burn the LLM fixer
budget and degrade to a black placeholder.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "video" / "app"))
sys.path.insert(0, str(ROOT / "services" / "video" / "app" / "stages"))

from stage2_manim import _sanitize_indic_tex  # noqa: E402


def test_math_tex_with_hindi_becomes_text():
    # The exact failure that turned Scene6_ShunyankKaArth into a placeholder.
    code = 'eq = MathTex("a", r"\\text{ बहुपद का शून्यांक है}")'
    out = _sanitize_indic_tex(code)
    assert out.startswith("eq = Text(")
    assert "MathTex" not in out
    assert "\\text{" not in out
    assert "बहुपद" in out  # Devanagari content preserved


def test_pure_ascii_math_untouched():
    code = 'eq = MathTex(r"x = ?")'
    out = _sanitize_indic_tex(code)
    assert out == code


def test_tex_with_inline_hindi_becomes_text():
    code = 'note = Tex(r"When $x = 0$, it is a शून्यांक")'
    out = _sanitize_indic_tex(code)
    assert out.startswith("note = Text(")
    assert "शून्यांक" in out


def test_existing_font_size_preserved():
    code = 'eq = MathTex(r"\\text{मान }", font_size=72)'
    out = _sanitize_indic_tex(code)
    assert "font_size=72" in out
    assert out.count("font_size") == 1  # no duplicate kwarg injected


def test_multiple_calls_mixed():
    code = (
        'a = MathTex(r"a = bq + r")\n'
        'b = MathTex("p", r"\\text{शेषफल}")\n'
        'c = Text("शून्यांक", font_size=44)'
    )
    out = _sanitize_indic_tex(code)
    assert "a = MathTex" in out  # ASCII math stays
    assert "b = Text(" in out  # Indic rewritten
    assert "c = Text(" in out  # Text untouched


def test_multiline_call_rewritten():
    code = 'eq = MathTex(\n    "x",\n    r"\\text{ का मान ज्ञात करें}",\n)'
    out = _sanitize_indic_tex(code)
    assert "eq = Text(" in out
    assert "मान" in out
