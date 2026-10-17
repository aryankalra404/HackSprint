"use client";

import { useEffect, useRef, useState } from "react";
import { btn } from "../ui";

const LIMIT_CM = 50;
// At most one save in flight, and this long between saves while dragging; the last position is always saved
const GAP_MS = 100;

type Field = "height_offset" | "side_offset";

function cmLabel(cm: number): string {
  return cm === 0 ? "0 cm" : `${cm > 0 ? "+" : "−"}${Math.abs(cm)} cm`;
}

function sideLabel(cm: number): string {
  return cm === 0 ? "Centre" : `${Math.abs(cm)} cm ${cm > 0 ? "right" : "left"}`;
}

// One offset in the room, saved as it's dragged
function useOffset(field: Field, initial: number) {
  const [cm, setCm] = useState(Math.round(initial * 100));
  const [failed, setFailed] = useState(false);
  const sent = useRef(Math.round(initial * 100));
  const wanted = useRef(Math.round(initial * 100));
  const busy = useRef(false);

  async function flush() {
    if (busy.current || wanted.current === sent.current) return;
    busy.current = true;
    const value = wanted.current;
    try {
      const res = await fetch("/api/room/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value / 100 }) });
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

  return { cm, failed, change };
}

// Moves the presenter in the headset without standing up (contract: the room's `height_offset` and `side_offset`):
// the eyes up or down, for when its floor is off, and the seat left or right, to line up while sitting.
// Two bars in a small pop-over: drag them, or use the arrow keys. The headset eases to each new position as it arrives.
export function PositionControl({ height, side }: { height: number; side: number }) {
  const h = useOffset("height_offset", height);
  const s = useOffset("side_offset", side);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

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

  const moved = h.cm !== 0 || s.cm !== 0;

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
          <path d="M6 1v10M1 6h10M4.5 2.5 6 1l1.5 1.5M4.5 9.5 6 11l1.5-1.5M2.5 4.5 1 6l1.5 1.5M9.5 4.5 11 6 9.5 7.5" />
        </svg>
        Position in VR
        {moved && <span className="tabular-nums text-ink-2">{[h.cm !== 0 && cmLabel(h.cm), s.cm !== 0 && sideLabel(s.cm)].filter(Boolean).join(", ")}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Position in VR" className="absolute right-0 top-full z-30 mt-2 flex w-72 gap-4 rounded-2xl border border-line bg-surface p-4 shadow-lg">
          <div className="flex flex-col items-center gap-1 text-xs text-muted">
            <span>Higher</span>
            <input
              type="range"
              min={-LIMIT_CM}
              max={LIMIT_CM}
              step={1}
              value={h.cm}
              onChange={(e) => h.change(Number(e.target.value))}
              aria-label="Eye height in the headset"
              aria-valuetext={cmLabel(h.cm)}
              className="h-44 w-6 cursor-ns-resize accent-ink"
              style={{ writingMode: "vertical-lr", direction: "rtl" }}
            />
            <span>Lower</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
            <div>
              <p className="text-xs text-muted">Height</p>
              <p className="font-display text-2xl tabular-nums">{cmLabel(h.cm)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Left or right</p>
              <p className="font-display text-2xl tabular-nums">{sideLabel(s.cm)}</p>
              <input
                type="range"
                min={-LIMIT_CM}
                max={LIMIT_CM}
                step={1}
                value={s.cm}
                onChange={(e) => s.change(Number(e.target.value))}
                aria-label="Left or right in the headset"
                aria-valuetext={sideLabel(s.cm)}
                className="mt-1 h-6 w-full cursor-ew-resize accent-ink"
              />
              <div className="flex justify-between text-xs text-muted">
                <span>Left</span>
                <span>Right</span>
              </div>
            </div>
            <p className="text-xs text-ink-2">Drag the bars to line yourself up with the seat without standing up.</p>
            {(h.failed || s.failed) && <p className="text-xs text-bad-ink">Couldn&apos;t reach the laptop.</p>}
            <button
              type="button"
              onClick={() => {
                h.change(0);
                s.change(0);
              }}
              disabled={!moved}
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
