import Link from "next/link";
import BootLog from "./components/boot-log";
import Starfield from "./components/starfield";

const TELEMETRY = [
  { label: "MISSION", value: "SJS-780002" },
  { label: "PHASE", value: "PREQUEL / T-00:00:09" },
  { label: "PAYLOAD", value: "1 (one) very hungry mouth" },
  { label: "HAZARD", value: "KESSLER CASCADE" },
];

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-[#04070a] font-mono text-zinc-300 selection:bg-emerald-400 selection:text-black">
      <Starfield />

      {/* CRT scanlines + vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.035)_0px,rgba(255,255,255,0.035)_1px,transparent_1px,transparent_3px)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.85)_100%)]" />

      <header className="relative z-10 flex items-center justify-between border-b border-emerald-400/20 px-6 py-3 text-[11px] uppercase tracking-[0.2em] text-emerald-400/60">
        <span>orbital debris remediation corps</span>
        <span className="hidden sm:inline">est. 2061 · sol iii · low earth orbit</span>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-6 py-16">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400/60">
            a prequel
          </p>
          <h1 className="text-5xl font-bold uppercase leading-none tracking-tight text-zinc-50 sm:text-7xl">
            Space<span className="text-emerald-400">Joops</span>
          </h1>
          <p className="max-w-lg text-sm leading-7 text-zinc-400 sm:text-base">
            Humanity littered the sky with 8,000 tonnes of dead satellites, spent
            boosters, and frozen coolant. Somebody has to clean it up. Somebody
            built a mouth for it.
          </p>
        </div>

        <div className="rounded-sm border border-emerald-400/25 bg-black/60 p-5 shadow-[0_0_40px_-12px_rgba(74,222,128,0.35)] backdrop-blur-[1px]">
          <BootLog />
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-zinc-800 pt-6 text-xs sm:grid-cols-4">
          {TELEMETRY.map(({ label, value }) => (
            <div key={label} className="space-y-1">
              <dt className="uppercase tracking-[0.2em] text-zinc-600">{label}</dt>
              <dd className="text-emerald-400/90">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Link
            href="/play"
            className="group flex h-12 items-center justify-center gap-3 rounded-sm bg-emerald-400 px-8 text-sm font-bold uppercase tracking-[0.2em] text-black transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
          >
            <span className="animate-pulse group-hover:animate-none">▶</span>
            Ignite
          </Link>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">
            no rescue craft is scheduled
          </p>
        </div>
      </main>

      <footer className="relative z-10 flex items-center justify-between border-t border-emerald-400/20 px-6 py-3 text-[11px] uppercase tracking-[0.2em] text-zinc-700">
        <span>v0.1.0 — flight software unqualified</span>
        <span className="hidden sm:inline">Δv remaining: sufficient (probably)</span>
      </footer>
    </div>
  );
}
