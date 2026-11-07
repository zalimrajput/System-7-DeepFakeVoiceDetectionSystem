"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";

import VerdictCard from "@/components/VerdictCard";
import Waveform from "@/components/Waveform";
import {
  IconAlert,
  IconAudioFile,
  IconClose,
  IconCpu,
  IconPause,
  IconPlay,
  IconReset,
  IconShield,
  IconSpark,
  IconUpload,
  IconWave,
} from "@/components/icons";
import { ApiError, analyzeAudio } from "@/lib/api";
import {
  fileExtension,
  formatBytes,
  formatDuration,
  shortFilename,
} from "@/lib/format";
import type { AnalysisResponse } from "@/lib/types";

type Phase = "idle" | "ready" | "analyzing" | "done";

interface MediaInfo {
  sampleRate: number;
  channels: number;
}

interface UiError {
  message: string;
  detail?: string;
  code?: string;
}

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = ["wav", "mp3", "ogg", "oga", "opus", "flac", "m4a", "aac", "mp4"];
const FORMAT_LABELS = ["WAV", "MP3", "OGG", "FLAC", "M4A", "AAC"];

const STAGES = [
  "Decoding audio container",
  "Resampling to 16 kHz mono",
  "Running AASIST inference",
  "Computing REAL / FAKE probabilities",
];

function buildPeaks(buffer: AudioBuffer, buckets = 220): number[] {
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    channels.push(buffer.getChannelData(channel));
  }
  const blockSize = Math.max(Math.floor(buffer.length / buckets), 1);
  const peaks: number[] = [];
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = bucket * blockSize;
    const end = Math.min(start + blockSize, buffer.length);
    let peak = 0;
    for (const data of channels) {
      for (let index = start; index < end; index += 1) {
        const value = Math.abs(data[index]);
        if (value > peak) peak = value;
      }
    }
    peaks.push(peak);
  }
  const max = Math.max(...peaks, 0.0001);
  return peaks.map((peak) => Math.min(1, Math.pow(peak / max, 0.72)));
}

function validateFile(file: File): string | null {
  const extension = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase() ?? ""
    : "";
  if (extension && !ALLOWED.includes(extension)) {
    return `“${extension.toUpperCase()}” files are not supported. Use WAV, MP3, OGG, FLAC, M4A or AAC.`;
  }
  if (file.size === 0) {
    return "That file is empty. Please choose an audio recording.";
  }
  if (file.size > MAX_BYTES) {
    return `That file is ${formatBytes(file.size)}. The maximum upload size is 25 MB.`;
  }
  return null;
}

/* --------------------------------------------------------------- sub-views */

