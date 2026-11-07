"use client";

import { useCallback, useEffect, useRef } from "react";

type Tone = "neutral" | "real" | "fake";

interface WaveformProps {
  peaks: number[] | null;
  progress?: number;
  tone?: Tone;
  height?: number;
  onSeek?: (fraction: number) => void;
  animated?: boolean;
  label?: string;
}

const TONE_COLORS: Record<Tone, { played: [string, string]; glow: string }> = {
  neutral: { played: ["#4cf0b0", "#4fd8f5"], glow: "rgba(76, 240, 176, 0.35)" },
  real: { played: ["#7dffcf", "#24d99a"], glow: "rgba(36, 217, 154, 0.4)" },
  fake: { played: ["#ff8ba3", "#f43f66"], glow: "rgba(244, 63, 102, 0.4)" },
};

const IDLE_PEAKS = Array.from({ length: 96 }, (_, index) => {
  const wave = Math.sin(index / 5.5) * 0.5 + Math.sin(index / 2.1) * 0.2;
  return 0.12 + Math.abs(wave) * 0.5;
});

function samplePeaks(source: number[], count: number): number[] {
  if (source.length === 0) return new Array(count).fill(0.05);
  const result: number[] = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor((i / count) * source.length);
    const end = Math.max(start + 1, Math.floor(((i + 1) / count) * source.length));
    let peak = 0;
    for (let j = start; j < end && j < source.length; j += 1) {
      if (source[j] > peak) peak = source[j];
    }
    result[i] = peak;
  }
  return result;
}

export default function Waveform({
  peaks,
  progress = 0,
  tone = "neutral",
  height = 112,
  onSeek,
  animated = false,
  label = "Audio waveform",
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const phaseRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth;
    if (width === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const barWidth = 3;
    const gap = 2.5;
    const count = Math.max(Math.floor(width / (barWidth + gap)), 12);
    const source = peaks ?? IDLE_PEAKS;
    const values = samplePeaks(source, count);
    const mid = height / 2;
    const maxBar = height * 0.86;
    const activeBars = Math.round(count * Math.min(Math.max(progress, 0), 1));
    const colors = TONE_COLORS[tone];

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, colors.played[0]);
    gradient.addColorStop(1, colors.played[1]);

    for (let i = 0; i < count; i += 1) {
      let value = values[i];
      if (animated) {
        const wave = Math.sin(phaseRef.current / 22 + i / 3.4) * 0.22 + 0.78;
        value *= wave;
      }
      const barHeight = Math.max(value * maxBar, 3);
      const x = i * (barWidth + gap);
      const isPlayed = i < activeBars;

      ctx.fillStyle = isPlayed ? gradient : "rgba(255, 255, 255, 0.16)";
      ctx.beginPath();
      const radius = Math.min(barWidth / 2, barHeight / 2);
      ctx.roundRect(x, mid - barHeight / 2, barWidth, barHeight, radius);
      ctx.fill();
    }

    if (activeBars > 0 && activeBars < count) {
      const x = activeBars * (barWidth + gap) - gap / 2;
      ctx.fillStyle = colors.glow;
      ctx.fillRect(x, mid - maxBar / 2, 1.5, maxBar);
    }
  }, [animated, height, peaks, progress, tone]);

  useEffect(() => {
    draw();
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => draw());
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    if (!animated) return;
    const tick = () => {
      phaseRef.current += 1;
      draw();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [animated, draw]);

  const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - rect.left) / rect.width;
    onSeek(Math.min(Math.max(fraction, 0), 1));
  };

  const interactive = Boolean(onSeek);

  return (
    <div
      ref={containerRef}
      onClick={interactive ? handleSeek : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "ArrowRight") onSeek?.(Math.min(progress + 0.05, 1));
              if (event.key === "ArrowLeft") onSeek?.(Math.max(progress - 0.05, 0));
            }
          : undefined
      }
      role={interactive ? "slider" : "img"}
      aria-label={label}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? 100 : undefined}
      aria-valuenow={interactive ? Math.round(progress * 100) : undefined}
      tabIndex={interactive ? 0 : -1}
      className={`relative w-full select-none ${interactive ? "cursor-pointer" : ""}`}
    >
      <canvas ref={canvasRef} className="block w-full" aria-hidden="true" />
    </div>
  );
}
