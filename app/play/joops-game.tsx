"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const DOODLE_FONT = '"Gaegu", "Comic Sans MS", "Chalkboard SE", cursive';
const BG = "#141838";
const BEST_KEY = "sjs-best";

type Phase = "title" | "playing" | "over";
type JunkKind = "satellite" | "bolt" | "can" | "spring" | "star" | "hazard";
type Pt = [number, number];

type Junk = {
  kind: JunkKind;
  x0: number;
  x: number;
  y: number;
  vy: number;
  swayAmp: number;
  swayT: number;
  swaySpeed: number;
  rot: number;
  vrot: number;
  size: number;
  seed: number;
  eatT: number; // -1 = free-floating, 0..1 = being swallowed
};

type Popup = { x: number; y: number; text: string; age: number; life: number; color: string; size: number; seed: number };
type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number; color: string; r: number };
type BgStar = { x: number; y: number; r: number; cross: boolean; seed: number; alpha: number };

const COLORS: Record<JunkKind, string> = {
  satellite: "#8ecbff",
  bolt: "#cfd8e6",
  can: "#f9a8d4",
  spring: "#c4b5fd",
  star: "#ffd166",
  hazard: "#ff8080",
};

const EAT_WORDS = ["냠!", "쩝쩝", "꿀꺽!", "냠냠", "암냠!"];
const OUCH_WORDS = ["아야!", "으악!", "따가워!"];

