"use client";

import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/api";

type Status = "checking" | "online" | "offline";

export default function ModelStatus() {
  const [status, setStatus] = useState<Status>("checking");
  const [device, setDevice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const check = async () => {
      const health = await fetchHealth(controller.signal);
      if (!health) {
        setStatus("offline");
        return;
      }
      setStatus(health.model_loaded ? "online" : "offline");
      setDevice(health.device);
    };

    void check();
    const timer = window.setInterval(check, 45_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  const config = {
    checking: { dot: "bg-mist-600", text: "Connecting", ring: "" },
    online: {
      dot: "bg-mint-400",
      text: device ? `Model online · ${device.toUpperCase()}` : "Model online",
      ring: "shadow-[0_0_10px_rgba(76,240,176,0.8)]",
    },
    offline: { dot: "bg-amber-400", text: "Backend offline", ring: "" },
  }[status];

  return (
    <span
      title={
        status === "offline"
          ? "The FastAPI backend is not reachable. Start it on port 8000."
          : "AASIST model status"
      }
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-mist-500"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot} ${config.ring}`} />
      {config.text}
    </span>
  );
}
