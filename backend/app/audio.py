"""Audio decoding and preprocessing utilities.

Turns any supported upload (WAV / MP3 / OGG / FLAC / M4A / AAC / OPUS) into the
exact tensor contract the AASIST model expects: mono, 16 kHz, 64,600 samples.
"""

from __future__ import annotations

import io
import logging
import tempfile
import wave
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path

import numpy as np

SUPPORTED_EXTENSIONS = {
    ".wav",
    ".mp3",
    ".ogg",
    ".oga",
    ".opus",
    ".flac",
    ".m4a",
    ".aac",
    ".mp4",
}

# Browsers/OSes are inconsistent about audio MIME types, so we accept the
# generic and unknown ones and rely on decoding to reject real garbage.
ALLOWED_CONTENT_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/vnd.wave",
    "audio/mpeg",
    "audio/mp3",
    "audio/mpeg3",
    "audio/x-mpeg-3",
    "audio/ogg",
    "audio/opus",
    "audio/flac",
    "audio/x-flac",
    "audio/mp4",
    "audio/x-m4a",
    "audio/aac",
    "audio/aacp",
    "audio/x-aac",
    "video/mp4",
    "application/octet-stream",
    "binary/octet-stream",
    "",
}


logger = logging.getLogger(__name__)


class AudioError(Exception):
    """Base class for user-facing audio problems."""

    code = "audio_error"
    status_code = 422

    def __init__(
        self,
        message: str,
        detail: str | None = None,
        internal: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail
        self.internal = internal


class UnsupportedFormatError(AudioError):
    code = "unsupported_format"
    status_code = 415


class InvalidAudioError(AudioError):
    code = "invalid_audio"
    status_code = 422


class AudioTooShortError(AudioError):
    code = "audio_too_short"
    status_code = 422


class AudioTooLongError(AudioError):
    code = "audio_too_long"
    status_code = 413


class SilentAudioError(AudioError):
    code = "silent_audio"
    status_code = 422


@dataclass
class DecodedAudio:
    samples: np.ndarray  # float32 mono, native sample rate
    sample_rate: int
    format: str
    original_channels: int

    @property
    def duration_seconds(self) -> float:
        return float(len(self.samples) / self.sample_rate) if self.sample_rate else 0.0


def _clean(samples: np.ndarray) -> np.ndarray:
    samples = np.asarray(samples, dtype=np.float32)
    samples = np.nan_to_num(samples, nan=0.0, posinf=0.0, neginf=0.0)
    return np.ascontiguousarray(samples, dtype=np.float32)


def _to_mono(data: np.ndarray) -> np.ndarray:
    if data.ndim == 1:
        return data
    # soundfile returns (frames, channels); librosa may return (channels, frames)
    if data.shape[0] <= 8 and data.shape[0] < data.shape[1]:
        return data.mean(axis=0)
    return data.mean(axis=1)


def _read_with_soundfile(data: bytes) -> tuple[np.ndarray, int, int, str]:
    import soundfile as sf

    with sf.SoundFile(io.BytesIO(data)) as handle:
        sample_rate = int(handle.samplerate)
        channels = int(handle.channels)
        frames = handle.read(dtype="float32", always_2d=True)
        fmt = (handle.format or "").upper()
    mono = frames.mean(axis=1) if channels > 1 else frames[:, 0]
    return _clean(mono), sample_rate, channels, fmt


def _read_with_librosa(data: bytes, suffix: str) -> tuple[np.ndarray, int, int, str]:
    """Fallback for containers libsndfile cannot open (e.g. AAC in M4A)."""
    import librosa

    with tempfile.NamedTemporaryFile(suffix=suffix or ".bin", delete=False) as tmp:
        tmp.write(data)
        tmp_path = Path(tmp.name)
    try:
        waveform, sample_rate = librosa.load(str(tmp_path), sr=None, mono=False)
        waveform = np.asarray(waveform)
        channels = 1 if waveform.ndim == 1 else int(waveform.shape[0])
        return _clean(_to_mono(waveform)), int(sample_rate), channels, suffix.lstrip(".").upper()
    finally:
        tmp_path.unlink(missing_ok=True)


def _read_with_wave(data: bytes) -> tuple[np.ndarray, int, int, str]:
    """Last-resort pure-stdlib PCM WAV reader (handles odd PCM variants)."""
    with wave.open(io.BytesIO(data), "rb") as handle:
        channels = handle.getnchannels()
        sample_rate = handle.getframerate()
        width = handle.getsampwidth()
        frames = handle.readframes(handle.getnframes())

    if width == 1:
        audio = (np.frombuffer(frames, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    elif width == 2:
        audio = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    elif width == 3:
        raw = np.frombuffer(frames, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        packed = raw[:, 0] | (raw[:, 1] << 8) | (raw[:, 2] << 16)
        packed = np.where(packed & 0x800000, packed - 0x1000000, packed)
        audio = packed.astype(np.float32) / 8388608.0
    elif width == 4:
        audio = np.frombuffer(frames, dtype="<i4").astype(np.float32) / 2147483648.0
    else:
        raise InvalidAudioError("Unsupported PCM sample width in WAV file.")

    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    return _clean(audio), sample_rate, channels, "WAV"


def decode_audio(data: bytes, filename: str | None = None) -> DecodedAudio:
    """Decode raw upload bytes into mono float32 samples at the native rate."""
    if not data:
        raise InvalidAudioError("The uploaded file is empty.")

    suffix = Path(filename or "").suffix.lower()
    errors: list[str] = []

    for reader in ("soundfile", "librosa", "wave"):
        try:
            if reader == "soundfile":
                samples, sample_rate, channels, fmt = _read_with_soundfile(data)
            elif reader == "librosa":
                if suffix not in SUPPORTED_EXTENSIONS:
                    continue
                samples, sample_rate, channels, fmt = _read_with_librosa(data, suffix)
            else:
                samples, sample_rate, channels, fmt = _read_with_wave(data)
        except AudioError:
            raise
        except Exception as exc:  # noqa: BLE001 - decoder backends raise many types
            errors.append(f"{reader}: {type(exc).__name__}: {exc}")
            continue

        if samples.size == 0 or sample_rate <= 0:
            errors.append(f"{reader}: decoded no audio frames")
            continue

        peak = float(np.max(np.abs(samples))) if samples.size else 0.0
        if peak < 1e-5:
            raise SilentAudioError(
                "The audio appears to be silent or is completely digital silence.",
                "Peak amplitude is below the detection floor, so no voice is present.",
            )

        return DecodedAudio(
            samples=np.clip(samples, -1.0, 1.0),
            sample_rate=sample_rate,
            format=fmt or (suffix.lstrip(".").upper() or "AUDIO"),
            original_channels=channels,
        )

    raise UnsupportedFormatError(
        "That file could not be decoded as audio.",
        "Supported formats are WAV, MP3, OGG/OPUS, FLAC, M4A and AAC. The file may be "
        "corrupted, password protected, or not actually audio.",
        internal=" | ".join(errors[:4]) or None,
    )


def resample(samples: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
    if source_rate == target_rate or samples.size == 0:
        return samples.astype(np.float32, copy=False)

    from math import gcd

    from scipy.signal import resample_poly

    divisor = gcd(int(source_rate), int(target_rate))
    up = int(target_rate) // divisor
    down = int(source_rate) // divisor
    resampled = resample_poly(samples, up, down)
    return np.ascontiguousarray(resampled, dtype=np.float32)


def fix_length(samples: np.ndarray, length: int, repeat_short: bool = True) -> tuple[np.ndarray, bool]:
    """Pad/crop to exactly `length` samples. Returns (samples, was_modified)."""
    count = samples.size
    if count == length:
        return samples.astype(np.float32, copy=False), False

    if count > length:
        start = (count - length) // 2
        return np.ascontiguousarray(samples[start : start + length], dtype=np.float32), True

    if repeat_short and count > 0:
        repeats = int(np.ceil(length / count))
        tiled = np.tile(samples, repeats)[:length]
        return np.ascontiguousarray(tiled, dtype=np.float32), True

    padded = np.zeros(length, dtype=np.float32)
    padded[:count] = samples
    return padded, True


def prepare_audio(
    data: bytes,
    filename: str | None,
    *,
    sample_rate: int,
    length: int,
    repeat_short: bool = True,
    min_duration: float = 0.25,
    max_duration: float = 600.0,
) -> tuple[DecodedAudio, np.ndarray, bool]:
    """Decode, validate, resample and length-fix an upload in one pass."""
    decoded = decode_audio(data, filename)

    duration = decoded.duration_seconds
    if duration < min_duration:
        raise AudioTooShortError(
            f"Audio is too short ({duration:.2f}s). Please upload at least "
            f"{min_duration:.2f}s of speech.",
        )
    if duration > max_duration:
        raise AudioTooLongError(
            f"Audio is too long ({duration:.1f}s). The maximum is {max_duration:.0f}s.",
        )

    mono = resample(decoded.samples, decoded.sample_rate, sample_rate)
    fixed, modified = fix_length(mono, length, repeat_short=repeat_short)
    return decoded, fixed, modified


def format_fraction(value: float) -> str:
    """Small helper used for compact logging."""
    fraction = Fraction(value).limit_denominator(1000)
    return f"{fraction.numerator}/{fraction.denominator}"
