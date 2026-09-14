import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUTPUTS_DIR = PROJECT_ROOT / "outputs"
AUDIO_DIR = OUTPUTS_DIR / "audio"

def tts_generate(script, video_id: str, scene_ids: list, language: str = "english"):
    try:
        import azure.cognitiveservices.speech as speechsdk
    except ImportError:
        raise RuntimeError("azure-cognitiveservices-speech is required for Azure TTS generation.")

    output_dir = AUDIO_DIR / video_id
    output_dir.mkdir(parents=True, exist_ok=True)

    speech_key = os.getenv("AZURE_SPEECH_KEY")
    region = os.getenv("AZURE_SPEECH_REGION")

    if not speech_key or not region:
        raise RuntimeError("Azure Speech key or region not set")

    speech_config = speechsdk.SpeechConfig(
        subscription=speech_key,
        region=region
    )


    # Map target language to Azure Neural voice names
    VOICE_MAP = {
        "english": "en-IN-NeerjaNeural",
        "en": "en-IN-NeerjaNeural",
        "hindi": "hi-IN-SwaraNeural",
        "hi": "hi-IN-SwaraNeural",
        "gujarati": "gu-IN-DhwaniNeural",
        "gu": "gu-IN-DhwaniNeural",
        "telugu": "te-IN-ShrutiNeural",
        "te": "te-IN-ShrutiNeural",
        "tamil": "ta-IN-PallaviNeural",
        "ta": "ta-IN-PallaviNeural",
        "marathi": "mr-IN-AarohiNeural",
        "mr": "mr-IN-AarohiNeural",
        "bengali": "bn-IN-TanishaNeural",
        "bn": "bn-IN-TanishaNeural",
        "kannada": "kn-IN-SapnaNeural",
        "kn": "kn-IN-SapnaNeural",
        "malayalam": "ml-IN-SobhanaNeural",
        "ml": "ml-IN-SobhanaNeural"
    }

    voice_name = VOICE_MAP.get(language.lower(), "en-IN-NeerjaNeural")
    speech_config.speech_synthesis_voice_name = voice_name
    print(f"[tts] Selected Azure voice: {voice_name} for language: {language}")

    # Build lookup: normalise scene_ids that may or may not have the "scene_" prefix
    script_map = {
        (f"scene_{s['scene_id']}" if not str(s["scene_id"]).startswith("scene_") else s["scene_id"]): s["script"]
        for s in script
    }

    for entry in scene_ids:
        # Support both plain strings (legacy) and (disk_index, scene_id) tuples
        if isinstance(entry, (list, tuple)):
            _, scene_id = entry
        else:
            scene_id = entry

        if scene_id not in script_map:
            print(f"[tts] No script found for {scene_id} — skipping audio generation.")
            # Generate a silent 6-second WAV so mux_audio doesn't fail
            audio_path = output_dir / f"{scene_id}.wav"
            _generate_silence(audio_path, duration=6)
            continue

        text = script_map[scene_id]

        try:
            from utils.cost_tracker import get_tracker
            tracker = get_tracker()
            if tracker:
                tracker.add_tts_chars(len(text))
        except Exception as e:
            print(f"[cost-tracker] Error recording TTS characters: {e}")

        audio_path = output_dir / f"{scene_id}.wav"

        audio_config = speechsdk.audio.AudioOutputConfig(
            filename=str(audio_path)
        )

        synthesizer = speechsdk.SpeechSynthesizer(
            speech_config=speech_config,
            audio_config=audio_config
        )

        try:
            result = synthesizer.speak_text_async(text).get()
            if result.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
                raise RuntimeError(f"Azure Speech Synthesis failed: {result.reason}")
            print(f"[✓] Generated audio for {scene_id}")
        except Exception as e:
            print(f"[tts] Azure TTS failed for {scene_id} ({e}) — falling back to silence.")
            _generate_silence(audio_path, duration=6)


def _generate_silence(path: Path, duration: int = 6):
    """Write a silent WAV file using ffmpeg as a fallback for skipped scenes."""
    import subprocess
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", f"anullsrc=r=16000:cl=mono:d={duration}",
            "-ar", "16000",
            "-ac", "1",
            str(path),
        ],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    print(f"[tts] Generated silent audio → {path}")
