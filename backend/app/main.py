"""FastAPI application for deepfake voice detection."""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from . import __version__
from .audio import (
    ALLOWED_CONTENT_TYPES,
    SUPPORTED_EXTENSIONS,
    AudioError,
    AudioTooLongError,
    UnsupportedFormatError,
    prepare_audio,
)
from .config import get_settings
from .detector import Detector, ModelUnavailableError
from .schemas import (
    AnalysisResponse,
    AudioInfo,
    ErrorResponse,
    HealthResponse,
    ModelInfoResponse,
    Probabilities,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger("veritape")

settings = get_settings()
detector = Detector(settings)
STARTED_AT = time.time()


@asynccontextmanager
async def lifespan(_: FastAPI):
    audio_cfg = settings.audio_config()
    logger.info(
        "Starting %s v%s | sr=%d samples=%d device=%s",
        settings.app_name,
        __version__,
        audio_cfg["sample_rate"],
        audio_cfg["audio_length"],
        detector.device,
    )
    error = await run_in_threadpool(detector.try_load)
    if error:
        logger.warning("API starting without a model: %s", error)
    else:
        logger.info("Model warm-up complete.")
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title="Veritape — Deepfake Voice Detection API",
    description=(
        "Upload a WAV, MP3, OGG or AAC file and the AASIST model returns "
        "REAL / FAKE probabilities for the voice."
    ),
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=settings.allow_origin_regex,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time-Ms"],
)


@app.middleware("http")
async def add_process_time(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Process-Time-Ms"] = f"{elapsed_ms:.1f}"
    return response


@app.exception_handler(AudioError)
async def audio_error_handler(_: Request, exc: AudioError) -> JSONResponse:
    logger.info("Audio rejected (%s): %s", exc.code, exc.message)
    if exc.internal:
        logger.debug("Decoder details for %s: %s", exc.code, exc.internal)
    detail = exc.detail
    if settings.debug and exc.internal:
        detail = f"{detail} [{exc.internal}]" if detail else exc.internal
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            code=exc.code, message=exc.message, detail=detail
        ).model_dump(),
    )


@app.exception_handler(ModelUnavailableError)
async def model_error_handler(_: Request, exc: ModelUnavailableError) -> JSONResponse:
    logger.error("Model unavailable: %s", exc)
    return JSONResponse(
        status_code=503,
        content=ErrorResponse(
            code="model_unavailable",
            message="The detection model is not available right now.",
            detail=str(exc),
        ).model_dump(),
    )


# --------------------------------------------------------------------- helpers
async def read_upload_limited(upload: UploadFile) -> bytes:
    """Read an upload while enforcing the configured size limit."""
    limit = settings.max_upload_bytes
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(1024 * 256)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise AudioTooLongError(
                f"File is larger than the {limit / (1024 * 1024):.0f} MB limit.",
                "Please trim the audio or upload a compressed version.",
            )
        chunks.append(chunk)
    return b"".join(chunks)


def validate_upload(upload: UploadFile) -> None:
    suffix = Path(upload.filename or "").suffix.lower()
    content_type = (upload.content_type or "").lower().split(";")[0].strip()
    if suffix and suffix not in SUPPORTED_EXTENSIONS:
        raise UnsupportedFormatError(
            f"Unsupported file type '{suffix}'.",
            "Allowed formats: WAV, MP3, OGG/OPUS, FLAC, M4A and AAC.",
        )
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise UnsupportedFormatError(
            f"Unsupported content type '{content_type}'.",
            "Upload an audio file such as WAV, MP3, OGG or AAC.",
        )


# ---------------------------------------------------------------------- routes
@app.get("/", tags=["meta"])
async def root() -> dict:
    return {
        "service": settings.app_name,
        "version": __version__,
        "docs": "/docs",
        "health": "/api/health",
        "analyze": "POST /api/analyze",
    }


@app.get("/api/health", response_model=HealthResponse, tags=["meta"])
async def health() -> HealthResponse:
    loaded = detector.is_loaded
    detail = detector.load_error if not loaded else None
    return HealthResponse(
        status="ok" if loaded else "degraded",
        model_loaded=loaded,
        detail=detail,
        device=str(detector.device),
        version=__version__,
        uptime_seconds=round(time.time() - STARTED_AT, 2),
    )


@app.get("/api/model", response_model=ModelInfoResponse, tags=["model"])
async def model_info() -> ModelInfoResponse:
    audio_cfg = settings.audio_config()
    return ModelInfoResponse(
        model=detector.model_info(),
        model_loaded=detector.is_loaded,
        detail=detector.load_error,
        limits={
            "max_upload_mb": round(settings.max_upload_bytes / (1024 * 1024), 1),
            "max_duration_seconds": settings.max_duration_seconds,
            "min_duration_seconds": settings.min_duration_seconds,
            "sample_rate": audio_cfg["sample_rate"],
            "audio_length": audio_cfg["audio_length"],
            "formats": sorted(ext.lstrip(".").upper() for ext in SUPPORTED_EXTENSIONS),
        },
    )


@app.post(
    "/api/analyze",
    response_model=AnalysisResponse,
    tags=["analysis"],
    responses={
        415: {"model": ErrorResponse, "description": "Unsupported file format"},
        422: {"model": ErrorResponse, "description": "Invalid or unusable audio"},
        413: {"model": ErrorResponse, "description": "File too large"},
        503: {"model": ErrorResponse, "description": "Model unavailable"},
    },
)
async def analyze(
    file: UploadFile = File(..., description="Audio file to analyze"),
) -> AnalysisResponse:
    requested_at = datetime.now(timezone.utc)
    validate_upload(file)
    data = await read_upload_limited(file)

    audio_cfg = settings.audio_config()
    filename = Path(file.filename or "audio").name

    decoded, waveform, modified = await run_in_threadpool(
        prepare_audio,
        data,
        filename,
        sample_rate=audio_cfg["sample_rate"],
        length=audio_cfg["audio_length"],
        repeat_short=audio_cfg["repeat_short_audio"],
        min_duration=settings.min_duration_seconds,
        max_duration=settings.max_duration_seconds,
    )

    prediction = await run_in_threadpool(detector.predict, waveform)

    logger.info(
        "Analyzed %s (%.2fs, %s) -> %s %.1f%% in %.0f ms",
        filename,
        decoded.duration_seconds,
        decoded.format,
        prediction.prediction,
        prediction.confidence * 100,
        prediction.processing_ms,
    )

    return AnalysisResponse(
        prediction=prediction.prediction,  # type: ignore[arg-type]
        verified=prediction.prediction == "REAL",
        confidence=round(prediction.confidence, 6),
        probabilities=Probabilities(
            fake=round(prediction.fake_probability, 6),
            real=round(prediction.real_probability, 6),
        ),
        logits=[round(value, 6) for value in prediction.logits],
        audio=AudioInfo(
            filename=filename,
            content_type=file.content_type,
            size_bytes=len(data),
            format=decoded.format,
            original_sample_rate=decoded.sample_rate,
            original_channels=decoded.original_channels,
            sample_rate=audio_cfg["sample_rate"],
            channels=1,
            duration_seconds=round(decoded.duration_seconds, 3),
            samples=len(waveform),
            padded_or_cropped=modified,
            processing_ms=round(prediction.processing_ms, 2),
        ),
        model=detector.model_info(),
        analyzed_at=requested_at.isoformat(timespec="seconds"),
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            code="internal_error",
            message="Something went wrong while analyzing the audio.",
            detail=str(exc) if settings.debug else None,
        ).model_dump(),
    )
