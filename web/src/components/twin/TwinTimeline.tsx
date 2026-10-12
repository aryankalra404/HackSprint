"use client";

import type { TwinMeeting, TwinPrediction, TwinSource } from "@/lib/contract";
import { SOURCE_GLYPH, shortDate } from "@/lib/twinView";

// A date ruler under the tree: a tick for every source, a diamond for every real meeting, with how much of it the rehearsal predicted. Dragging the playhead back shows what the twin
// knew on that day (only facts whose source is dated on or before it), so the claim that it gets sharper is shown, not told.
const DAY = 86_400_000;
const toDay = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) / DAY);
const fromDay = (d: number) => new Date(d * DAY + DAY / 2).toISOString().slice(0, 10);

export function TwinTimeline(p: { sources: TwinSource[]; meetings: TwinMeeting[]; predictions: TwinPrediction[]; cutoff: string | null; onCutoff: (d: string | null) => void }) {
  const { sources, meetings, cutoff, onCutoff } = p;
  const dated = sources.filter((s) => s.date && s.status !== "rejected");
  const days = [...dated.map((s) => toDay(s.date)), ...meetings.filter((m) => m.date).map((m) => toDay(m.date))].filter(Number.isFinite);
  const today = toDay(new Date().toISOString());
  if (days.length === 0) return null;
  // From the first sure source or meeting (a suggestion from years ago doesn't stretch the ruler), at most six months back; anything older
  // sits at the left edge
  const sure = [...dated.filter((s) => s.status === "connected").map((s) => toDay(s.date)), ...meetings.map((m) => toDay(m.date))].filter(Number.isFinite);
  const start = Math.max(Math.min(...(sure.length ? sure : days), today) - 3, today - 183);
  const end = Math.max(...days, today) + 3;
  const span = Math.max(1, end - start);
  const at = (d: number) => `${((Math.max(d, start) - start) / span) * 100}%`;
  const value = cutoff ? toDay(cutoff) : end;
  const past = (d: number) => d <= value;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-14">
        {/* The ruler */}
        <div className="absolute top-7 right-0 left-0 h-px bg-ink" />
        <span className="absolute top-9 text-[11px] text-muted" style={{ left: at(start) }}>{shortDate(fromDay(start))}</span>
        <span className="absolute top-9 -translate-x-1/2 text-[11px] text-ink-2" style={{ left: at(today) }}>today</span>
        <span className="absolute top-5 h-4 w-px -translate-x-1/2 bg-ink-2" style={{ left: at(today) }} />
        {dated.map((s) => (
          <span
            key={s.id}
            title={`${s.title}, ${shortDate(s.date)}`}
            className={`absolute top-[22px] -translate-x-1/2 text-[11px] leading-none ${past(toDay(s.date)) ? (s.status === "suggested" ? "text-muted" : "text-ink") : "text-axis"}`}
            style={{ left: at(toDay(s.date)) }}
          >
            {s.type === "email" ? "●" : SOURCE_GLYPH[s.type]}
          </span>
        ))}
        {meetings.map((m) => {
          const hit = p.predictions.find((x) => x.meeting_id === m.id);
          return (
            <span
              key={m.id}
              title={hit ? `${m.title}: your rehearsal predicted ${hit.predicted} of the ${hit.asked} things raised` : m.title}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
              style={{ left: at(toDay(m.date)) }}
            >
              <span className="max-w-40 truncate text-[11px] text-ink-2">
                {hit && <span className="font-medium text-ink tabular-nums">{hit.predicted}/{hit.asked} predicted, </span>}
                {m.title}
              </span>
              <span className={`text-sm leading-none ${past(toDay(m.date)) ? "text-ink" : "text-axis"}`} aria-hidden="true">◆</span>
            </span>
          );
        })}
      </div>
      <label className="flex items-center gap-3 text-xs text-ink-2">
        <span className="shrink-0">What the twin knew on</span>
        <input
          type="range"
          min={start}
          max={end}
          value={value}
          onChange={(e) => {
            const d = Number(e.target.value);
            onCutoff(d >= end ? null : fromDay(d));
          }}
          className="w-full accent-ink"
          aria-valuetext={cutoff ? shortDate(cutoff) : "today"}
        />
        <span className="w-14 shrink-0 text-right font-medium text-ink tabular-nums">{cutoff ? shortDate(cutoff) : "today"}</span>
      </label>
    </div>
  );
}