function ErrorBanner({ error, onDismiss }: { error: UiError; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="animate-rise flex items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.07] p-3.5"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-rose-400/30 bg-rose-500/10 text-rose-400">
        <IconAlert className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.82rem] font-medium text-rose-200">{error.message}</p>
        {error.detail && (
          <p className="mt-1 break-words text-[0.72rem] leading-relaxed text-rose-200/60">
            {error.detail}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="rounded-md p-1 text-rose-200/50 transition hover:bg-white/5 hover:text-rose-100"
      >
        <IconClose className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Dropzone({
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowse,
  error,
}: {
  dragging: boolean;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onBrowse: () => void;
  error: string | null;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onBrowse}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onBrowse();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Upload an audio file"
      className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition-all duration-300 sm:py-14 ${
        dragging
          ? "border-mint-400/70 bg-mint-400/[0.07] shadow-[0_0_60px_-20px_rgba(76,240,176,0.45)]"
          : error
            ? "border-rose-400/30 bg-rose-500/[0.03] hover:border-rose-400/50"
            : "border-white/12 bg-white/[0.015] hover:border-mint-400/40 hover:bg-white/[0.035]"
      }`}
    >
      <span
        className={`relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border transition ${
          dragging
            ? "border-mint-400/40 bg-mint-400/15 text-mint-400"
            : "border-white/10 bg-white/[0.04] text-mist-300 group-hover:text-mint-400"
        }`}
      >
        <span className="absolute inset-0 animate-pulse-ring rounded-2xl border border-mint-400/30" />
        <IconUpload className="h-7 w-7" />
      </span>

      <p className="text-[1.02rem] font-medium tracking-tight text-white">
        {dragging ? "Drop it to load" : "Drag & drop your audio"}
      </p>
      <p className="mt-1.5 max-w-xs text-[0.8rem] leading-relaxed text-mist-500">
        or <span className="text-mint-400 underline decoration-mint-400/30 underline-offset-4">browse files</span>{" "}
        — we&apos;ll check whether the voice is human or synthetic.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
        {FORMAT_LABELS.map((label) => (
          <span
            key={label}
            className="rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[0.58rem] tracking-wider text-mist-600"
          >
            {label}
          </span>
        ))}
        <span className="ml-1 font-mono text-[0.58rem] tracking-wider text-mist-600">
          · max 25 MB
        </span>
      </div>
    </div>
  );
}

function AnalysisPlaceholder() {
  return (
    <div className="animate-rise flex h-full flex-col justify-between rounded-2xl border border-white/[0.07] bg-white/[0.015] p-6">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-mist-500">
          <IconShield className="h-3 w-3" />
          Verdict
        </span>

        <div className="mt-8 flex flex-col items-center text-center">
          <div className="relative flex h-28 w-28 items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-dashed border-white/12" />
            <div className="absolute inset-3 rounded-full border border-white/[0.07]" />
            <IconWave className="h-8 w-8 text-mist-600" />
          </div>
          <p className="mt-6 text-[0.95rem] font-medium text-mist-300">Awaiting audio</p>
          <p className="mt-2 max-w-[19rem] text-[0.8rem] leading-relaxed text-mist-600">
            Upload a recording, preview it, then run the analysis. The verdict, gauge
            and probabilities appear here.
          </p>
        </div>
      </div>

      <ul className="mt-8 space-y-3 border-t border-white/[0.06] pt-5">
        {[
          ["AASIST", "graph attention anti-spoofing model"],
          ["16 kHz mono", "64,600-sample window per inference"],
          ["REAL / FAKE", "softmax probabilities with confidence"],
        ].map(([label, description]) => (
          <li key={label} className="flex items-start gap-3">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-mint-400/70" />
            <p className="text-[0.76rem] leading-snug text-mist-600">
              <span className="font-medium text-mist-300">{label}</span> — {description}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnalyzingState({ peaks }: { peaks: number[] | null }) {
  const [stage, setStage] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const stageTimer = window.setInterval(() => {
      setStage((current) => Math.min(current + 1, STAGES.length - 1));
    }, 1400);
    const clock = window.setInterval(() => setElapsed((value) => value + 0.1), 100);
    return () => {
      window.clearInterval(stageTimer);
      window.clearInterval(clock);
    };
  }, []);

  return (
    <div className="animate-rise relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-mint-400/20 bg-mint-400/[0.03] p-6">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-mint-400/20 blur-3xl" />

      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-mint-400/25 bg-mint-400/10 px-3 py-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-mint-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint-400" />
            Analyzing
          </span>
          <span className="font-mono text-[0.68rem] tabular-nums text-mist-500">
            {elapsed.toFixed(1)}s
          </span>
        </div>

        <div className="mt-6">
          <Waveform peaks={peaks} animated height={104} label="Processing waveform" />
        </div>

        <ol className="mt-6 space-y-2.5">
          {STAGES.map((label, index) => {
            const state = index < stage ? "done" : index === stage ? "active" : "pending";
            return (
              <li key={label} className="flex items-center gap-3">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border text-[0.55rem] ${
                    state === "done"
                      ? "border-mint-400/40 bg-mint-400/15 text-mint-400"
                      : state === "active"
                        ? "border-mint-400/50 bg-mint-400/10 text-mint-400"
                        : "border-white/10 bg-white/[0.03] text-mist-600"
                  }`}
                >
                  {state === "done" ? (
                    "✓"
                  ) : state === "active" ? (
                    <span className="h-1.5 w-1.5 animate-ping rounded-full bg-mint-400" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={`text-[0.8rem] ${
                    state === "pending" ? "text-mist-600" : "text-mist-300"
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="relative mt-6 border-t border-white/[0.06] pt-4 text-[0.7rem] leading-relaxed text-mist-600">
        The model usually answers in 1–3 seconds. Keep this tab open — results are not
        stored anywhere.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- main */

export default function AudioAnalyzer() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragDepth = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<UiError | null>(null);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const tone = result ? (result.prediction === "FAKE" ? "fake" : "real") : "neutral";

  const inspect = useCallback(async (nextFile: File, url: string) => {
    setInspecting(true);
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) throw new Error("Web Audio is unavailable");

      const context = new Ctor();
      try {
        const raw = await nextFile.arrayBuffer();
        const decoded = await context.decodeAudioData(raw);
        setDuration(decoded.duration);
        setMedia({
          sampleRate: decoded.sampleRate,
          channels: decoded.numberOfChannels,
        });
        setPeaks(buildPeaks(decoded));
      } finally {
        void context.close();
      }
    } catch {
      // The browser could not decode it (e.g. AAC on Firefox). Metadata from a
      // media element is enough for the preview; the backend does the real work.
      const probe = document.createElement("audio");
      probe.preload = "metadata";
      probe.src = url;
      probe.addEventListener(
        "loadedmetadata",
        () => setDuration(Number.isFinite(probe.duration) ? probe.duration : 0),
        { once: true },
      );
      setPeaks(null);
    } finally {
      setInspecting(false);
    }
  }, []);

  const acceptFile = useCallback(
    (incoming: File | null | undefined) => {
      if (!incoming) return;
      const problem = validateFile(incoming);
      if (problem) {
        setError({ message: problem, code: "invalid_file" });
        return;
      }

      abortRef.current?.abort();
      abortRef.current = null;
      audioRef.current?.pause();

      const url = URL.createObjectURL(incoming);
      setFile(incoming);
      setPreviewUrl(url);
      setPeaks(null);
      setMedia(null);
      setResult(null);
      setError(null);
      setDuration(0);
      setCurrentTime(0);
      setPlaying(false);
      setPhase("ready");
      void inspect(incoming, url);
    },
    [inspect],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    audioRef.current?.pause();
    setFile(null);
    setPreviewUrl(null);
    setPeaks(null);
    setMedia(null);
    setResult(null);
    setError(null);
    setPhase("idle");
    setDuration(0);
    setCurrentTime(0);
    setPlaying(false);
    setInspecting(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setError({
          message: "This file cannot be previewed in your browser.",
          detail: "Analysis will still work — press Analyze audio.",
          code: "preview_failed",
        });
      }
    } else {
      audio.pause();
    }
  };

  const seek = (fraction: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const next = Math.min(Math.max(fraction, 0), 1) * duration;
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const analyze = async () => {
    if (!file || phase === "analyzing") return;
    audioRef.current?.pause();
    setError(null);
    setResult(null);
    setPhase("analyzing");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await analyzeAudio(file, controller.signal);
      setResult(response);
      setPhase("done");
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase("ready");
        return;
      }
      const apiError =
        caught instanceof ApiError
          ? caught
          : new ApiError("Something went wrong while analyzing the audio.");
      setError({
        message: apiError.message,
        detail: apiError.detail,
        code: apiError.code,
      });
      setPhase("ready");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("ready");
  };

  const hasFile = Boolean(file);
  const statusChip = useMemo(() => {
    if (inspecting) return { label: "Reading", tone: "text-mist-500 border-white/10 bg-white/[0.04]" };
    if (phase === "done") return { label: "Analyzed", tone: "text-mint-400 border-mint-400/25 bg-mint-400/10" };
    if (phase === "analyzing") return { label: "Processing", tone: "text-cyan-400 border-cyan-400/25 bg-cyan-400/10" };
    return { label: "Ready", tone: "text-mist-300 border-white/10 bg-white/[0.05]" };
  }, [inspecting, phase]);

  return (
    <section id="analyzer" className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)]">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".wav,.mp3,.ogg,.oga,.opus,.flac,.m4a,.aac,audio/*"
        className="sr-only"
        onChange={(event) => acceptFile(event.target.files?.[0])}
      />

      {/* -------------------------------------------------- upload / preview */}
      <div className="glass flex flex-col rounded-[1.35rem] p-4 sm:p-5">
        <header className="flex items-center justify-between gap-3 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-mist-300">
              <IconAudioFile className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[0.82rem] font-semibold tracking-tight text-white">
                Audio input
              </h2>
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-mist-600">
                step 01 — upload
              </p>
            </div>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] ${statusChip.tone}`}
          >
            {statusChip.label}
          </span>
        </header>

        {!hasFile ? (
          <Dropzone
            dragging={dragging}
            error={error?.code === "invalid_file" ? error.message : null}
            onBrowse={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              dragDepth.current += 1;
              setDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              dragDepth.current = Math.max(dragDepth.current - 1, 0);
              if (dragDepth.current === 0) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              acceptFile(event.dataTransfer.files?.[0]);
            }}
          />
        ) : (
          <div className="animate-rise space-y-4">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-gradient-to-br from-white/[0.09] to-white/[0.02] text-mint-400">
                  <IconAudioFile className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[0.85rem] font-medium text-white"
                    title={file?.name}
                  >
                    {shortFilename(file?.name ?? "")}
                  </p>
                  <p className="mt-0.5 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-mist-600">
                    {fileExtension(file?.name ?? "")} · {formatBytes(file?.size ?? 0)}
                    {inspecting ? " · reading…" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={reset}
                  disabled={phase === "analyzing"}
                  aria-label="Remove file and start over"
                  className="rounded-lg p-1.5 text-mist-500 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
                >
                  <IconClose className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3">
                <Waveform
                  peaks={peaks}
                  progress={progress}
                  tone={tone}
                  height={88}
                  onSeek={seek}
                  label="Audio waveform — click to seek"
                />
              </div>

              <div className="mt-1 flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlayback}
                  disabled={!previewUrl}
                  aria-label={playing ? "Pause preview" : "Play preview"}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white transition hover:bg-white/[0.12] disabled:opacity-40"
                >
                  {playing ? (
                    <IconPause className="h-3.5 w-3.5" />
                  ) : (
                    <IconPlay className="ml-0.5 h-3.5 w-3.5" />
                  )}
                </button>

                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-mint-400 to-cyan-400 transition-[width] duration-150"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>

                <span className="shrink-0 font-mono text-[0.62rem] tabular-nums text-mist-500">
                  {formatDuration(currentTime)} / {formatDuration(duration)}
                </span>
              </div>

              <dl className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-white/[0.06] pt-3 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-mist-600">
                <div className="flex gap-1.5">
                  <dt>Duration</dt>
                  <dd className="text-mist-400">{duration ? `${duration.toFixed(2)}s` : "—"}</dd>
                </div>
                <span className="text-white/10">/</span>
                <div className="flex gap-1.5">
                  <dt>Source</dt>
                  <dd className="text-mist-400">
                    {media ? `${(media.sampleRate / 1000).toFixed(1)} kHz` : "—"}
                  </dd>
                </div>
                <span className="text-white/10">/</span>
                <div className="flex gap-1.5">
                  <dt>Channels</dt>
                  <dd className="text-mist-400">
                    {media ? (media.channels > 1 ? "stereo" : "mono") : "—"}
                  </dd>
                </div>
                <span className="text-white/10">/</span>
                <div className="flex gap-1.5">
                  <dt>Model input</dt>
                  <dd className="text-mist-400">16 kHz mono</dd>
                </div>
              </dl>
            </div>

            {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

            <div className="flex flex-wrap items-center gap-2.5">
              {phase === "analyzing" ? (
                <button type="button" onClick={cancel} className="btn-ghost flex-1">
                  <IconClose className="h-4 w-4" />
                  Cancel analysis
                </button>
              ) : (
                <button
                  type="button"
                  onClick={analyze}
                  className="btn-primary flex-1 sm:flex-none sm:min-w-[13rem]"
                >
                  <IconSpark className="h-4 w-4" />
                  Analyze audio
                </button>
              )}

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={phase === "analyzing"}
                className="btn-ghost"
              >
                <IconUpload className="h-4 w-4" />
                Replace
              </button>

              <button
                type="button"
                onClick={reset}
                disabled={phase === "analyzing"}
                className="btn-ghost ml-auto"
                aria-label="Clear and reset"
              >
                <IconReset className="h-4 w-4" />
                Clear
              </button>
            </div>

            {phase === "ready" && !error && (
              <p className="text-[0.7rem] leading-relaxed text-mist-600">
                Preview sounds right? Run the analysis to score this clip with AASIST.
              </p>
            )}
          </div>
        )}

        {!hasFile && error && (
          <div className="mt-4">
            <ErrorBanner error={error} onDismiss={() => setError(null)} />
          </div>
        )}

        {!hasFile && (
          <footer className="mt-auto grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-4 text-center">
            {[
              ["WAV / MP3", "OGG / FLAC"],
              ["M4A / AAC", "≤ 25 MB"],
              ["16 kHz", "mono · 64,600"],
            ].map(([top, bottom]) => (
              <div key={top}>
                <p className="font-mono text-[0.62rem] text-mist-400">{top}</p>
                <p className="mt-0.5 font-mono text-[0.56rem] uppercase tracking-[0.1em] text-mist-600">
                  {bottom}
                </p>
              </div>
            ))}
          </footer>
        )}
      </div>

      {/* ------------------------------------------------------------- result */}
      <div className="flex flex-col gap-4">
        {phase === "analyzing" ? (
          <AnalyzingState peaks={peaks} />
        ) : result ? (
          <>
            <VerdictCard result={result} />
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-mist-600">
                <IconCpu className="h-3 w-3" />
                {result.model.name} · {result.model.checkpoint}
              </p>
              <button type="button" onClick={reset} className="btn-ghost px-3 py-1.5 text-xs">
                <IconReset className="h-3.5 w-3.5" />
                New analysis
              </button>
            </div>
          </>
        ) : (
          <AnalysisPlaceholder />
        )}

        <audio
          ref={audioRef}
          src={previewUrl ?? undefined}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration;
            if (Number.isFinite(value) && value > 0) setDuration(value);
          }}
          className="hidden"
        />
      </div>
    </section>
  );
}
