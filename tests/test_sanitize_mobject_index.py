"""Tests for the safe-index sanitizer (stage2_manim._sanitize_mobject_index).

A single-string ``MathTex(r"x^n")`` is ONE mobject, so codegen that writes
``eq[1].animate.set_color(BLUE)`` crashes the render with
``IndexError: range object index out of range``. The sanitizer routes those
subscripts through ``_akara_part`` (an out-of-range index becomes a no-op) so a
purely cosmetic emphasis can't burn the LLM-fixer retries into a placeholder.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "video" / "app"))
sys.path.insert(0, str(ROOT / "services" / "video" / "app" / "stages"))

from stage2_manim import (
    _AKARA_PART_HELPER,
    _sanitize_mobject_index,
    split_manim_code_to_files,
)

# The exact shape that failed every maths-exponents scene (Scene1_GhataKiPehchan).
CRASHING_SCENE = '''from manim import *


class Scene1_GhataKiPehchan(Scene):
    def construct(self):
        eq = MathTex(r"x^n")
        eq.scale(2.2)
        self.play(Write(eq), run_time=2)
        self.play(eq[0].animate.set_color(BLUE), eq[1].animate.set_color(RED), run_time=1)
        self.wait(2.5)
'''


def test_math_tex_subscript_is_rewritten():
    out = _sanitize_mobject_index(CRASHING_SCENE)
    assert "eq[0]" not in out
    assert "eq[1]" not in out
    assert "_akara_part(eq, 0)" in out
    assert "_akara_part(eq, 1)" in out


def test_helper_defined_once_and_before_scene_class():
    out = _sanitize_mobject_index(CRASHING_SCENE)
    assert out.count("def _akara_part(") == 1
    # The prefix up to the first Scene class is what gets copied into every
    # split scene file — the helper has to live there.
    assert out.index("def _akara_part(") < out.index("class Scene1_GhataKiPehchan")


def test_idempotent():
    once = _sanitize_mobject_index(CRASHING_SCENE)
    assert _sanitize_mobject_index(once) == once


def test_non_tex_variables_untouched():
    code = (
        'vals = [1, 2, 3]\n'
        'items = VGroup(Text("a"), Text("b"))\n'
        'x = vals[1]\n'
        'y = items[2]\n'
    )
    assert _sanitize_mobject_index(code) == code


def test_symbolic_index_untouched():
    # Only literal indices can be judged statically; a loop variable is left alone.
    code = 'eq = MathTex(r"a + b")\nfor i in range(2):\n    eq[i].set_color(BLUE)\n'
    assert "eq[i]" in _sanitize_mobject_index(code)


class _FakeVGroup:
    """Stand-in for manim.VGroup (empty, no-op animations)."""


class _FakeMobject:
    """Mimics manim.Mobject.__getitem__ for a 0-origin/submobject hybrid."""

    def __init__(self, submobjs):
        self.submobjects = list(submobjs)

    def __len__(self):
        return len(self.submobjects)

    def __getitem__(self, value):
        index = range(len(self))[value]  # raises IndexError, like Manim
        return self if index == 0 else self.submobjects[index - 1]


def _load_helper():
    namespace = {}
    exec(_AKARA_PART_HELPER, {"VGroup": _FakeVGroup}, namespace)  # noqa: S102
    return namespace["_akara_part"]


def test_helper_degrades_out_of_range_to_no_op():
    part = _load_helper()
    single_string_math_tex = _FakeMobject(["x^n"])
    assert part(single_string_math_tex, 0) is single_string_math_tex
    assert isinstance(part(single_string_math_tex, 1), _FakeVGroup)


def test_helper_keeps_valid_submobject():
    part = _load_helper()
    two_part_math_tex = _FakeMobject(["a", "b"])
    assert part(two_part_math_tex, 0) is two_part_math_tex
    assert part(two_part_math_tex, 1) == "a"
    assert isinstance(part(two_part_math_tex, 2), _FakeVGroup)


def test_helper_lands_in_every_split_scene_file(tmp_path, monkeypatch):
    import stage2_manim

    monkeypatch.setattr(stage2_manim, "OUTPUTS_DIR", tmp_path)
    code = _sanitize_mobject_index(
        CRASHING_SCENE
        + '\n\nclass Scene2_Next(Scene):\n    def construct(self):\n'
        + '        eq = MathTex(r"x")\n        self.play(eq[1].animate.set_color(RED))\n'
    )
    files = split_manim_code_to_files(code)
    assert len(files) == 2
    for path in files.values():
        text = path.read_text(encoding="utf-8")
        assert "def _akara_part(" in text, path.name
        assert "from manim import *" in text, path.name
