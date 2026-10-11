"use client";

import { useEffect, useRef, useState } from "react";
import type { PitchSuggestion } from "@/lib/contract";

const MIN = 1;
const MAX = 60;

// How long the presenter means to pitch (contract: the room's `pitch_minutes`, sent to /prep). It starts at n8n's suggestion
// for this meeting; n8n plans the slide times and the questions around it.
export function PitchLength({ initial, suggestion }: { initial: number; suggestion?: PitchSuggestion }) {
  const [minutes, setMinutes] = useState(initial);
  const [text, setText] = useState(String(initial));
  const [failed, setFailed] = useState(false);
  const saved = useRef(initial);

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
    setText(String(m));
  }

  const step = "flex size-8 items-center justify-center rounded-full border border-line text-sm hover:border-ink disabled:opacity-40";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="pitch-minutes" className="text-sm font-medium">
          Pitch length
        </label>
        <div className="flex items-center gap-1.5">
          <button type="button" className={step} onClick={() => set(minutes - 1)} disabled={minutes <= MIN} aria-label="One minute shorter">
            −
          </button>
          <input
            id="pitch-minutes"
            inputMode="numeric"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= MIN && n <= MAX) setMinutes(n);
            }}
            onBlur={() => set(Number(text) || minutes)}
            className="w-10 rounded-md border border-line bg-surface py-1 text-center font-display text-base"
          />
          <span className="text-sm text-ink-2">min</span>
          <button type="button" className={step} onClick={() => set(minutes + 1)} disabled={minutes >= MAX} aria-label="One minute longer">
            +
          </button>
        </div>
      </div>
      {failed ? (
        <p role="alert" className="text-xs text-bad-ink">Couldn&apos;t save the pitch length.</p>
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
          )}
        </p>
      ) : (
        <p className="text-xs text-muted">Questions come on top. n8n plans the slide times and when the panel asks around it.</p>
      )}
    </div>
  );
}
