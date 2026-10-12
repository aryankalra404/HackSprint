"use client";

import { useEffect, useRef, useState } from "react";

// The person as a halftone print: their VR portrait sampled on a grid, one dot per cell sized by how dark it is, in their seat colour.
// How many dots are inked follows how much is known (`fill`, from counts); the rest stay a faint sketch. Cells ink in a fixed order,
// so the same twin always draws the same way, and new dots fill in when something is learned. No portrait: a plain silhouette.
const GRID = 56;

export function Halftone({ portrait, color, fill, size = 240, label }: { portrait?: string; color: string; fill: number; size?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [dark, setDark] = useState<Float32Array | null>(null);
  const shown = useTween(fill);

  // Sample the portrait (or the silhouette) once
  useEffect(() => {
    let cancelled = false;
    const off = document.createElement("canvas");
    off.width = off.height = GRID;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const sample = () => {
      const px = ctx.getImageData(0, 0, GRID, GRID).data;
      const d = new Float32Array(GRID * GRID);
      for (let i = 0; i < d.length; i++) {
        const lum = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
        d[i] = px[i * 4 + 3] < 10 ? 0 : 1 - lum;
      }
      // Stretch the tones (5th to 97th percentile) and deepen them, so the face reads, not the room behind it
      const sorted = Array.from(d).sort((x, y) => x - y);
      const lo = sorted[Math.floor(sorted.length * 0.05)];
      const hi = sorted[Math.floor(sorted.length * 0.97)] || 1;
      for (let i = 0; i < d.length; i++) d[i] = Math.pow(Math.max(0, Math.min(1, (d[i] - lo) / Math.max(0.05, hi - lo))), 1.6);
      if (!cancelled) setDark(d);
    };
    if (portrait) {
      const img = new Image();
      img.onload = () => {
        // Centre-crop to the face
        const s = Math.min(img.width, img.height) * 0.78;
        ctx.drawImage(img, (img.width - s) / 2, Math.max(0, (img.height - s) / 2 - img.height * 0.06), s, s, 0, 0, GRID, GRID);
        sample();
      };
      img.onerror = () => silhouette(ctx, sample);
      img.src = portrait;
    } else silhouette(ctx, sample);
    return () => {
      cancelled = true;
    };
  }, [portrait]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !dark) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.height = Math.round(size * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const cell = size / GRID;
    const inked = Math.round(ORDER.length * Math.max(0, Math.min(1, shown)));
    const rank = RANK;
    for (let i = 0; i < dark.length; i++) {
      const x = i % GRID;
      const y = Math.floor(i / GRID);
      // Round print: nothing outside the circle
      const dx = x - GRID / 2 + 0.5;
      const dy = y - GRID / 2 + 0.5;
      if (dx * dx + dy * dy > (GRID / 2) * (GRID / 2)) continue;
      const r = (cell / 2) * Math.sqrt(dark[i]) * 1.05;
      if (r < 0.35) continue;
      ctx.beginPath();
      ctx.arc(x * cell + cell / 2, y * cell + cell / 2, r, 0, Math.PI * 2);
      if (rank[i] < inked) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.95;
      } else {
        ctx.fillStyle = "#c3c2b7";
        ctx.globalAlpha = 0.28;
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [dark, shown, color, size]);

  return <canvas ref={ref} role="img" aria-label={label} style={{ width: size, height: size }} className="block rounded-full" />;
}

// A fixed, scattered order for inking cells (the same for every twin), so the portrait fills in evenly rather than top to bottom
const ORDER = Array.from({ length: GRID * GRID }, (_, i) => i).sort((a, b) => hash(a) - hash(b));
const RANK = (() => {
  const r = new Int32Array(GRID * GRID);
  ORDER.forEach((cell, i) => (r[cell] = i));
  return r;
})();
function hash(n: number) {
  let x = (n + 1) * 2654435761;
  x ^= x >>> 13;
  x = Math.imul(x, 1274126177);
  return (x ^ (x >>> 16)) >>> 0;
}

function silhouette(ctx: CanvasRenderingContext2D, done: () => void) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, GRID, GRID);
  ctx.fillStyle = "#555";
  ctx.beginPath();
  ctx.arc(GRID / 2, GRID * 0.38, GRID * 0.19, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(GRID / 2, GRID * 0.98, GRID * 0.36, GRID * 0.36, 0, Math.PI, 0);
  ctx.fill();
  done();
}

// Dots fill in over about 0.8 s when something is learned; at once with reduced motion
function useTween(target: number) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    // With reduced motion the dots are all there on the first frame
    const ms = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 800;
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const k = ms ? Math.min(1, (now - start) / ms) : 1;
      const v = a + (target - a) * (1 - Math.pow(1 - k, 3));
      from.current = v;
      setValue(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}
