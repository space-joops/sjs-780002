"use client";

import { useEffect, useState } from "react";

const LINES = [
  "> booting SJS-780002 // JOOPS-class debris scavenger",
  "> orbit ......... LEO 547 km · incl 53.0° · vel 7.59 km/s",
  "> catalogue ..... 36,500 objects >10 cm · 1.3e8 objects >1 mm",
  "> kessler index . 0.71 and climbing",
  "> maw ........... plasma intake ONLINE",
  "> directive ..... EAT THE SKY. LEAVE NO SHRAPNEL.",
];

const CHAR_MS = 18;
const LINE_PAUSE_MS = 260;

export default function BootLog() {
  const [shown, setShown] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let line = 0;
    let char = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (line >= LINES.length) {
        setDone(true);
        return;
      }
      char += 1;
      const text = LINES[line];
      setCurrent(text.slice(0, char));

      if (char >= text.length) {
        const finished = text;
        timer = setTimeout(() => {
          setShown((prev) => [...prev, finished]);
          setCurrent("");
          line += 1;
          char = 0;
          tick();
        }, LINE_PAUSE_MS);
        return;
      }
      timer = setTimeout(tick, CHAR_MS);
    };

    timer = setTimeout(() => {
      if (reduceMotion) {
        setShown(LINES);
        setDone(true);
        return;
      }
      tick();
    }, CHAR_MS);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-44 space-y-1 text-sm leading-6 text-emerald-400/90 sm:text-base">
      {shown.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {!done && (
        <p>
          {current}
          <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-emerald-400 align-middle" />
        </p>
      )}
    </div>
  );
}
