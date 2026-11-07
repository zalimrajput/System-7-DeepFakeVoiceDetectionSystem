"use client";

import { useEffect, useState } from "react";
import { formatPercent } from "@/lib/format";

interface ProbabilityBarsProps {
  fake: number;
  real: number;
}

interface RowProps {
  name: string;
  probability: number;
  active: boolean;
  gradient: string;
  dot: string;
}

function Row({ name, probability, active, gradient, dot }: RowProps) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setWidth(probability));
    return () => cancelAnimationFrame(frame);
  }, [probability]);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-mist-300">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: dot, boxShadow: active ? `0 0 10px ${dot}` : "none" }}
          />
          {name}
          {active && (
            <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-px text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-mist-500">
              top
            </span>
          )}
        </span>
        <span
          className="font-mono text-sm tabular-nums"
          style={{ color: active ? dot : "var(--color-mist-500)" }}
        >
          {formatPercent(probability, 2)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(width * 100, 0.6)}%`,
            background: gradient,
            opacity: active ? 1 : 0.55,
            transition: "width 1s cubic-bezier(0.22, 1, 0.36, 1)",
            boxShadow: active ? `0 0 14px ${dot}66` : "none",
          }}
        />
      </div>
    </div>
  );
}

export default function ProbabilityBars({ fake, real }: ProbabilityBarsProps) {
  const fakeWins = fake >= real;
  return (
    <div className="space-y-4">
      <Row
        name="Fake / synthetic"
        probability={fake}
        active={fakeWins}
        dot="#ff6a8b"
        gradient="linear-gradient(90deg, #ff9db2, #f43f66)"
      />
      <Row
        name="Real / human"
        probability={real}
        active={!fakeWins}
        dot="#4cf0b0"
        gradient="linear-gradient(90deg, #7dffcf, #24d99a)"
      />
    </div>
  );
}
