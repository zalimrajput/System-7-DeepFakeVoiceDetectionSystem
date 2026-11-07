"use client";

import { useEffect, useState } from "react";

interface ConfidenceGaugeProps {
  value: number; // 0..1
  tone: "real" | "fake";
  label: string;
}

const TONE = {
  real: { stroke: "url(#gauge-real)", glow: "rgba(36, 217, 154, 0.45)", text: "#7dffcf" },
  fake: { stroke: "url(#gauge-fake)", glow: "rgba(244, 63, 102, 0.45)", text: "#ff9db2" },
};

export default function ConfidenceGauge({ value, tone, label }: ConfidenceGaugeProps) {
  const [animated, setAnimated] = useState(0);
  const clamped = Math.min(Math.max(value, 0), 1);
  const size = 188;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const colors = TONE[tone];

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimated(clamped));
    return () => cancelAnimationFrame(frame);
  }, [clamped]);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id="gauge-real" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7dffcf" />
            <stop offset="100%" stopColor="#21c4c9" />
          </linearGradient>
          <linearGradient id="gauge-fake" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff9db2" />
            <stop offset="100%" stopColor="#f43f66" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - animated)}
          style={{
            transition: "stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)",
            filter: `drop-shadow(0 0 10px ${colors.glow})`,
          }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span
          className="font-mono text-[2.35rem] leading-none font-semibold tracking-tight tabular-nums"
          style={{ color: colors.text }}
        >
          {(clamped * 100).toFixed(1)}
          <span className="text-base align-super">%</span>
        </span>
        <span className="text-[0.62rem] font-medium uppercase tracking-[0.22em] text-mist-500">
          {label}
        </span>
      </div>
    </div>
  );
}
