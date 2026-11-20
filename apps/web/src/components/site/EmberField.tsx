"use client";
import { useEffect, useRef } from "react";

/**
 * Dot-matrix "gas flame" field: a heat column rising from the bottom, flickering embers and a slow heat haze.
 * Pure canvas, ~6k cells, throttled to ~30 fps, paused when off-screen, static frame for reduced motion.
 */
export function EmberField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let visible = true;
    const CELL = 12;

    type Ember = { x: number; y: number; v: number; life: number; size: number };
    let embers: Ember[] = [];

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      embers = Array.from({ length: Math.round(w / 18) }, () => spawn(true));
    };

    const spawn = (anywhere = false): Ember => ({
      x: w * (0.5 + (Math.random() - 0.5) * (0.35 + Math.random() * 0.4)),
      y: anywhere ? Math.random() * h : h + Math.random() * 40,
      v: 20 + Math.random() * 55,
      life: 0.4 + Math.random() * 0.6,
      size: Math.random() < 0.15 ? 3 : 2,
    });

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const cols = Math.ceil(w / CELL);
      const rows = Math.ceil(h / CELL);
      const cx = w / 2;
      for (let j = 0; j < rows; j++) {
        const y = j * CELL;
        const fromBottom = 1 - y / h; // 0 at bottom … 1 at top
        for (let i = 0; i < cols; i++) {
          const x = i * CELL;
          const dx = (x - cx) / (w * (0.16 + fromBottom * 0.22));
          // rising flame column
          const sway = Math.sin(t * 0.0009 + y * 0.012) * 0.35 + Math.sin(t * 0.0017 + y * 0.03) * 0.12;
          const col = Math.exp(-((dx - sway * fromBottom) ** 2) * 1.6);
          const height = Math.max(0, 1 - fromBottom * 1.25);
          const flicker = 0.62 + 0.38 * Math.sin(t * 0.004 + i * 0.7 + j * 0.45) * Math.sin(t * 0.0023 + i * 0.13);
          let v = col * height * flicker;
          // faint ambient heat haze everywhere
          v += 0.05 * (0.5 + 0.5 * Math.sin(i * 0.35 + t * 0.0006) * Math.cos(j * 0.31 - t * 0.0005));
          if (v < 0.035) continue;
          const a = Math.min(1, v);
          
          const hot = Math.min(1, Math.max(0, (v - 0.55) * 2.2));
          // cool = Meta blue, hot = cyan/white core (a blue gas flame)
          const r = Math.round(8 + hot * 140);
          const g = Math.round(102 + hot * 128);
          const b = 255;
          ctx.fillStyle = `rgba(${r},${g},${b},${a * 0.85})`;
          const s = a > 0.6 ? CELL - 3 : a > 0.25 ? CELL - 5 : CELL - 8;
          ctx.fillRect(x + (CELL - s) / 2, y + (CELL - s) / 2, s, s);
        }
      }
      // embers
      for (const e of embers) {
        const a = Math.max(0, e.life) * (0.5 + 0.5 * Math.sin(t * 0.01 + e.x));
        ctx.fillStyle = `rgba(${90 + Math.round(a * 100)},${190 + Math.round(a * 50)},255,${a})`;
        ctx.fillRect(e.x, e.y, e.size, e.size);
      }
    };

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || t - last < 33) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      for (let k = 0; k < embers.length; k++) {
        const e = embers[k]!;
        e.y -= e.v * dt;
        e.x += Math.sin(t * 0.002 + k) * 8 * dt;
        e.life -= dt * 0.18;
        if (e.y < h * 0.15 || e.life <= 0) embers[k] = spawn();
      }
      draw(t);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([en]) => (visible = !!en?.isIntersecting));
    io.observe(canvas);
    if (reduce) draw(1000);
    else raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none block h-full w-full ${className}`} />;
}
