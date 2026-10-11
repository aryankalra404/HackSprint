import Image from "next/image";
import type { Debrief, SessionRecord } from "@/lib/contract";

export function Verdict({ debrief, history, sessionNumber }: { debrief: Debrief; history: SessionRecord["history"]; sessionNumber: number }) {
  const scored = debrief.overall != null;
  const delta = debrief.previous_overall == null || debrief.overall == null ? null : debrief.overall - debrief.previous_overall;
  const trail = [...history.map((h) => h.overall), ...(debrief.overall != null ? [debrief.overall] : [])];

  return (
    <section className="relative isolate flex flex-col justify-between gap-8 overflow-hidden rounded-2xl bg-ink p-6 text-surface sm:p-8">
      <Image src="/vr/room_wide.jpg" alt="" fill sizes="(min-width: 1024px) 800px, 100vw" className="-z-10 object-cover object-[center_70%] opacity-45" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-ink via-ink/40 to-ink" />
      <div className="flex flex-col gap-4">
        <p className="text-sm text-axis">Session {sessionNumber} debrief</p>
        <h1 className={`font-display leading-tight ${debrief.headline.length > 110 ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"}`}>{debrief.headline}</h1>
      </div>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        {scored ? (
          <p className="flex items-baseline gap-1">
            <span className="font-display text-8xl leading-none">{debrief.overall}</span>
            <span className="text-sm text-axis">/ 100</span>
          </p>
        ) : (
          // Too little pitch to judge (0.26): no number at all, rather than a score that means nothing
          <p className="flex flex-col gap-1">
            <span className="font-display text-5xl leading-none">Not scored</span>
            <span className="text-sm text-axis">
              {debrief.pitch ? `${Math.round(debrief.pitch.seconds)} s and ${debrief.pitch.words} words of pitch. ` : ""}The talk tracks and weak spots below still apply.
            </span>
          </p>
        )}
        <div className="flex flex-col gap-1 pb-2 text-sm">
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
