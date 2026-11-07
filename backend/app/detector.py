"""AASIST model loading and inference."""

from __future__ import annotations

import json
import logging
import os
import sys
import threading
import time
from dataclasses import dataclass
from typing import Any

import numpy as np
import torch

from .config import BACKEND_DIR, Settings
from .schemas import ModelInfo

logger = logging.getLogger(__name__)


@dataclass
class Prediction:
    prediction: str
    confidence: float
    fake_probability: float
    real_probability: float
    logits: list[float]
    processing_ms: float
    device: str


class ModelUnavailableError(RuntimeError):
    """Raised when the checkpoint or the architecture cannot be loaded."""

    code = "model_unavailable"
    status_code = 503


class Detector:
    """Thread-safe singleton wrapper around the trained AASIST classifier."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._lock = threading.Lock()
        self._model: torch.nn.Module | None = None
        self._load_error: str | None = None
        self._raw_config: dict[str, Any] = {}

        # More threads than physical cores slows this small model down.
        threads = settings.torch_threads or min(2, os.cpu_count() or 1)
        torch.set_num_threads(max(1, threads))

    # ------------------------------------------------------------------ loading
    def load(self) -> None:
        try:
            self._raw_config = json.loads(
                self.settings.config_path.read_text(encoding="utf-8")
            )
        except (OSError, json.JSONDecodeError) as exc:
            self._raw_config = {}
            raise ModelUnavailableError(
                f"Model config could not be read from {self.settings.config_path}: {exc}"
            ) from exc

        if not self.settings.checkpoint_path.is_file():
            raise ModelUnavailableError(
                f"Checkpoint not found at {self.settings.checkpoint_path}. "
                "Place final_aasist_weights.pth inside backend/model/."
            )

        architecture = str(
            self._raw_config.get("architecture")
            or self._raw_config.get("model_config", {}).get("architecture")
            or "AASIST"
        )
        model_args = self._raw_config.get("model_config") or {}

        try:
            # Make `models/` importable no matter where uvicorn was launched from.
            if str(BACKEND_DIR) not in sys.path:
                sys.path.insert(0, str(BACKEND_DIR))

            from models.AASIST import Model as AASISTModel

            model = AASISTModel(model_args)
        except Exception as exc:  # noqa: BLE001
            raise ModelUnavailableError(
                f"Could not instantiate the {architecture} architecture: {exc}"
            ) from exc

        state_dict = self._read_checkpoint()
        try:
            model.load_state_dict(state_dict, strict=True)
        except RuntimeError as exc:
            raise ModelUnavailableError(
                "Checkpoint does not match the configured AASIST architecture: "
                f"{exc}"
            ) from exc

        model.eval()
        model.to(self.device)
        self._model = model
        self._load_error = None
        logger.info(
            "AASIST ready on %s (%s params)",
            self.device,
            f"{sum(p.numel() for p in model.parameters()):,}",
        )

    def _read_checkpoint(self) -> dict[str, torch.Tensor]:
        try:
            loaded = torch.load(
                self.settings.checkpoint_path, map_location="cpu", weights_only=True
            )
        except TypeError:  # older torch without weights_only
            loaded = torch.load(self.settings.checkpoint_path, map_location="cpu")
        except Exception as exc:  # noqa: BLE001
            raise ModelUnavailableError(f"Checkpoint could not be read: {exc}") from exc

        if isinstance(loaded, dict) and "model_state_dict" in loaded:
            loaded = loaded["model_state_dict"]
        elif isinstance(loaded, dict) and "state_dict" in loaded:
            loaded = loaded["state_dict"]
        elif isinstance(loaded, dict) and "model" in loaded and isinstance(
            loaded["model"], dict
        ):
            loaded = loaded["model"]

        if not isinstance(loaded, dict):
            raise ModelUnavailableError("Checkpoint does not contain a state dict.")

        return {
            (key[7:] if key.startswith("module.") else key): value
            for key, value in loaded.items()
        }

    def _ensure_loaded(self) -> torch.nn.Module:
        if self._model is not None:
            return self._model
        if self._load_error:
            raise ModelUnavailableError(self._load_error)
        with self._lock:
            if self._model is None:
                try:
                    self.load()
                except ModelUnavailableError as exc:
                    self._load_error = exc.args[0] if exc.args else str(exc)
                    raise
        assert self._model is not None
        return self._model

    def try_load(self) -> str | None:
        """Best-effort startup load + warm-up. Returns an error message if unavailable."""
        try:
            model = self._ensure_loaded()
            warmup = torch.zeros(1, self.settings.audio_length, device=self.device)
            with self._lock, torch.inference_mode():
                model(warmup)
            return None
        except ModelUnavailableError as exc:
            self._load_error = exc.args[0] if exc.args else str(exc)
            logger.warning("Model unavailable: %s", self._load_error)
            return self._load_error

    # ----------------------------------------------------------------- metadata
    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    @property
    def architecture(self) -> str:
        return str(
            self._raw_config.get("architecture")
            or self._raw_config.get("model_config", {}).get("architecture")
            or "AASIST"
        )

    @property
    def classes(self) -> dict[str, int]:
        classes = self._raw_config.get("classes") or {"FAKE": 0, "REAL": 1}
        return {str(k).upper(): int(v) for k, v in classes.items()}

    def model_info(self) -> ModelInfo:
        return ModelInfo(
            name="AASIST",
            architecture=self.architecture,
            device=str(self.device),
            checkpoint=self.settings.checkpoint_path.name,
            classes=self.classes,
            sample_rate=self.settings.sample_rate,
            audio_length=self.settings.audio_length,
        )

    # ---------------------------------------------------------------- inference
    def predict(self, waveform: np.ndarray) -> Prediction:
        """Run the classifier on a waveform of exactly `audio_length` samples."""
        model = self._ensure_loaded()
        expected = int(
            (self._raw_config.get("audio") or {}).get("audio_length")
            or self.settings.audio_length
        )
        if waveform.size != expected:
            raise ValueError(f"Expected {expected} samples, received {waveform.size}.")

        tensor = torch.from_numpy(waveform.astype(np.float32)).unsqueeze(0)
        started = time.perf_counter()
        with self._lock, torch.inference_mode():
            tensor = tensor.to(self.device)
            _embedding, logits = model(tensor)
            probabilities = torch.softmax(logits, dim=1)[0].float().cpu()
            logits = logits[0].float().cpu()
        elapsed_ms = (time.perf_counter() - started) * 1000.0

        classes = self.classes
        fake_index = classes.get("FAKE", 0)
        real_index = classes.get("REAL", 1)
        fake_probability = float(probabilities[fake_index])
        real_probability = float(probabilities[real_index])

        # Guard against softmax floating point drift.
        total = fake_probability + real_probability
        if total > 0:
            fake_probability /= total
            real_probability /= total

        return Prediction(
            prediction="REAL" if real_probability >= fake_probability else "FAKE",
            confidence=max(fake_probability, real_probability),
            fake_probability=fake_probability,
            real_probability=real_probability,
            logits=[float(value) for value in logits.tolist()],
            processing_ms=elapsed_ms,
            device=str(self.device),
        )