export default function JoopsGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ui, setUi] = useState({ phase: "title" as Phase, score: 0, lives: 3, best: 0, eaten: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let wobPh = 0;

    let phase: Phase = "title";
    let score = 0;
    let lives = 3;
    let eaten = 0;
    let best = 0;
    let overAt = 0;
    let shake = 0;
    let spawnIn = 0.4;
    try {
      best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {}

    const player = {
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      r: 24,
      mouth: 0,
      blink: 2.5,
      blinkT: 0,
      invul: 0,
      look: { x: 0, y: 1 },
    };
    let junks: Junk[] = [];
    let popups: Popup[] = [];
    let sparks: Spark[] = [];
    let bgStars: BgStar[] = [];

    const pushUi = () => setUi({ phase, score, lives, best, eaten });

    // ---------- sound (tiny synth blips) ----------
    let ac: AudioContext | null = null;
    const ensureAudio = () => {
      try {
        if (!ac) ac = new AudioContext();
        if (ac.state === "suspended") void ac.resume();
      } catch {}
    };
    const blip = (f0: number, f1: number, dur: number, type: OscillatorType = "triangle", vol = 0.1, delay = 0) => {
      if (!ac || ac.state !== "running") return;
      const t0 = ac.currentTime + delay;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(ac.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    };
    const sfx = {
      eat: () => blip(430, 900, 0.09, "triangle", 0.12),
      star: () => {
        blip(660, 660, 0.08, "sine");
        blip(880, 880, 0.08, "sine", 0.1, 0.08);
        blip(1320, 1320, 0.14, "sine", 0.1, 0.16);
      },
      hit: () => blip(220, 65, 0.28, "sawtooth", 0.12),
      over: () => {
        blip(392, 392, 0.16, "triangle");
        blip(330, 330, 0.16, "triangle", 0.1, 0.18);
        blip(262, 130, 0.5, "triangle", 0.1, 0.36);
      },
    };
    const buzz = (ms: number) => {
      try {
        navigator.vibrate?.(ms);
      } catch {}
    };

    // ---------- hand-drawn line helpers ----------
    // Deterministic jitter; wobPh only changes ~7x/sec so lines "boil" like a doodle animation.
    const wob = (seed: number, i: number, ph: number) => {
      const v = Math.sin(seed * 127.1 + i * 311.7 + ph * 74.7) * 43758.5453;
      return (v - Math.floor(v)) * 2 - 1;
    };

    const wobblyPath = (pts: Pt[], seed: number, amp: number, close: boolean) => {
      const out: Pt[] = [];
      const n = pts.length;
      const segs = close ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % n];
        for (let s = 0; s < 2; s++) {
          const f = s / 2;
          const k = i * 2 + s;
          out.push([
            x1 + (x2 - x1) * f + wob(seed, k, wobPh) * amp,
            y1 + (y2 - y1) * f + wob(seed + 50, k, wobPh) * amp,
          ]);
        }
      }
      if (!close) {
        const [lx, ly] = pts[n - 1];
        out.push([lx + wob(seed, segs * 2, wobPh) * amp, ly + wob(seed + 50, segs * 2, wobPh) * amp]);
      }
      ctx.beginPath();
      out.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      if (close) ctx.closePath();
    };

    const wobblyBlob = (x: number, y: number, r: number, seed: number, amp: number) => {
      const n = 12;
      const pts: Pt[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r + wob(seed, i, wobPh) * amp;
        pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
      }
      const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      ctx.beginPath();
      let m = mid(pts[n - 1], pts[0]);
      ctx.moveTo(m[0], m[1]);
      for (let i = 0; i < n; i++) {
        m = mid(pts[i], pts[(i + 1) % n]);
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
      }
      ctx.closePath();
    };

    const wobblyLine = (x1: number, y1: number, x2: number, y2: number, seed: number, amp: number) =>
      wobblyPath([[x1, y1], [x2, y2]], seed, amp, false);

    const rectPts = (x: number, y: number, rw: number, rh: number): Pt[] => [
      [x, y],
      [x + rw, y],
      [x + rw, y + rh],
      [x, y + rh],
    ];

    const ngonPts = (n: number, r: number, rot = 0): Pt[] =>
      Array.from({ length: n }, (_, i) => {
        const a = rot + (i / n) * Math.PI * 2;
        return [Math.cos(a) * r, Math.sin(a) * r] as Pt;
      });

    const spikyPts = (n: number, rIn: number, rOut: number): Pt[] =>
      Array.from({ length: n * 2 }, (_, i) => {
        const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
        const r = i % 2 === 0 ? rOut : rIn;
        return [Math.cos(a) * r, Math.sin(a) * r] as Pt;
      });

    const fillStroke = (color: string, fillAlpha = 0.15) => {
      const ga = ctx.globalAlpha;
      ctx.globalAlpha = ga * fillAlpha;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = ga;
      ctx.strokeStyle = color;
      ctx.stroke();
    };

    const strokeOnly = (color: string) => {
      ctx.strokeStyle = color;
      ctx.stroke();
    };

    // ---------- game actions ----------
    const popup = (x: number, y: number, text: string, color: string, size: number) =>
      popups.push({ x, y, text, age: 0, life: 0.85, color, size, seed: Math.random() * 10 });

    const burst = (x: number, y: number, color: string, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 120;
        sparks.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          age: 0,
          life: 0.4 + Math.random() * 0.25,
          color,
          r: 1.5 + Math.random() * 2,
        });
      }
    };

    const spawn = () => {
      const difficulty = Math.min(1, score / 400);
      const roll = Math.random();
      let kind: JunkKind;
      if (roll < 0.07) kind = "star";
      else if (phase === "playing" && roll < 0.17 + difficulty * 0.13) kind = "hazard";
      else kind = (["satellite", "bolt", "can", "spring"] as const)[Math.floor(Math.random() * 4)];
      const size =
        kind === "star" ? 15 : kind === "hazard" ? 16 + Math.random() * 8 : 13 + Math.random() * 6;
      const x0 = 34 + Math.random() * Math.max(40, w - 68);
      junks.push({
        kind,
        x0,
        x: x0,
        y: -60,
        vy: (55 + Math.random() * 45) * (1 + difficulty * 1.1) * (phase === "playing" ? 1 : 0.6),
        swayAmp: 10 + Math.random() * 24,
        swayT: Math.random() * Math.PI * 2,
        swaySpeed: 0.8 + Math.random() * 1.4,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 1.6,
        size,
        seed: Math.random() * 100,
        eatT: -1,
      });
    };

    const swallow = (j: Junk) => {
      if (j.kind === "star") {
        score += 40;
        sfx.star();
        if (lives < 3) {
          lives++;
          popup(player.x, player.y - player.r - 18, "+♥", "#ff8fab", 30);
        } else {
          popup(player.x, player.y - player.r - 18, "+40!", COLORS.star, 27);
        }
      } else {
        score += 10;
        eaten++;
        sfx.eat();
        popup(
          player.x,
          player.y - player.r - 16,
          EAT_WORDS[Math.floor(Math.random() * EAT_WORDS.length)],
          "#ffffff",
          24,
        );
      }
      buzz(12);
      burst(player.x, player.y + player.r * 0.4, COLORS[j.kind], 7);
      player.r = Math.min(38, player.r + 0.45);
      pushUi();
    };

    const gameOver = () => {
      phase = "over";
      overAt = t;
      if (score > best) {
        best = score;
        try {
          localStorage.setItem(BEST_KEY, String(best));
        } catch {}
      }
      sfx.over();
      pushUi();
    };

    const hit = (j: Junk) => {
      lives--;
      player.invul = 1.4;
      shake = 0.35;
      player.r = Math.max(24, player.r - 3);
      sfx.hit();
      buzz(90);
      burst(j.x, j.y, COLORS.hazard, 10);
      popup(
        player.x,
        player.y - player.r - 18,
        OUCH_WORDS[Math.floor(Math.random() * OUCH_WORDS.length)],
        COLORS.hazard,
        26,
      );
      if (lives <= 0) gameOver();
      else pushUi();
    };

    const start = () => {
      phase = "playing";
      score = 0;
      lives = 3;
      eaten = 0;
      player.r = 24;
      player.invul = 0;
      player.mouth = 0;
      player.x = w / 2;
      player.y = h * 0.62;
      player.tx = player.x;
      player.ty = player.y;
      junks = [];
      popups = [];
      sparks = [];
      spawnIn = 0.4;
      shake = 0;
      pushUi();
    };

    // ---------- simulation ----------
    const update = (dt: number) => {
      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawn();
        const base = phase === "playing" ? Math.max(0.42, 1.05 - score / 900) : 1.5;
        spawnIn = base * (0.7 + Math.random() * 0.6);
      }

      if (phase === "playing") {
        const k = Math.min(1, dt * 7);
        player.x += (player.tx - player.x) * k;
        player.y += (player.ty - player.y) * k;
      } else {
        const k = Math.min(1, dt * 2);
        player.x += (w / 2 - player.x) * k;
        player.y += (h * 0.68 + Math.sin(t * 1.8) * 10 - player.y) * k;
      }
      player.invul = Math.max(0, player.invul - dt);

      player.blink -= dt;
      if (player.blink <= 0) {
        player.blink = 2.2 + Math.random() * 2.5;
        player.blinkT = 0.13;
      }
      player.blinkT = Math.max(0, player.blinkT - dt);

      let nearest = Infinity;
      let nearestJunk: Junk | null = null;
      for (const j of junks) {
        if (j.eatT >= 0 || j.kind === "hazard") continue;
        const d = Math.hypot(j.x - player.x, j.y - player.y);
        if (d < nearest) {
          nearest = d;
          nearestJunk = j;
        }
      }
      const wantOpen = phase === "playing" && nearestJunk && nearest < player.r + 120 ? 1 : 0;
      player.mouth += (wantOpen - player.mouth) * Math.min(1, dt * 8);
      if (nearestJunk) {
        const dx = nearestJunk.x - player.x;
        const dy = nearestJunk.y - player.y;
        const dd = Math.hypot(dx, dy) || 1;
        player.look.x += (dx / dd - player.look.x) * Math.min(1, dt * 6);
        player.look.y += (dy / dd - player.look.y) * Math.min(1, dt * 6);
      }

      const mouthX = player.x;
      const mouthY = player.y + player.r * 0.4;

      for (let i = junks.length - 1; i >= 0; i--) {
        const j = junks[i];
        if (j.eatT >= 0) {
          j.eatT += dt / 0.16;
          const k = Math.min(1, dt * 20);
          j.x += (mouthX - j.x) * k;
          j.y += (mouthY - j.y) * k;
          j.rot += j.vrot * 6 * dt;
          if (j.eatT >= 1) {
            junks.splice(i, 1);
            swallow(j);
          }
          continue;
        }
        j.swayT += j.swaySpeed * dt;
        j.x = j.x0 + Math.sin(j.swayT) * j.swayAmp;
        j.y += j.vy * dt;
        j.rot += j.vrot * dt;
        if (j.y > h + 70) {
          junks.splice(i, 1);
          continue;
        }
        if (phase !== "playing") continue;

        const d = Math.hypot(j.x - player.x, j.y - player.y);
        if (j.kind === "hazard") {
          if (player.invul <= 0 && d < player.r + j.size * 0.75) {
            junks.splice(i, 1);
            hit(j);
          }
        } else {
          // gentle magnet so eating feels forgiving on small screens
          if (d < player.r + 70) {
            const pull = Math.min(1, dt * 3);
            j.x0 += (player.x - j.x) * pull;
            j.y += (player.y - j.y) * pull;
          }
          if (d < player.r + j.size * 0.65 + player.mouth * 10) j.eatT = 0;
        }
      }

      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.age += dt;
        p.y -= 34 * dt;
        if (p.age >= p.life) popups.splice(i, 1);
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.age += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.age >= s.life) sparks.splice(i, 1);
      }
      shake = Math.max(0, shake - dt);
    };

    // ---------- drawing ----------
    const drawBackground = () => {
      ctx.fillStyle = BG;
      ctx.fillRect(-12, -12, w + 24, h + 24);

      // faint notebook grid
      ctx.strokeStyle = "rgba(255,255,255,0.045)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = 0; gx <= w; gx += 48) {
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
      }
      for (let gy = 0; gy <= h; gy += 48) {
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
      }
      ctx.stroke();

      ctx.lineWidth = 1.5;
      for (const s of bgStars) {
        ctx.globalAlpha = s.alpha * (0.7 + 0.3 * Math.sin(t * 1.5 + s.seed));
        if (s.cross) {
          const l = s.r * 3;
          ctx.strokeStyle = "#fff7d6";
          ctx.beginPath();
          ctx.moveTo(s.x - l, s.y);
          ctx.lineTo(s.x + l, s.y);
          ctx.moveTo(s.x, s.y - l);
          ctx.lineTo(s.x, s.y + l);
          ctx.stroke();
        } else {
          ctx.fillStyle = "#fff7d6";
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // sleeping doodle moon
      const mx = w * 0.85;
      const my = h * 0.14;
      ctx.lineWidth = 3;
      wobblyBlob(mx, my, 26, 5.5, 1.8);
      fillStroke("#ffe9a8", 0.12);
      ctx.strokeStyle = "#ffe9a8";
      ctx.lineWidth = 2.5;
      for (const dir of [-1, 1] as const) {
        ctx.beginPath();
        ctx.arc(mx + dir * 8, my - 2, 4, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(mx, my + 9, 2.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2);
      ctx.font = `700 15px ${DOODLE_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffe9a8";
      ctx.fillText("z", mx + 26, my - 24);
      ctx.fillText("z", mx + 35, my - 34);
      ctx.globalAlpha = 1;
    };

    const drawJunk = (j: Junk) => {
      ctx.save();
      ctx.translate(j.x, j.y);
      ctx.rotate(j.rot);
      const sc = j.eatT >= 0 ? Math.max(0.05, 1 - j.eatT) : 1;
      ctx.scale(sc, sc);
      const s = j.size;
      const c = COLORS[j.kind];
      ctx.lineWidth = 3;

      switch (j.kind) {
        case "satellite": {
          for (const dir of [-1, 1] as const) {
            const px = dir === 1 ? s * 0.85 : -s * 1.95;
            wobblyPath(rectPts(px, -s * 0.38, s * 1.1, s * 0.76), j.seed + dir, 1.5, true);
            fillStroke("#ffd166", 0.13);
            wobblyLine(px + s * 0.55, -s * 0.38, px + s * 0.55, s * 0.38, j.seed + 3 + dir, 1.1);
            strokeOnly("#ffd166");
          }
          wobblyPath(rectPts(-s * 0.75, -s * 0.55, s * 1.5, s * 1.1), j.seed + 7, 1.6, true);
          fillStroke(c);
          wobblyLine(0, -s * 0.55, 0, -s * 1.05, j.seed + 8, 1);
          strokeOnly(c);
          ctx.beginPath();
          ctx.arc(0, -s * 1.15, 2.6, 0, Math.PI * 2);
          strokeOnly(c);
          ctx.fillStyle = "#eaf6ff";
          ctx.beginPath();
          ctx.arc(-s * 0.24, -s * 0.12, 1.8, 0, Math.PI * 2);
          ctx.arc(s * 0.24, -s * 0.12, 1.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, s * 0.08, s * 0.2, Math.PI * 0.2, Math.PI * 0.8);
          ctx.strokeStyle = "#eaf6ff";
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        }
        case "bolt": {
          wobblyPath(ngonPts(6, s, j.seed), j.seed, 1.6, true);
          fillStroke(c);
          wobblyBlob(0, 0, s * 0.42, j.seed + 9, 1.1);
          strokeOnly(c);
          break;
        }
        case "can": {
          wobblyPath(rectPts(-s * 0.55, -s * 0.8, s * 1.1, s * 1.6), j.seed, 1.6, true);
          fillStroke(c);
          wobblyLine(-s * 0.55, -s * 0.42, s * 0.55, -s * 0.42, j.seed + 2, 1.1);
          strokeOnly(c);
          wobblyLine(-s * 0.55, s * 0.4, s * 0.55, s * 0.4, j.seed + 3, 1.1);
          strokeOnly(c);
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#fff0f6";
          for (const dir of [-1, 1] as const) {
            const ex = dir * s * 0.22;
            ctx.beginPath();
            ctx.moveTo(ex - 2.4, -s * 0.1 - 2.4);
            ctx.lineTo(ex + 2.4, -s * 0.1 + 2.4);
            ctx.moveTo(ex + 2.4, -s * 0.1 - 2.4);
            ctx.lineTo(ex - 2.4, -s * 0.1 + 2.4);
            ctx.stroke();
          }
          wobblyLine(-s * 0.14, s * 0.18, s * 0.14, s * 0.18, j.seed + 6, 0.7);
          ctx.stroke();
          break;
        }
        case "spring": {
          const pts: Pt[] = [[-s * 0.3, -s * 0.85]];
          for (let i = 0; i < 6; i++) {
            pts.push([(i % 2 === 0 ? 1 : -1) * s * 0.45, -s * 0.65 + (i / 5) * s * 1.3]);
          }
          pts.push([s * 0.3, s * 0.85]);
          wobblyPath(pts, j.seed, 1.3, false);
          strokeOnly(c);
          break;
        }
        case "star": {
          const pulse = 1 + Math.sin(t * 5 + j.seed) * 0.08;
          wobblyPath(spikyPts(5, s * 0.45 * pulse, s * pulse), j.seed, 1.2, true);
          fillStroke(c, 0.25);
          ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 7 + j.seed);
          ctx.lineWidth = 2;
          ctx.strokeStyle = c;
          ctx.beginPath();
          ctx.moveTo(s * 1.05, -s * 0.95);
          ctx.lineTo(s * 1.45, -s * 0.95);
          ctx.moveTo(s * 1.25, -s * 1.15);
          ctx.lineTo(s * 1.25, -s * 0.75);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case "hazard": {
          const rOut = s * (1.5 + Math.sin(t * 6 + j.seed) * 0.12);
          wobblyPath(spikyPts(9, s, rOut), j.seed, 1.4, true);
          fillStroke(c, 0.18);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = c;
          for (const dir of [-1, 1] as const) {
            ctx.beginPath();
            ctx.moveTo(dir * s * 0.45, -s * 0.32);
            ctx.lineTo(dir * s * 0.12, -s * 0.14);
            ctx.stroke();
          }
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(-s * 0.24, s * 0.02, 2, 0, Math.PI * 2);
          ctx.arc(s * 0.24, s * 0.02, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, s * 0.5, s * 0.24, Math.PI * 1.2, Math.PI * 1.8);
          ctx.stroke();
          break;
        }
      }
      ctx.restore();
    };

    const drawPlayer = () => {
      const { x, y, r } = player;
      ctx.save();
      if (player.invul > 0 && Math.floor(t * 16) % 2 === 0) ctx.globalAlpha = 0.4;
      ctx.lineWidth = 4;

      // antenna
      const bobY = Math.sin(t * 3 + 1) * 2.5;
      const ax = x + Math.sin(t * 2) * 3;
      wobblyLine(x, y - r + 4, ax, y - r - 15 + bobY, 31, 1.3);
      strokeOnly("#7ee8b2");
      ctx.beginPath();
      ctx.arc(ax, y - r - 18 + bobY, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = "#ffd166";
      ctx.fill();
      ctx.lineWidth = 2.5;
      strokeOnly("#7ee8b2");
      ctx.lineWidth = 4;

      // body
      wobblyBlob(x, y, r, 7.7, r * 0.06);
      fillStroke("#7ee8b2", 0.34);

      // eyes
      const er = r * 0.2;
      for (const dir of [-1, 1] as const) {
        const cx = x + dir * r * 0.34;
        const cy = y - r * 0.3;
        if (player.blinkT > 0) {
          ctx.beginPath();
          ctx.arc(cx, cy + 1, er * 0.7, Math.PI * 0.15, Math.PI * 0.85);
          ctx.strokeStyle = "#0f2e22";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.lineWidth = 4;
        } else {
          ctx.beginPath();
          ctx.ellipse(cx, cy, er * 0.78, er, 0, 0, Math.PI * 2);
          ctx.fillStyle = "#f4fff9";
          ctx.fill();
          ctx.strokeStyle = "#0f2e22";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(cx + player.look.x * er * 0.32, cy + player.look.y * er * 0.35, er * 0.42, 0, Math.PI * 2);
          ctx.fillStyle = "#0f2e22";
          ctx.fill();
        }
      }

      // blush
      const ga = ctx.globalAlpha;
      ctx.globalAlpha = ga * 0.4;
      ctx.fillStyle = "#ff8fab";
      for (const dir of [-1, 1] as const) {
        ctx.beginPath();
        ctx.ellipse(x + dir * r * 0.62, y - r * 0.02, r * 0.15, r * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = ga;

      // mouth
      const m = player.mouth;
      const my = y + r * 0.42;
      if (m > 0.15) {
        const mrx = r * (0.2 + 0.35 * m);
        const mry = r * (0.1 + 0.42 * m);
        ctx.save();
        ctx.translate(x, my);
        ctx.scale(1, mry / mrx);
        wobblyBlob(0, 0, mrx, 3.3, 1.4);
        ctx.restore();
        ctx.fillStyle = "#0f2e22";
        ctx.fill();
        ctx.lineWidth = 3;
        strokeOnly("#0f2e22");
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(x, my + mry * 0.4, mrx * 0.5, mry * 0.32, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#ff8fab";
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(x, my - r * 0.08, r * 0.24, Math.PI * 0.2, Math.PI * 0.8);
        ctx.strokeStyle = "#0f2e22";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.restore();
    };

    const draw = () => {
      wobPh = Math.floor(t * 7);
      ctx.save();
      if (shake > 0) {
        const a = (shake / 0.35) * 7;
        ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      }
      drawBackground();
      for (const j of junks) drawJunk(j);
      drawPlayer();

      for (const s of sparks) {
        ctx.globalAlpha = Math.max(0, 1 - s.age / s.life);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const p of popups) {
        const f = p.age / p.life;
        ctx.save();
        ctx.globalAlpha = f < 0.7 ? 1 : 1 - (f - 0.7) / 0.3;
        ctx.translate(p.x, p.y);
        ctx.rotate(wob(p.seed, 1, wobPh) * 0.1);
        ctx.font = `700 ${p.size}px ${DOODLE_FONT}`;
        ctx.lineWidth = 5;
        ctx.strokeStyle = BG;
        ctx.strokeText(p.text, 0, 0);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };

    // ---------- input & sizing ----------
    const setTarget = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top - (e.pointerType === "touch" ? 72 : 0);
      player.tx = Math.min(Math.max(px, player.r + 6), w - player.r - 6);
      player.ty = Math.min(Math.max(py, player.r + 64), h - player.r - 10);
    };
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      ensureAudio();
      if (phase === "title") start();
      else if (phase === "over") {
        if (t - overAt < 0.6) return;
        start();
      }
      setTarget(e);
    };
    const onMove = (e: PointerEvent) => setTarget(e);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      bgStars = Array.from({ length: 46 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.6 + 0.6,
        cross: Math.random() < 0.28,
        seed: Math.random() * 10,
        alpha: 0.25 + Math.random() * 0.45,
      }));
      if (!player.x) {
        player.x = w / 2;
        player.y = h * 0.68;
        player.tx = player.x;
        player.ty = player.y;
      }
    };

    resize();
    pushUi();
    window.addEventListener("resize", resize);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      if (ac) void ac.close().catch(() => {});
    };
  }, []);

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden bg-[#141838] text-zinc-100"
      style={{ fontFamily: DOODLE_FONT, WebkitTouchCallout: "none" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&display=swap"
      />

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {ui.phase !== "title" && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-5"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}
        >
          <div className="-rotate-2 text-3xl font-bold leading-none" style={{ textShadow: "0 2px 0 rgba(0,0,0,.4)" }}>
            점수 <span className="text-[#ffd166]">{ui.score}</span>
          </div>
          <div className="rotate-2 text-3xl leading-none" style={{ textShadow: "0 2px 0 rgba(0,0,0,.4)" }}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < ui.lives ? "text-[#ff8fab]" : "text-white/20"}>
                ♥
              </span>
            ))}
          </div>
        </div>
      )}

      {ui.phase === "title" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 pb-[26vh] text-center">
          <p className="-rotate-3 text-xl text-[#8ecbff]">SPACE JOOPS · 두들 에디션</p>
          <h1
            className="-rotate-2 text-6xl font-bold leading-none text-[#7ee8b2]"
            style={{ textShadow: "0 4px 0 rgba(0,0,0,.45)" }}
          >
            우주 냠냠!
          </h1>
          <p className="mt-2 text-xl leading-8 text-zinc-200">
            손가락으로 슥슥 움직여서
            <br />
            우주쓰레기를 몽땅 먹어치워요 🛰️
            <br />
            <span className="text-[#ff8080]">뾰족뾰족한 애들</span>은 먹으면 배탈나요!
          </p>
          {ui.best > 0 && <p className="rotate-1 text-lg text-[#ffd166]">최고 기록 {ui.best}점</p>}
          <p className="mt-3 animate-bounce text-2xl font-bold text-[#ffd166]">👆 탭해서 시작!</p>
          <Link
            href="/"
            className="pointer-events-auto mt-5 text-base text-zinc-400 underline underline-offset-4"
          >
            ← 기지로 돌아가기
          </Link>
        </div>
      )}

      {ui.phase === "over" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 px-8 text-center">
          <h2
            className="-rotate-2 text-5xl font-bold text-[#ff8fab]"
            style={{ textShadow: "0 3px 0 rgba(0,0,0,.45)" }}
          >
            아이고 배야…
          </h2>
          <p className="mt-1 text-xl text-zinc-200">
            그래도 우주쓰레기 <span className="font-bold text-[#7ee8b2]">{ui.eaten}개</span>를 꿀꺽!
          </p>
          <p className="mt-3 rotate-1 text-4xl font-bold text-[#ffd166]">점수 {ui.score}</p>
          <p className="text-lg text-zinc-300">
            최고 기록 {ui.best}
            {ui.score >= ui.best && ui.score > 0 ? " · 신기록! 🎉" : ""}
          </p>
          <p className="mt-4 animate-bounce text-2xl font-bold text-[#7ee8b2]">👆 탭해서 다시 도전!</p>
          <Link
            href="/"
            className="pointer-events-auto mt-5 text-base text-zinc-400 underline underline-offset-4"
          >
            ← 기지로 돌아가기
          </Link>
        </div>
      )}
    </div>
  );
}
