import type { Debrief, SessionRecord } from "@/lib/contract";

export function Verdict({ debrief, history, sessionNumber }: { debrief: Debrief; history: SessionRecord["history"]; sessionNumber: number }) {
  const delta = debrief.previous_overall == null ? null : debrief.overall - debrief.previous_overall;
  const trail = [...history.map((h) => h.overall), debrief.overall];

  return (
    <section className="flex flex-col justify-between gap-8 rounded-2xl bg-ink p-6 text-surface sm:p-8">
      <div className="flex flex-col gap-4">
        <p className="font-mono text-xs uppercase tracking-widest text-axis">Debrief · Session {sessionNumber}</p>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">{debrief.headline}</h1>
      </div>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <p className="flex items-baseline gap-1">
          <span className="font-display text-8xl leading-none">{debrief.overall}</span>
          <span className="font-mono text-sm text-axis">/ 100</span>
        </p>
        <div className="flex flex-col gap-1 pb-2 font-mono text-sm">
          {delta != null && (
            <span className={delta >= 0 ? "text-good" : "text-[#e66767]"}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} since last session
            </span>
          )}
          {trail.length > 1 && <span className="text-axis">{trail.join(" → ")}</span>}
        </div>
      </div>
    </section>
  );
}
