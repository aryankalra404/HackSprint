"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DebriefedSession } from "@/lib/contract";
import { exchanges, freezes, slideSegments } from "@/lib/timeline";
import { Verdict } from "./Verdict";
import { Stakeholders } from "./Stakeholders";
import { Timeline, type Selection } from "./Timeline";
import { Metrics } from "./Metrics";
import { GazeMap } from "./GazeMap";
import { Actions } from "./Actions";
import { Transcript } from "./Transcript";

export function DebriefView({ session }: { session: DebriefedSession }) {
  const { bundle, telemetry, debrief, history } = session;

  const data = useMemo(() => {
    const segments = slideSegments(telemetry, bundle.slides);
    return { segments, exchanges: exchanges(telemetry), freezes: freezes(telemetry, segments) };
  }, [telemetry, bundle.slides]);

  const [selection, setSelection] = useState<Selection | null>(() => {
    const first = data.exchanges[0];
    return first ? { t: first.t, momentId: first.id } : null;
  });

  // Evidence anywhere on the page jumps the timeline to that moment.
  function selectAt(t: number, note?: string) {
    const moments = [
      ...data.exchanges.flatMap((x) => [{ id: x.id, t: x.t }, ...(x.answer ? [{ id: x.id, t: x.answer.t }] : [])]),
      ...data.freezes.map((f) => ({ id: f.id, t: f.t })),
    ];
    const nearest = moments.reduce<{ id: string; t: number } | null>(
      (best, m) => (Math.abs(m.t - t) < 3 && (!best || Math.abs(m.t - t) < Math.abs(best.t - t)) ? m : best),
      null,
    );
    setSelection({ t, momentId: nearest?.id ?? null, note });
    document.getElementById("timeline")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const sessionNumber = history.length + 1;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <Link href="/" className="font-display text-2xl">DryRun</Link>
        <p className="text-xs text-ink-2">
          Pitch to {bundle.prospect.company}, session {sessionNumber} {telemetry.client === "vr" ? "in the VR boardroom" : "in the browser"}
        </p>
        <nav className="flex gap-2 print:hidden">
          <Link href={`/s/${bundle.session_id}`} className="rounded-full border border-line bg-surface px-4 py-2 text-sm hover:border-ink">
            Dashboard
          </Link>
          <button type="button" onClick={() => window.print()} className="rounded-full bg-ink px-4 py-2 text-sm text-surface">
            Save as PDF
          </button>
        </nav>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Verdict debrief={debrief} history={history} sessionNumber={sessionNumber} />
        <Stakeholders bundle={bundle} stakeholders={debrief.stakeholders} onSelect={selectAt} />
      </div>

      <Metrics metrics={debrief.metrics} onSelect={selectAt} />

      <Timeline
        bundle={bundle}
        duration={telemetry.duration_s}
        segments={data.segments}
        exchanges={data.exchanges}
        freezes={data.freezes}
        selection={selection}
        onSelect={setSelection}
      />

      {debrief.slides?.length > 0 && <Transcript slides={debrief.slides} bundle={bundle} />}

      <div className={`grid items-stretch gap-6 ${telemetry.gaze_dwell_s ? "lg:grid-cols-2" : ""}`}>
        {telemetry.gaze_dwell_s && <GazeMap dwell={telemetry.gaze_dwell_s} personas={bundle.personas} />}
        <Actions debrief={debrief} bundle={bundle} wide={!telemetry.gaze_dwell_s} />
      </div>
    </div>
  );
}
