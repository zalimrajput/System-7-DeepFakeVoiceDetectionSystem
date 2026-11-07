"""API request/response models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class AudioInfo(BaseModel):
    filename: str
    content_type: str | None = None
    size_bytes: int
    format: str | None = Field(default=None, description="Detected container/codec")
    original_sample_rate: int
    original_channels: int
    sample_rate: int = Field(description="Sample rate fed to the model (16 kHz)")
    channels: int = Field(description="Channels fed to the model (mono)")
    duration_seconds: float
    samples: int
    padded_or_cropped: bool
    processing_ms: float


class ModelInfo(BaseModel):
    name: str = "AASIST"
    architecture: str = "AASIST"
    device: str
    checkpoint: str
    classes: dict[str, int]
    sample_rate: int
    audio_length: int


class Probabilities(BaseModel):
    fake: float = Field(ge=0.0, le=1.0)
    real: float = Field(ge=0.0, le=1.0)


class AnalysisResponse(BaseModel):
    prediction: Literal["FAKE", "REAL"]
    verified: bool = Field(
        description="True when the model considers the audio real (labelled voice)"
    )
    confidence: float = Field(ge=0.0, le=1.0)
    probabilities: Probabilities
    logits: list[float]
    audio: AudioInfo
    model: ModelInfo
    analyzed_at: str


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    model_loaded: bool
    detail: str | None = None
    device: str | None = None
    version: str
    uptime_seconds: float


class ModelInfoResponse(BaseModel):
    model: ModelInfo
    model_loaded: bool
    detail: str | None = None
    limits: dict[str, float | int | list[str]]


class ErrorResponse(BaseModel):
    code: str
    message: str
    detail: str | None = None
