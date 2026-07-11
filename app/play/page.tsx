import Link from "next/link";

export default function Play() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-[#04070a] px-6 text-center font-mono text-zinc-400">
      <p className="text-xs uppercase tracking-[0.35em] text-emerald-400/60">
        stage 1 — orbit insertion
      </p>
      <h1 className="text-2xl uppercase tracking-tight text-zinc-50">
        Maw not yet installed.
      </h1>
      <p className="max-w-md text-sm leading-7">
        The scavenger is on the pad. The game loop is not. Come back when the
        engineers stop arguing about the thrust curve.
      </p>
      <Link
        href="/"
        className="text-sm uppercase tracking-[0.2em] text-emerald-400 underline-offset-4 hover:underline"
      >
        ← abort to briefing
      </Link>
    </div>
  );
}
