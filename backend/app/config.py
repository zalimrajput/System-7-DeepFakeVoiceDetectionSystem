"""Application settings and paths."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = BACKEND_DIR / "model"
CONFIG_PATH = MODEL_DIR / "model_config.json"
CHECKPOINT_PATH = MODEL_DIR / "final_aasist_weights.pth"


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str = "Veritape — Deepfake Voice Detection API"
    version: str = "1.0.0"

    # Model / audio contract (defaults come from model_config.json).
    sample_rate: int = 16000
    audio_length: int = 64600
    channels: int = 1

    checkpoint_path: Path = CHECKPOINT_PATH
    config_path: Path = CONFIG_PATH

    max_upload_bytes: int = int(os.getenv("MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))
    max_duration_seconds: float = float(os.getenv("MAX_DURATION_SECONDS", "600"))
    min_duration_seconds: float = float(os.getenv("MIN_DURATION_SECONDS", "0.25"))

    allowed_origins: list[str] = field(
        default_factory=lambda: _env_list(
            "ALLOWED_ORIGINS",
            ["http://localhost:3000", "http://127.0.0.1:3000"],
        )
    )

    allow_origin_regex: str | None = os.getenv(
        "ALLOW_ORIGIN_REGEX",
        r"https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$",
    )

    torch_threads: int = int(os.getenv("TORCH_THREADS", "0"))  # 0 => let torch decide
    debug: bool = os.getenv("DEBUG", "false").lower() in {"1", "true", "yes", "on"}

    def audio_config(self) -> dict[str, Any]:
        """Load audio section of the model config, falling back to defaults."""
        try:
            raw = json.loads(self.config_path.read_text(encoding="utf-8"))
            audio = raw.get("audio") or {}
        except (OSError, json.JSONDecodeError):
            audio = {}
        return {
            "sample_rate": int(audio.get("sample_rate", self.sample_rate)),
            "audio_length": int(audio.get("audio_length", self.audio_length)),
            "channels": int(audio.get("channels", self.channels)),
            "repeat_short_audio": bool(
                (audio.get("preprocessing") or {}).get("repeat_short_audio", True)
            ),
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
