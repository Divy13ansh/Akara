import subprocess
from pathlib import Path

import requests

# ============================================================
# PATHS (MUST MATCH STAGE 2)
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

MEDIA_DIR = PROJECT_ROOT / "media"
OUTPUTS_DIR = PROJECT_ROOT / "outputs"

SCENES_DIR = OUTPUTS_DIR / "scenes"
AUDIO_DIR = OUTPUTS_DIR / "audio"
VIDEOS_DIR = OUTPUTS_DIR / "videos"

# ============================================================
# UTILS
# ============================================================

def get_duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        stdout=subprocess.PIPE,
        text=True,
        check=True,
    )
    return float(result.stdout.strip())

# ============================================================
# MUX AUDIO (AUTHORITATIVE: scene_ids)
# ============================================================

def mux_audio(video_id: str, scene_ids: list):
    """
    Combine audio + video ONLY for scenes that survived Manim rendering.
    scene_ids must come from generate_manim() — a list of (disk_index, scene_id) tuples.
    Plain string entries are also accepted for backward compatibility.
    """

    base_audio = AUDIO_DIR / video_id
    base_out = VIDEOS_DIR / video_id / "scenes_with_audio"
    base_out.mkdir(parents=True, exist_ok=True)

    for mux_idx, entry in enumerate(scene_ids, start=1):
        # Support both (disk_index, scene_id) tuples and plain strings (legacy)
        if isinstance(entry, (list, tuple)):
            disk_index, scene_id = entry
        else:
            disk_index, scene_id = mux_idx, entry

        video = SCENES_DIR / f"{disk_index:02d}_{scene_id}.mp4"
        audio = base_audio / f"{scene_id}.wav"
        out = base_out / f"{mux_idx:02d}_{scene_id}.mp4"

        if not video.exists():
            raise RuntimeError(
                f"Missing video for {scene_id} "
                f"(expected file: {video.name}). "
                f"Check stage2 rendering logs."
            )

        if not audio.exists():
            raise RuntimeError(
                f"Missing audio for {scene_id} "
                f"(expected file: {audio.name}). "
                f"Check stage4 TTS logs."
            )

        V = get_duration(video)
        A = get_duration(audio)

        if A > V:
            vf = f"tpad=stop_mode=clone:stop_duration={A - V}"
            af = "anull"
        elif V > A:
            vf = "null"
            af = f"apad=pad_dur={V - A}"
        else:
            vf = "null"
            af = "anull"

        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(video),
                "-i", str(audio),
                "-filter_complex", f"[0:v]{vf}[v];[1:a]{af}[a]",
                "-map", "[v]",
                "-map", "[a]",
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-ar", "44100",
                "-ac", "2",
                str(out),
            ],
            check=True,
        )

        print(f"🔊 Muxed {scene_id}")

    print(f"✅ Audio muxed for {len(scene_ids)} scenes")

# ============================================================
# STITCH FINAL VIDEO
# ============================================================

def stitch(video_id: str):
    base = VIDEOS_DIR / video_id
    scenes_dir = base / "scenes_with_audio"
    final_out = base / "final.mp4"

    video_files = sorted(scenes_dir.glob("*.mp4"))

    if not video_files:
        raise RuntimeError("No scene videos found to stitch")

    list_file = base / "concat_list.txt"

    with open(list_file, "w") as f:
        f.writelines(f"file '{v.resolve()}'\n" for v in video_files)

    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(list_file),
            "-c", "copy",
            str(final_out),
        ],
        check=True,
    )

    list_file.unlink()

    print(f"🎞 Final video → {final_out}")
    return final_out

# ============================================================
# EXTRACT AUDIO FROM FINAL VIDEO
# ============================================================

def extract_audio_from_final(video_id: str):
    input_video = VIDEOS_DIR / video_id / "final.mp4"
    output_audio = AUDIO_DIR / video_id / "final_audio.wav"

    if not input_video.exists():
        raise FileNotFoundError("final.mp4 not found")

    output_audio.parent.mkdir(parents=True, exist_ok=True)

    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", str(input_video),
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            str(output_audio),
        ],
        check=True,
    )

    print(f"🔊 Extracted audio → {output_audio}")
    return output_audio

# ============================================================
# SADTALKER
# ============================================================

def send_to_sadtalker(
    audio_path: Path,
    image_path: Path | None = None,
):
    if image_path is None or not Path(image_path).exists():
        print(f"[sadtalker] Image path {image_path} not found — skipping SadTalker generation.")
        return None

    url = "http://127.0.0.1:8000/video/generate"

    with open(audio_path, "rb") as a, open(image_path, "rb") as i:
        files = {
            "audio": ("audio.wav", a, "audio/wav"),
            "image": ("avatar.jpg", i, "image/jpeg"),
        }
        response = requests.post(url, files=files)

    response.raise_for_status()
    data = response.json()
    print("🧠 SadTalker job started:", data)
    return data.get("job_id")

