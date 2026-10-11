"use client";

import { useEffect, useRef, useState } from "react";
import type { PitchSuggestion } from "@/lib/contract";

const MIN = 1;
const MAX = 60;

// How long the presenter means to pitch (contract: the room's `pitch_minutes`, sent to /prep), or no limit (0.25). It starts at n8n's
// suggestion for this meeting; n8n plans the slide times, the questions and how the chair keeps time around it. With no limit, n8n
// paces the slides at a natural speed and nobody keeps time.
export function PitchLength({ initial, suggestion }: { initial: number | null; suggestion?: PitchSuggestion }) {
  // null: no limit
  const [minutes, setMinutes] = useState<number | null>(initial);
  // The last length chosen, to go back to when the limit is switched on again
  const [last, setLast] = useState(initial ?? suggestion?.minutes ?? 5);
  const [text, setText] = useState(String(initial ?? last));
  const [failed, setFailed] = useState(false);
  const saved = useRef<number | null>(initial);

  // Saves a moment after the last change
  useEffect(() => {
    if (minutes === saved.current) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/room/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pitch_minutes: minutes }) });
        setFailed(!res.ok);
        if (res.ok) saved.current = minutes;
      } catch {
        setFailed(true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [minutes]);

  function set(next: number) {
    const m = Math.max(MIN, Math.min(MAX, Math.round(next)));
    setMinutes(m);
    setLast(m);
    setText(String(m));
  }

  const limited = minutes !== null;
  const step = "flex size-8 items-center justify-center rounded-full border border-line text-sm hover:border-ink disabled:opacity-40";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="pitch-minutes" className="text-sm font-medium">
          Pitch length
        </label>
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-2">
            <input type="checkbox" checked={!limited} onChange={(e) => (e.target.checked ? setMinutes(null) : set(last))} className="accent-ink" />
            No time limit
          </label>
          <div className={`flex items-center gap-1.5 ${limited ? "" : "opacity-40"}`}>
            <button type="button" className={step} onClick={() => set(last - 1)} disabled={!limited || last <= MIN} aria-label="One minute shorter">
              −
            </button>
            <input
              id="pitch-minutes"
              inputMode="numeric"
              value={text}
              disabled={!limited}
              onChange={(e) => {
                setText(e.target.value);
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= MIN && n <= MAX) {
                  setMinutes(n);
                  setLast(n);
                }
              }}
              onBlur={() => limited && set(Number(text) || last)}
              className="w-10 rounded-md border border-line bg-surface py-1 text-center font-display text-base"
            />
            <span className="text-sm text-ink-2">min</span>
            <button type="button" className={step} onClick={() => set(last + 1)} disabled={!limited || last >= MAX} aria-label="One minute longer">
              +
            </button>
          </div>
        </div>
      </div>
      {failed ? (
        <p role="alert" className="text-xs text-bad-ink">Couldn&apos;t save the pitch length.</p>
      ) : !limited ? (
        <p className="text-xs text-muted">Take as long as you need: nobody keeps time, and each slide&apos;s time is only a guide.</p>
      ) : suggestion ? (
        <p className="text-xs text-muted">
          {suggestion.minutes === minutes ? "n8n's suggestion: " : `n8n suggests ${suggestion.minutes} min: `}
          {suggestion.why}
          {suggestion.minutes !== minutes && (
            <>
              {" "}
              <button type="button" onClick={() => set(suggestion.minutes)} className="underline underline-offset-2 hover:text-ink">
                Use {suggestion.minutes} min
              </button>
            </>
          )}{" "}
          The chair keeps time as this meeting would.
        </p>
      ) : (
        <p className="text-xs text-muted">The chair keeps time as this meeting would.</p>
      )}
    </div>
  );
}
