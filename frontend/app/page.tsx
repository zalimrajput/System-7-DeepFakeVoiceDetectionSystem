import AudioAnalyzer from "@/components/AudioAnalyzer";
import ModelStatus from "@/components/ModelStatus";

export default function Home() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* ambient background */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(35,60,120,0.35),transparent_65%)]" />
        <div className="animate-aurora absolute -top-40 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-mint-500/12 blur-[120px]" />
        <div className="animate-float-slow absolute top-24 -left-32 h-[26rem] w-[26rem] rounded-full bg-violet-400/10 blur-[110px]" />
        <div className="absolute top-1/3 -right-40 h-[30rem] w-[30rem] rounded-full bg-cyan-400/10 blur-[130px]" />
        <div className="absolute inset-0 grid-backdrop" />
        <div className="absolute inset-0 noise-overlay" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="/" className="group flex items-center gap-2.5">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-gradient-to-br from-mint-400/25 to-cyan-400/10 text-mint-400">
              <svg
                viewBox="0 0 24 24"
                className="h-4.5 w-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 12h1.5m2.5-4v8m3.5-11v14m3.5-8v2m3-6v10m2.5-6v2" />
              </svg>
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[0.95rem] font-semibold tracking-tight text-white">
                Veritape
              </span>
              <span className="mt-1 font-mono text-[0.52rem] uppercase tracking-[0.24em] text-mist-600">
                voice forensics
              </span>
            </span>
          </a>

          <nav className="hidden items-center gap-7 text-[0.8rem] text-mist-500 md:flex">
            <a className="transition hover:text-white" href="#analyzer">
              Analyzer
            </a>
          </nav>

          <ModelStatus />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        {/* hero */}
        <section className="pt-14 pb-10 text-center sm:pt-20 sm:pb-12">
          <div className="animate-rise mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint-400/70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-mint-400" />
            </span>
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-mist-400">
              AASIST anti-spoofing · running on PyTorch
            </span>
          </div>

          <h1 className="animate-rise mx-auto mt-6 max-w-3xl text-balance text-[2.15rem] leading-[1.06] font-semibold tracking-[-0.03em] text-white sm:text-[3.15rem]">
            Is that voice <span className="text-gradient">actually human?</span>
          </h1>

          <p className="animate-rise mx-auto mt-4 max-w-xl text-pretty text-[0.95rem] leading-relaxed text-mist-500">
            Upload a voice clip and get a REAL or FAKE verdict with calibrated
            probabilities — powered by a graph-attention model trained on spoofed
            speech.
          </p>

          <div className="animate-rise mx-auto mt-7 flex max-w-xl flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-mist-600">
            <span>WAV · MP3 · OGG · FLAC</span>
            <span className="h-1 w-1 rounded-full bg-white/15" />
            <span>16 kHz mono pipeline</span>
            <span className="h-1 w-1 rounded-full bg-white/15" />
            <span>64,600-sample window</span>
          </div>
        </section>

        <AudioAnalyzer />
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-7 sm:flex-row sm:px-6">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-mist-600">
            Veritape · AASIST + PyTorch + FastAPI + Next.js
          </p>
          <p className="text-[0.68rem] text-mist-600">
            For research and awareness. Not a forensic certificate.
          </p>
        </div>
      </footer>
    </div>
  );
}
