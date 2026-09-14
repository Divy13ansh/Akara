"""Tests for the LaTeX-in-Text sanitizer (stage2_manim._sanitize_text_calls).

`Text()` renders via Pango, which knows nothing about LaTeX — LLM codegen that
writes Text("H_2 \\rightarrow H_2O") puts the markup on screen literally. The
sanitizer converts common TeX vocabulary to Unicode; Tex/MathTex calls are
untouched (there LaTeX is correct and gets compiled).
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "video" / "app"))
sys.path.insert(0, str(ROOT / "services" / "video" / "app" / "stages"))

from stage2_manim import _sanitize_text_calls, _tex_to_unicode  # noqa: E402


def test_chemistry_arrow_and_subscripts():
    code = r'label = Text("H_2 + O_2 \rightarrow H_2O")'
    out = _sanitize_text_calls(code)
    assert "H₂ + O₂ → H₂O" in out
    assert "\\rightarrow" not in out
    assert "_2" not in out


def test_ions_superscript():
    assert _tex_to_unicode(r"H^+") == "H⁺"
    assert _tex_to_unicode(r"OH^-") == "OH⁻"
    assert _tex_to_unicode(r"\text{H}^{2+}") == "H²⁺"


def test_greek_and_symbols():
    assert _tex_to_unicode(r"\Delta H") == "ΔH"
    assert _tex_to_unicode(r"25^\circ C") == "25°C"
    assert _tex_to_unicode(r"\alpha \rightarrow \beta") == "α → β"


def test_frac_sqrt_unwrapped():
    assert _tex_to_unicode(r"\frac{a}{b}") == "a/b"
    assert _tex_to_unicode(r"\sqrt{x}") == "√x"


def test_reversible_reaction():
    out = _sanitize_text_calls(r't = Text("N_2 + 3H_2 \rightleftharpoons 2NH_3")')
    assert "N₂ + 3H₂ ⇌ 2NH₃" in out


def test_text_call_without_backslash_untouched():
    code = 'label = Text("नमस्ते", font_size=44)'
    assert _sanitize_text_calls(code) == code


def test_math_tex_untouched():
    code = r'eq = MathTex(r"H^+ + OH^- \rightarrow H_2O")'
    assert _sanitize_text_calls(code) == code


def test_multiline_text_call():
    code = 't = Text(\n    r"Acids \\rightarrow H^+",\n    font_size=40,\n)'
    out = _sanitize_text_calls(code)
    assert "Acids → H⁺" in out


def test_converts_literal_beside_variable_arg():
    # The literal r"\Delta" is convertible even when a sibling arg references
    # a variable — only literals are rewritten, code around them is preserved.
    code = 't = Text(some_var, r"\Delta")'
    out = _sanitize_text_calls(code)
    assert "some_var" in out
    assert "'Δ'" in out
    assert "\\Delta" not in out


def test_combined_with_indic_sanitizer():
    # The real pipeline runs both: Indic-in-Tex first, then LaTeX-in-Text.
    from stage2_manim import _sanitize_indic_tex
    code = r'eq = MathTex("a", r"\text{ अम्ल क्षार}")'
    out = _sanitize_text_calls(_sanitize_indic_tex(code))
    assert "Text(" in out
    assert "अम्ल क्षार" in out
    assert "\\text" not in out
