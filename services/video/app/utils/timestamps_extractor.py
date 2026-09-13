import re
import json
from pathlib import Path

PLAY_REGEX = re.compile(r"self\.play\(.*?run_time\s*=\s*([0-9.]+)\)", re.DOTALL)
WAIT_REGEX = re.compile(r"self\.wait\(\s*([0-9.]+)\s*\)")

def extract_timestamps(manim_code: str):
    current_time = 0.0
    scene_index = 1
    timestamps = []

    lines = manim_code.splitlines()

    for line in lines:
        play_match = PLAY_REGEX.search(line)
        wait_match = WAIT_REGEX.search(line)

        duration = None

        if play_match:
            duration = float(play_match.group(1))
        elif wait_match:
            duration = float(wait_match.group(1))

        if duration is not None:
            start = round(current_time, 2)
            end = round(current_time + duration, 2)

            timestamps.append({
                "scene": scene_index,
                "start": start,
                "end": end,
                "duration": duration
            })

            current_time += duration
            scene_index += 1

    return timestamps
