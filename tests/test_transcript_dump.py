"""Test that dump_transcript produces valid JSON with correct roles and student_id."""

import asyncio
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "voice"))

from akara_common.schemas import TopicData, Transcript
from voice.agent import dump_transcript


def test_dump_creates_valid_json(tmp_path):
    # Simulate a 2-turn session by writing directly
    transcript = Transcript(
        room_name="test-room-1",
        topic_id="phy11-newton3",
        student_id="stu_test",
        lang="en",
        turns=[
            {"role": "tutor", "text": "Tell me about Newton's third law."},
            {"role": "student", "text": "Every action has an equal and opposite reaction."},
        ],
    )
    out = tmp_path / "test-room-1.json"
    out.write_text(json.dumps(transcript.to_dict(), ensure_ascii=False, indent=2))
    loaded = json.loads(out.read_text())
    assert loaded["student_id"] == "stu_test"
    assert len(loaded["turns"]) == 2
    assert loaded["turns"][0]["role"] == "tutor"
    assert loaded["turns"][1]["role"] == "student"


def test_dump_transcript_function(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    session = MagicMock()
    mock_msg1 = MagicMock()
    mock_msg1.role = "assistant"
    mock_msg1.text = "Tell me about Newton's third law."
    mock_msg2 = MagicMock()
    mock_msg2.role = "user"
    mock_msg2.text = "Every action has an equal and opposite reaction."
    session.chat_ctx.items = [mock_msg1, mock_msg2]

    topic = TopicData(
        topic_id="phy11-newton3",
        topic="Newton's Third Law",
        script="...",
        rubric="1. pairs",
    )

    path = asyncio.run(dump_transcript(session, topic, "test-room-2", student_id="stu_42"))
    assert path.exists()
    data = json.loads(path.read_text())
    assert data["student_id"] == "stu_42"
    assert len(data["turns"]) == 2
    assert data["turns"][0]["role"] == "tutor"
    assert data["turns"][1]["role"] == "student"
