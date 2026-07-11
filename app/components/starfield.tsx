"use client";

import { useEffect, useRef } from "react";

type Star = { x: number; y: number; z: number; r: number };
type Junk = { x: number; y: number; vx: number; vy: number; size: number; spin: number; angle: number };

const STAR_COUNT = 220;
const JUNK_COUNT = 14;

export default function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let junk: Junk[] = [];

    const seed = (w: number, h: number) => {
      stars = Array.from({ length: STAR_COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random(),
        r: Math.random() * 1.1 + 0.2,
      }));
      junk = Array.from({ length: JUNK_COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        size: Math.random() * 5 + 2,
        spin: (Math.random() - 0.5) * 0.01,
        angle: Math.random() * Math.PI,
      }));
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed(width, height);
    };

    resize();
    window.addEventListener("resize", resize);

    let frame = 0;
    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      for (const s of stars) {
        // Deeper stars twinkle less — cheap parallax cue.
        const twinkle = reduceMotion ? 0 : Math.sin(t * 0.03 + s.x) * 0.15 * (1 - s.z);
        ctx.globalAlpha = Math.min(1, Math.max(0.1, 0.25 + s.z * 0.6 + twinkle));
        ctx.fillStyle = s.z > 0.85 ? "#a5f3fc" : "#e5e7eb";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 0.55;
      for (const j of junk) {
        if (!reduceMotion) {
          j.x += j.vx;
          j.y += j.vy;
          j.angle += j.spin;
          if (j.x < -20) j.x = width + 20;
          if (j.x > width + 20) j.x = -20;
          if (j.y < -20) j.y = height + 20;
          if (j.y > height + 20) j.y = -20;
        }
        ctx.save();
        ctx.translate(j.x, j.y);
        ctx.rotate(j.angle);
        ctx.strokeStyle = "#4ade80";
        ctx.lineWidth = 1;
        ctx.strokeRect(-j.size / 2, -j.size / 2, j.size, j.size);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      t += 1;
      frame = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
