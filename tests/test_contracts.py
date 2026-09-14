import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages"))

from akara_common.schemas import TopicData
from akara_rag.retrieve import fetch_topic, list_topics


def test_metadata_roundtrip():
    t = fetch_topic("phy11-newton3", lang="hi")
    assert t is not None
    raw = t.to_metadata_json()
    back = TopicData.from_metadata_json(raw)
    assert back is not None and back.topic_id == "phy11-newton3" and back.lang == "hi"


def test_legacy_metadata_shape():
    import json
    raw = json.dumps({"topic": "T", "script": "S", "rubric": "R"})
    back = TopicData.from_metadata_json(raw)
    assert back is not None and back.topic == "T"


def test_seed_list():
    assert len(list_topics()) >= 3
