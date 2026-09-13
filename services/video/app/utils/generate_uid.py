import uuid

def generate_video_id() -> str:
    return uuid.uuid4().hex  # e.g. "c9a6e5b6c8c64f0c8b6c9d..."
