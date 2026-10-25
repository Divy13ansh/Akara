"""Tests for quiz_gen._validate_quiz_payload.

Regression for the corrupted 2026-10-25 Hindi row: an LLM tokenizer glitch
emitted `\u001c\u001f\u001f`-style control-character garbage for the topic
title and quiz fields, which persisted into concept_quizzes and rendered as
unreadable "eee" tofu in flashcards / video titles / quiz.
"""

import importlib.util
import sys
from pathlib import Path

import pytest


def _load_quiz_gen():
    spec = importlib.util.spec_from_file_location(
        "quiz_gen", Path(__file__).resolve().parents[1] / "services" / "api" / "quiz_gen.py"
    )
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except ModuleNotFoundError:
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages"))
        spec.loader.exec_module(module)
    return module


quiz_gen = _load_quiz_gen()
_validate = quiz_gen._validate_quiz_payload


@pytest.mark.parametrize(
    "corrupt_string",
    [
        "\x1c\x1f\x1f \x05e\x1f\x1f",  # the actual corrupted Hindi title bytes
        "sin²A + cos²A = 1 \x15\x1f",
    ],
)
def test_control_characters_rejected(corrupt_string):
    data = {"topic_name": corrupt_string, "quiz": [{"question": "q", "options": ["a", "b"]}]}
    with pytest.raises(ValueError):
        _validate(data, "hi")


def test_english_fallback_rejected_for_hindi():
    data = {
        "topic_name": "Proof and applications of the identity",
        "quiz": [
            {
                "question": "What is a zero of a polynomial here?",
                "options": ["option one value", "option two value", "option three", "option four"],
                "explanation": "long english explanation string here too",
            }
        ],
    }
    with pytest.raises(ValueError):
        _validate(data, "hi")


def test_clean_hindi_payload_accepted():
    data = {
        "topic_name": "sin²A + cos²A = 1 की पहचान का प्रमाण और अनुप्रयोग",
        "quiz": [
            {
                "question": "बहुपद का शून्यक क्या होता है?",
                "options": ["x²-4", "a बहुपद का शून्यक है", "मान 0 हो जाए", "कोई नहीं"],
                "correct_index": 0,
            }
        ],
        "summary": {
            "flashcards": [{"front": "यूक्लिड की विभाजन प्रमेयिका", "back": "भागफल।"}],
            # short/neutral strings must not trip the script ratio check
            "key_definitions": [{"term": "x-5", "definition": "शून्यक"}],
            "ncert_summary": "sin²A + cos²A = 1 है। यह पहचान वर्ग समीकरण उदाहरण तथा सिद्धांत पर आधारित है।",
        },
    }
    _validate(data, "hi")  # should not raise


def test_english_payload_accepted_for_english():
    data = {
        "topic_name": "Proof and applications of the identity",
        "quiz": [
            {
                "question": "What is a zero of a polynomial here?",
                "options": ["option one value", "option two value", "option three", "option four"],
            }
        ],
    }
    _validate(data, "en")  # should not raise
