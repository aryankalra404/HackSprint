"use client";

import { useEffect, useRef, useState } from "react";
import type { PrepStep } from "@/lib/contract";
import { clock } from "@/lib/format";
import { StatusIcon } from "../ui";

interface Props {
  title: string;
  progress: PrepStep[];
  startedAt: string | null;
  runUrl: string | null;
  runId: string | null;
  // Shown on a failed run
  onRetry?: () => void;
  retrying?: boolean;
}

// n8n preparing a meeting, live: a track of its stages, what each found, and how long it took.
// Everything shown comes from the workflow's own progress reports (contract: meeting.progress).
export function PrepProgress({ title, progress, startedAt, runUrl, runId, onRetry, retrying }: Props) {
  const now = useNow(progress.some((s) => s.state === "running"));
  const durations = useStepDurations(progress, startedAt);
  const failed = progress.some((s) => s.state === "error");
  const elapsed = startedAt ? clock(Math.max(0, (now - Date.parse(startedAt)) / 1000)) : "";

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6" aria-live="polite">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl">{failed ? `n8n couldn't finish preparing ${title}` : `n8n is preparing ${title}`}</h2>
        {!failed && elapsed && <span className="font-display text-2xl text-ink-2 tabular-nums">{elapsed}</span>}
      </header>

      <ol className="flex items-start" aria-label="Stages">
        {progress.map((s, i) => (
          <li key={s.id} className="flex flex-1 flex-col items-center gap-2 text-center">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? "invisible" : progress[i - 1].state === "done" ? "bg-ink" : "bg-line"}`} />
              <Dot state={s.state} />
              <span className={`h-0.5 flex-1 ${i === progress.length - 1 ? "invisible" : s.state === "done" ? "bg-ink" : "bg-line"}`} />
            </div>
            <span className={`text-xs ${s.state === "pending" ? "text-muted" : "text-ink"}`}>{s.label}</span>
          </li>
        ))}
      </ol>

      <ul className="flex flex-col divide-y divide-line">
        {progress
          .filter((s) => s.state !== "pending")
          .map((s) => (
            <li key={s.id} className="flex items-start gap-3 py-3">
              <span className="mt-0.5">
                <Dot state={s.state} small />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className={s.state === "error" ? "text-bad-ink" : s.state === "running" ? "text-ink" : "text-ink-2"}>
                  {s.detail}
                  {s.state === "running" && <span className="animate-pulse">…</span>}
                </span>
                {s.sources && s.sources.length > 0 && (
                  <span className="flex flex-wrap gap-1.5">
                    {s.sources.map((src) => (
                      <span key={src.url} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2 py-0.5 text-xs text-ink-2">
                        {/* eslint-disable-next-line @next/next/no-img-element -- tiny third-party favicons */}
                        <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(src.title)}&sz=32`} alt="" className="size-3.5 rounded-sm" />
                        {src.title}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              {durations[s.id] != null && durations[s.id]! >= 1 && <span className="text-xs text-muted tabular-nums">{durations[s.id]!.toFixed(0)} s</span>}
            </li>
          ))}
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
        {runUrl ? (
          <a href={runUrl} target="_blank" rel="noreferrer" className="text-ink-2 underline decoration-line hover:text-ink">
            Running in n8n: DryRun prep, execution #{runId} ↗
          </a>
        ) : (
          <span className="text-muted">Running in n8n</span>
        )}
        {failed && onRetry && (
          <button type="button" onClick={onRetry} disabled={retrying} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-surface disabled:opacity-60">
            {retrying ? "Starting again…" : "Try again"}
          </button>
        )}
      </footer>
    </section>
  );
}

function Dot({ state, small = false }: { state: PrepStep["state"]; small?: boolean }) {
  const size = small ? "size-5" : "size-7";
  if (state === "done")
    return (
      <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-ink text-surface`}>
        <StatusIcon tone="good" className="size-3/5" />
      </span>
    );
  if (state === "error")
    return (
      <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-bad text-surface`}>
        <StatusIcon tone="bad" className="size-3/5" />
      </span>
    );
  if (state === "running")
    return (
      <span className={`${size} relative flex shrink-0 items-center justify-center`}>
        <span className="absolute inset-0 animate-ping rounded-full bg-ink/20" />
        <span className="size-1/2 rounded-full bg-ink" />
      </span>
    );
  return <span className={`${size} shrink-0 rounded-full border-2 border-line bg-surface`} />;
}

// Ticks every second while something is running
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}

// How long each step took, as seen from this page: from when the previous step finished to when this one did.
// Steps already finished when the page opened have no timing, rather than a made-up one.
function useStepDurations(progress: PrepStep[], startedAt: string | null): Record<string, number | undefined> {
  const seen = useRef<{ firstSeenAt: number; doneAt: Record<string, number>; initiallyDone: Set<string> } | null>(null);
  const [durations, setDurations] = useState<Record<string, number | undefined>>({});
  useEffect(() => {
    const now = Date.now();
    if (!seen.current) {
      seen.current = { firstSeenAt: now, doneAt: {}, initiallyDone: new Set(progress.filter((s) => s.state === "done").map((s) => s.id)) };
    }
    const memo = seen.current;
    let changed = false;
    progress.forEach((s) => {
      if (s.state === "done" && memo.doneAt[s.id] == null) {
        memo.doneAt[s.id] = now;
        changed = true;
      }
    });
    if (!changed) return;
    const next: Record<string, number | undefined> = {};
    let previous = startedAt ? Date.parse(startedAt) : memo.firstSeenAt;
    for (const s of progress) {
      const at = memo.doneAt[s.id];
      if (at == null) break;
      if (!memo.initiallyDone.has(s.id)) next[s.id] = Math.max(0, (at - previous) / 1000);
      previous = at;
    }
    setDurations(next);
  }, [progress, startedAt]);
  return durations;
}
