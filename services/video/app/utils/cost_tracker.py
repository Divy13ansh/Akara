import os
import time
import json
import contextvars
from pathlib import Path
from datetime import datetime

# Context variable to hold cost tracking details for the current request
_current_cost_tracker = contextvars.ContextVar("current_cost_tracker", default=None)

# Standard pricing details
# Azure OpenAI: input & output pricing per 1M tokens
LLM_PRICING = {
    "mini": {
        "input_per_million": 0.15,
        "output_per_million": 0.60,
    },
    "standard": {
        "input_per_million": 2.50,
        "output_per_million": 10.00,
    }
}

# Azure Speech Neural TTS pricing: $16.00 per 1M characters
TTS_PRICING_PER_MILLION_CHARS = 16.00

# Estimated compute rate per second (default: $0.50 per hour / 3600 seconds)
DEFAULT_COMPUTE_COST_PER_SECOND = 0.000138

class CostTracker:
    def __init__(self, topic: str = "", video_id: str = ""):
        self.topic = topic
        self.video_id = video_id
        self.start_time = time.time()
        self.end_time = None
        self.llm_calls = []
        self.tts_characters = 0
        self.tts_calls = 0
        self.stages = {}

    def start_stage(self, stage_name: str):
        self.stages[stage_name] = {
            "start_time": time.time(),
            "duration": 0.0
        }

    def end_stage(self, stage_name: str):
        if stage_name in self.stages and self.stages[stage_name]["start_time"] is not None:
            self.stages[stage_name]["duration"] = time.time() - self.stages[stage_name]["start_time"]

    def add_llm_call(self, prompt_tokens: int, completion_tokens: int, model_name: str):
        self.llm_calls.append({
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "model_name": model_name,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        })

    def add_tts_chars(self, char_count: int):
        self.tts_characters += char_count
        self.tts_calls += 1

    def get_summary(self) -> dict:
        total_prompt_tokens = sum(call["prompt_tokens"] for call in self.llm_calls)
        total_completion_tokens = sum(call["completion_tokens"] for call in self.llm_calls)

        # 1. LLM Cost estimation
        llm_cost = 0.0
        for call in self.llm_calls:
            model = call["model_name"].lower()
            if "claude" in model:
                if "haiku" in model:
                    rates = {"input_per_million": 0.80, "output_per_million": 4.00}
                else:  # Default to Claude 3.5 Sonnet pricing
                    rates = {"input_per_million": 3.00, "output_per_million": 15.00}
            elif "mini" in model:
                rates = LLM_PRICING["mini"]
            else:
                rates = LLM_PRICING["standard"]
            
            in_cost = (call["prompt_tokens"] / 1_000_000.0) * rates["input_per_million"]
            out_cost = (call["completion_tokens"] / 1_000_000.0) * rates["output_per_million"]
            llm_cost += in_cost + out_cost

        # 2. TTS Cost estimation
        tts_cost = (self.tts_characters / 1_000_000.0) * TTS_PRICING_PER_MILLION_CHARS

        # 3. Compute Cost estimation
        total_duration = (self.end_time or time.time()) - self.start_time
        compute_cost_rate = float(os.getenv("COMPUTE_COST_PER_SECOND", str(DEFAULT_COMPUTE_COST_PER_SECOND)))
        compute_cost = total_duration * compute_cost_rate

        total_cost = llm_cost + tts_cost + compute_cost

        stages_formatted = {name: info["duration"] for name, info in self.stages.items()}

        return {
            "video_id": self.video_id,
            "topic": self.topic,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "total_duration_seconds": total_duration,
            "llm_summary": {
                "calls_count": len(self.llm_calls),
                "prompt_tokens": total_prompt_tokens,
                "completion_tokens": total_completion_tokens,
                "estimated_cost_usd": round(llm_cost, 6),
                "calls": self.llm_calls
            },
            "tts_summary": {
                "calls_count": self.tts_calls,
                "characters_count": self.tts_characters,
                "estimated_cost_usd": round(tts_cost, 6)
            },
            "compute_summary": {
                "total_duration_seconds": round(total_duration, 2),
                "estimated_cost_usd": round(compute_cost, 6),
                "cost_rate_per_second": compute_cost_rate
            },
            "total_estimated_cost_usd": round(total_cost, 6),
            "stages_duration_seconds": stages_formatted
        }

def init_tracker(topic: str = "", video_id: str = "") -> CostTracker:
    tracker = CostTracker(topic=topic, video_id=video_id)
    _current_cost_tracker.set(tracker)
    return tracker

def get_tracker() -> CostTracker:
    return _current_cost_tracker.get()

def finalize_and_log() -> dict:
    tracker = get_tracker()
    if not tracker:
        return {}
    
    tracker.end_time = time.time()
    summary = tracker.get_summary()

    # Define paths
    project_root = Path(__file__).resolve().parents[2]
    outputs_dir = project_root / "outputs"
    outputs_dir.mkdir(parents=True, exist_ok=True)
    
    jsonl_file = outputs_dir / "costs.jsonl"
    text_log_file = outputs_dir / "costs.log"

    # 1. Write structured JSON line
    try:
        with open(jsonl_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(summary) + "\n")
    except Exception as e:
        print(f"[cost-tracker] Failed to write JSON log: {e}")

    # 2. Write human-readable log block
    timestamp = summary.get("timestamp", datetime.utcnow().isoformat() + "Z")
    duration = summary.get("total_duration_seconds", 0.0)
    llm = summary.get("llm_summary", {})
    tts = summary.get("tts_summary", {})
    compute = summary.get("compute_summary", {})
    stages = summary.get("stages_duration_seconds", {})

    log_entry = (
        f"======================================================================\n"
        f"TIMESTAMP: {timestamp}\n"
        f"VIDEO ID:  {tracker.video_id}\n"
        f"TOPIC:     {tracker.topic}\n"
        f"----------------------------------------------------------------------\n"
        f"TOTAL ESTIMATED COST: ${summary['total_estimated_cost_usd']:.6f}\n"
        f"  - LLM Cost:     ${llm.get('estimated_cost_usd', 0.0):.6f} "
        f"({llm.get('prompt_tokens', 0):,} prompt, {llm.get('completion_tokens', 0):,} completion tokens across {llm.get('calls_count', 0)} calls)\n"
        f"  - TTS Cost:     ${tts.get('estimated_cost_usd', 0.0):.6f} "
        f"({tts.get('characters_count', 0):,} characters across {tts.get('calls_count', 0)} voice clips)\n"
        f"  - Compute Cost: ${compute.get('estimated_cost_usd', 0.0):.6f} "
        f"({duration:.2f} seconds total generation time)\n"
        f"----------------------------------------------------------------------\n"
        f"STAGE RUNTIMES:\n"
    )
    for stage_name, stage_dur in stages.items():
        log_entry += f"  - {stage_name:<20}: {stage_dur:.2f}s\n"
    log_entry += "======================================================================\n\n"

    try:
        with open(text_log_file, "a", encoding="utf-8") as f:
            f.write(log_entry)
    except Exception as e:
        print(f"[cost-tracker] Failed to write text log: {e}")

    print(f"💰 [cost-tracker] Total cost for video {tracker.video_id}: ${summary['total_estimated_cost_usd']:.6f} "
          f"(LLM: ${summary['llm_summary']['estimated_cost_usd']:.6f}, "
          f"TTS: ${summary['tts_summary']['estimated_cost_usd']:.6f}, "
          f"Compute: ${summary['compute_summary']['estimated_cost_usd']:.6f})")

    # Clear context variable
    _current_cost_tracker.set(None)
    return summary
