"use client";

import { useEffect, useRef, useState } from "react";
import { btn } from "../ui";

const LIMIT_CM = 50;
// At most one save in flight, and this long between saves while dragging; the last position is always saved
const GAP_MS = 100;

function label(cm: number): string {
  return cm === 0 ? "0 cm" : `${cm > 0 ? "+" : "−"}${Math.abs(cm)} cm`;
}

// Raises or lowers the presenter's eyes in the headset, for when its floor is off (contract: the room's `height_offset`).
// A vertical bar in a small pop-over: drag it, or use the arrow keys. The headset eases to each new height as it arrives.
export function HeightControl({ initial }: { initial: number }) {
  const [cm, setCm] = useState(Math.round(initial * 100));
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const sent = useRef(Math.round(initial * 100));
  const wanted = useRef(Math.round(initial * 100));
  const busy = useRef(false);

  async function flush() {
    if (busy.current || wanted.current === sent.current) return;
    busy.current = true;
    const value = wanted.current;
    try {
      const res = await fetch("/api/room/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ height_offset: value / 100 }) });
      setFailed(!res.ok);
      if (res.ok) sent.current = value;
    } catch {
      setFailed(true);
    }
    await new Promise((r) => setTimeout(r, GAP_MS));
    busy.current = false;
    if (sent.current === value) void flush();
  }

  function change(next: number) {
    setCm(next);
    wanted.current = next;
    void flush();
  }

  // Closes on a click outside or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 h-8 rounded-full border border-line bg-surface px-3 text-xs hover:border-ink"
      >
        <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 1v10M3.5 3.5 6 1l2.5 2.5M3.5 8.5 6 11l2.5-2.5" />
        </svg>
        Height in VR <span className="tabular-nums text-ink-2">{label(cm)}</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Height in VR" className="absolute right-0 top-full z-30 mt-2 flex w-56 gap-4 rounded-2xl border border-line bg-surface p-4 shadow-lg">
          <div className="flex flex-col items-center gap-1 text-xs text-muted">
            <span>Higher</span>
            <input
              type="range"
              min={-LIMIT_CM}
              max={LIMIT_CM}
              step={1}
              value={cm}
              onChange={(e) => change(Number(e.target.value))}
              aria-label="Eye height in the headset"
              aria-valuetext={label(cm)}
              className="h-44 w-6 cursor-ns-resize accent-ink"
              style={{ writingMode: "vertical-lr", direction: "rtl" }}
            />
            <span>Lower</span>
          </div>
          <div className="flex min-w-0 flex-col justify-between gap-3">
            <div>
              <p className="font-display text-3xl tabular-nums">{label(cm)}</p>
              <p className="mt-1 text-xs text-ink-2">Drag the bar if the room feels too tall or too short in the headset.</p>
            </div>
            {failed && <p className="text-xs text-bad-ink">Couldn&apos;t reach the laptop.</p>}
            <button
              type="button"
              onClick={() => change(0)}
              disabled={cm === 0}
              className={`${btn("secondary", "sm")} self-start`}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
