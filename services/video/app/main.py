import json
import os
import sys
from datetime import datetime
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from stages.stage1_scenes import generate_scenes
from stages.stage2_manim import generate_manim
from stages.stage3_script import generate_script
from stages.stage4_tts import tts_generate
from stages.stage5_stitch import (
    extract_audio_from_final,
    mux_audio,
    send_to_sadtalker,
    stitch,
)
from utils.cost_tracker import finalize_and_log, init_tracker
from utils.generate_uid import generate_video_id

app = FastAPI(title="Akara Video Service", version="0.1.0")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
VIDEOS_DIR = PROJECT_ROOT / "outputs" / "videos"
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ExplainRequest(BaseModel):
    topic_id: str | None = None
    topic: str | None = None
    level: str = "school"
    persona: str = "teacher"
    face_enabled: bool = False
    rag_context: str | None = None
    language: str = "english"
    sync: bool = False
    video_id: str | None = None  # caller-supplied job id (akara-api render job); generated when absent


def update_job_status(video_id: str, status: str, stage: str, detail: dict | None = None):
    job_dir = VIDEOS_DIR / video_id
    job_dir.mkdir(parents=True, exist_ok=True)
    status_file = job_dir / "status.json"

    data = {
        "video_id": video_id,
        "status": status,
        "current_stage": stage,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
    if detail:
        data.update(detail)

    status_file.write_text(json.dumps(data, indent=2), encoding="utf-8")


def run_pipeline(video_id: str, req: ExplainRequest):
    topic = req.topic
    if req.topic_id and not topic:
        try:
            from packages.akara_rag.retrieve import fetch_topic

            tdata = fetch_topic(req.topic_id, lang=req.language)
            if tdata:
                topic = tdata.topic
        except ImportError:
            pass

    if not topic:
        topic = req.topic_id or "General Concept"

    tracker = init_tracker(topic=topic, video_id=video_id)
    update_job_status(video_id, "processing", "scene_planning")

    try:
        # -------- Stage 1: Scene planning --------
        tracker.start_stage("scene_planning")
        scenes = generate_scenes(
            topic=topic,
            level=req.level,
            rag_context=req.rag_context,
            language=req.language,
            topic_id=req.topic_id,
        )
        tracker.end_stage("scene_planning")

        # -------- Stage 2: Manim rendering --------
        update_job_status(video_id, "processing", "manim_rendering")
        tracker.start_stage("manim_rendering")
        manim_data = generate_manim(scenes, req.rag_context, req.language)
        scene_ids = manim_data["scene_ids"]
        tracker.end_stage("manim_rendering")

        # -------- Stage 3: Script generation --------
        update_job_status(video_id, "processing", "script_generation")
        tracker.start_stage("script_generation")
        script = generate_script(
            scenes=scenes,
            timestamps=manim_data["timestamps"],
            persona=req.persona,
            level=req.level,
            rag_context=req.rag_context,
            language=req.language,
            topic_id=req.topic_id,
        )
        tracker.end_stage("script_generation")

        # -------- Stage 4: TTS --------
        update_job_status(video_id, "processing", "tts_generation")
        tracker.start_stage("tts_generation")
        tts_generate(
            script=script,
            video_id=video_id,
            scene_ids=scene_ids,
            language=req.language,
        )
        tracker.end_stage("tts_generation")

        # -------- Stage 5: Audio + Video Mux & Stitch --------
        update_job_status(video_id, "processing", "stitch_and_mux")
        tracker.start_stage("stitch_and_mux")
        mux_audio(video_id, scene_ids)
        final_video_path = stitch(video_id)
        tracker.end_stage("stitch_and_mux")

        sadtalker_job_id = None
        if req.face_enabled:
            update_job_status(video_id, "processing", "sadtalker")
            tracker.start_stage("sadtalker")
            final_audio_path = extract_audio_from_final(video_id)
            sadtalker_job_id = send_to_sadtalker(final_audio_path)
            tracker.end_stage("sadtalker")

        cost_summary = finalize_and_log()
        result = {
            "video_path": str(final_video_path),
            "face_enabled": req.face_enabled,
            "estimated_cost": cost_summary,
        }
        if sadtalker_job_id:
            result["sadtalker_job_id"] = sadtalker_job_id

        # R2 publish + API callback (plan Phase 5): only when the render came
        # from the concept pipeline (has a topic_id + ISO lang code).
        if req.topic_id and len(req.language) == 2:
            try:
                from utils.r2_upload import publish_render_result

                stage_timings = {
                    name: round(info.get("duration", 0.0), 2)
                    for name, info in getattr(tracker, "stages", {}).items()
                }
                publish_render_result(
                    video_id=video_id,
                    concept_id=req.topic_id,
                    lang=req.language,
                    final_video_path=final_video_path,
                    outputs_dir=PROJECT_ROOT / "outputs",
                    stage_timings=stage_timings or None,
                )
            except Exception as publish_err:
                print(f"⚠ R2 publish failed for {video_id}: {publish_err}")

        update_job_status(video_id, "complete", "done", detail=result)
        return result

    except Exception as e:
        import traceback

        err_msg = str(e)
        trace = traceback.format_exc()
        print(f"❌ Video job {video_id} failed: {err_msg}\n{trace}")
        # Best-effort failure notification to the API (genstatus flips to failed).
        if req.topic_id and len(req.language) == 2:
            try:
                from utils.r2_upload import notify_render_failed

                notify_render_failed(video_id, req.topic_id, req.language, err_msg)
            except Exception:
                pass
        update_job_status(
            video_id, "failed", "error", detail={"error": err_msg, "traceback": trace}
        )
        raise


@app.get("/health")
def health():
    return {"status": "ok", "service": "akara-video"}


@app.post("/explain")
@app.post("/render")
def explain(req: ExplainRequest, background_tasks: BackgroundTasks):
    # Honor a caller-supplied job id (the API registers video_render_jobs with
    # this id BEFORE calling us, so /internal/render-callback can find it).
    video_id = req.video_id or generate_video_id()
    update_job_status(video_id, "pending", "queued")

    if req.sync:
        result = run_pipeline(video_id, req)
        return {
            "status": "complete",
            "video_id": video_id,
            **result,
        }

    background_tasks.add_task(run_pipeline, video_id, req)
    return {
        "status": "processing",
        "video_id": video_id,
        "status_url": f"/video/{video_id}/status",
    }


@app.get("/video/{video_id}/status")
def get_status(video_id: str):
    status_file = VIDEOS_DIR / video_id / "status.json"
    if not status_file.exists():
        raise HTTPException(status_code=404, detail="Job not found")

    return json.loads(status_file.read_text(encoding="utf-8"))


@app.get("/video/{video_id}")
def get_video(video_id: str):
    path = VIDEOS_DIR / video_id / "final.mp4"

    if not path.exists():
        raise HTTPException(status_code=404, detail="Video not found")

    return FileResponse(path, media_type="video/mp4")
