import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "video" / "app"))
sys.path.insert(0, str(ROOT / "packages"))

from fastapi.testclient import TestClient
from main import app


def test_video_health():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "akara-video"
    # Manim Tex/MathTex needs system latex — surfaced for diagnosability.
    assert isinstance(body["latex"], bool)
    assert isinstance(body["dvisvgm"], bool)


def test_video_render_async_enqueue(monkeypatch):
    # Mock background pipeline run to test endpoint response and status tracking
    monkeypatch.setattr("main.run_pipeline", lambda video_id, req: None)

    client = TestClient(app)
    payload = {
        "topic_id": "phy11-newton3",
        "language": "hi",
        "sync": False,
    }
    response = client.post("/explain", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "processing"
    assert "video_id" in body
    assert body["status_url"].startswith("/video/")

    # Poll status endpoint
    video_id = body["video_id"]
    status_resp = client.get(f"/video/{video_id}/status")
    assert status_resp.status_code == 200
    status_body = status_resp.json()
    assert status_body["video_id"] == video_id
    assert status_body["status"] in ("pending", "processing", "complete", "failed")




def test_video_not_found():
    client = TestClient(app)
    response = client.get("/video/nonexistent_video_12345")
    assert response.status_code == 404
