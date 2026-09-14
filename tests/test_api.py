import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages"))

from api.tokens import app
from fastapi.testclient import TestClient


def test_token_dev_stub():
    c = TestClient(app)
    r = c.get("/token", params={"student_id": "s1",
                                "topic_id": "phy11-newton3", "lang": "hi"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["room"].startswith("phy11-newton3-s1-")
    assert body["topic"]["topic_id"] == "phy11-newton3"
    assert body["topic"]["lang"] == "hi"


def test_token_unknown_topic():
    c = TestClient(app)
    r = c.get("/token", params={"student_id": "s1", "topic_id": "nope"})
    assert r.status_code == 404
