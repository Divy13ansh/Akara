import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

from akara_common.schemas import Transcript, TranscriptTurn
from akara_rag.retrieve import fetch_topic
from voice.scorer import score_transcript


def test_scorer_covered_and_missed():
    topic = fetch_topic("phy11-newton3")
    assert topic is not None
    tr = Transcript(room_name="r1", topic_id=topic.topic_id,
                    student_id="s1", lang="en", turns=[
        TranscriptTurn(role="student",
                       text="Forces come in pairs, equal magnitude opposite direction on different objects like rocket propulsion"),
    ])
    res = score_transcript(tr, topic, "s1")
    assert res.mastery > 0
    assert any(p.status == "covered" for p in res.points)


def test_scorer_misconception_cancel():
    topic = fetch_topic("phy11-newton3")
    assert topic is not None
    tr = Transcript(room_name="r2", topic_id=topic.topic_id,
                    student_id="s1", lang="en", turns=[
        TranscriptTurn(role="student",
                       text="They are equal and opposite so they cancel each other out"),
    ])
    res = score_transcript(tr, topic, "s1")
    statuses = {p.id: p.status for p in res.points}
    assert statuses.get(3) in ("misconceived", "missed")
