"use client";

import ConfidenceGauge from "@/components/ConfidenceGauge";
import ProbabilityBars from "@/components/ProbabilityBars";
import type { AnalysisResponse } from "@/lib/types";
import { formatBytes, formatClockTime, formatDuration, formatPercent } from "@/lib/format";

interface VerdictCardProps {
  result: AnalysisResponse;
}

const COPY = {
  REAL: {
    title: "Authentic voice",
    body: "Acoustic, spectral and temporal cues look consistent with a live human recording. No strong synthesis artifacts were detected.",
    badge: "Real",
    chip: "text-mint-400 border-mint-400/30 bg-mint-400/10",
    panel: "glow-mint",
    accent: "#4cf0b0",
  },
  FAKE: {
    title: "Synthetic voice detected",
    body: "The model found artifacts typical of text-to-speech or voice conversion systems. Treat this recording as deepfaked audio.",
    badge: "Fake",
    chip: "text-rose-400 border-rose-400/30 bg-rose-400/10",
    panel: "glow-rose",
    accent: "#ff6a8b",
  },
} as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-mist-600">
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-[0.78rem] text-mist-300" title={value}>
        {value}
      </dd>
    </div>
  );
}

export default function VerdictCard({ result }: VerdictCardProps) {
  const tone = result.prediction === "FAKE" ? "fake" : "real";
  const copy = COPY[result.prediction];
  const { audio, model } = result;
  const margin = Math.abs(result.probabilities.fake - result.probabilities.real);

  return (
    <article
      aria-live="polite"
      className={`animate-rise relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6 ${copy.panel}`}
    >
      <div
        className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full opacity-25 blur-3xl"
        style={{ background: copy.accent }}
      />

      <header className="relative flex flex-wrap items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] ${copy.chip}`}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: copy.accent, boxShadow: `0 0 10px ${copy.accent}` }}
          />
          {copy.badge} detected
        </span>
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-mist-600">
          {formatClockTime(result.analyzed_at)}
        </span>
      </header>

      <div className="relative mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-7">
        <ConfidenceGauge value={result.confidence} tone={tone} label="confidence" />

        <div className="w-full min-w-0 space-y-4">
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-white">{copy.title}</h3>
            <p className="mt-1.5 text-[0.82rem] leading-relaxed text-mist-500">{copy.body}</p>
          </div>
          <ProbabilityBars
            fake={result.probabilities.fake}
            real={result.probabilities.real}
          />
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-mist-600">
            Decision margin {(margin * 100).toFixed(1)} pts · threshold 50%
          </p>
        </div>
      </div>

      <dl className="relative mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-white/[0.07] pt-5 sm:grid-cols-3">
        <Stat label="Duration" value={`${formatDuration(audio.duration_seconds)} · ${audio.duration_seconds.toFixed(2)}s`} />
        <Stat label="Format" value={`${audio.format ?? "AUDIO"} · ${formatBytes(audio.size_bytes)}`} />
        <Stat
          label="Input audio"
          value={`${(audio.original_sample_rate / 1000).toFixed(1)} kHz · ${audio.original_channels} ch`}
        />
        <Stat label="Model input" value={`${(audio.sample_rate / 1000).toFixed(0)} kHz · mono · ${audio.samples.toLocaleString()} samples`} />
        <Stat label="Model" value={`${model.name} · ${model.device.toUpperCase()}`} />
        <Stat label="Inference" value={`${Math.round(audio.processing_ms)} ms`} />
      </dl>

      <p className="relative mt-4 text-[0.68rem] leading-relaxed text-mist-600">
        Predictions come from the AASIST anti-spoofing model. Confidence reflects the
        model&apos;s softmax output, not a legal or forensic guarantee. The highest
        probability is {formatPercent(result.confidence, 1)}.
      </p>
    </article>
  );
}
