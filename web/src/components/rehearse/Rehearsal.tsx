"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import type { Bundle, LiveSession, Room, ThinkingTurn } from "@/lib/contract";
import { buildDebriefFeed, buildLiveFeed } from "@/lib/feed";
import { personaTag } from "@/lib/personas";
import { type DebugInfo, useRehearsal } from "@/lib/rehearse/useRehearsal";
import { rebriefAction } from "@/app/m/actions";
import { HandIcon } from "../ui";
import { AgentFeed } from "../dashboard/AgentFeed";
import { useElapsed } from "../dashboard/SessionControls";
import { RehearsalTable } from "./RehearsalTable";
import { SpeakerView } from "./SpeakerView";
import { StartGate } from "./StartGate";

const STAGE: Record<LiveSession["stage"], string> = { opening: "The opening", pitch: "The pitch", questions: "Questions", closing: "Closing" };
const THINKING_KEY = "dryrun.showThinking";

// Rehearse in the browser: the same panel at the same table as VR, your slides, the panel's voices, raised hands, questions and the
// chair's closing, then n8n's debrief. One screen, no scrolling, for a laptop.
export function Rehearsal({ room: initialRoom, meetingId, debug }: { room: Room; meetingId: string | null; debug: boolean }) {
  const r = useRehearsal(initialRoom, debug);
  const { room, view } = r;
  const bundle = room.bundle;
  const [thinking, setThinking] = useShowThinking();
  const elapsed = useElapsed(room.phase === "live" ? room.live?.started_at : undefined);
  const live = room.phase === "live";
  const done = room.phase === "done";
  const stage = view.active ? view.stage : room.live?.stage;

  if (!bundle) return null;
  const feed = [...(room.live ? buildLiveFeed(room.live, bundle) : []), ...(done && room.debrief ? buildDebriefFeed(room.debrief) : [])];
  const resuming = live && !view.active && r.mic !== "ready" && r.mic !== "none" && !r.ending;
  const vrRoom = room.rehearse_in === "vr";
  const centre = room.phase === "briefed" ? "The panel is seated" : done ? "Session ended" : undefined;

  return (
    <>
      <p className="px-6 py-24 text-center text-ink-2 md:hidden">Rehearse on a laptop or desktop; the mic and slides need the room.</p>
      <div className="mx-auto hidden h-dvh max-w-[1600px] flex-col gap-3 px-4 py-4 md:flex">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <Link href="/" className="font-display text-2xl">DryRun</Link>
            <span className="text-sm text-ink-2">Pitch to {bundle.prospect.company}</span>
            {live && stage && (
              <span className="inline-flex items-center gap-2 text-sm">
                <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-bad" />
                {STAGE[stage]} <span className="font-display tabular-nums">{elapsed}</span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {r.mic === "ready" && <MicMeter level={r.micLevel} threshold={r.micThreshold} />}
            {r.mic === "none" && <span className="text-xs text-muted">No mic</span>}
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-2">
              <input type="checkbox" checked={thinking} onChange={(e) => setThinking(e.target.checked)} className="accent-ink" />
              Show n8n&apos;s thinking
            </label>
            {live && (
              <button type="button" onClick={r.end} disabled={r.ending} className="rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-medium hover:border-ink disabled:opacity-60">
                {r.ending ? "Ending…" : "End"}
              </button>
            )}
          </div>
        </header>
        {r.error && <p role="alert" className="text-sm text-bad-ink">{r.error}</p>}

        <main className={`grid min-h-0 flex-1 gap-3 ${thinking ? "grid-cols-[minmax(0,1fr)_minmax(320px,400px)_320px]" : "grid-cols-[minmax(0,1fr)_minmax(340px,440px)]"}`}>
          <section aria-label="The table" className="relative flex min-h-0 flex-col rounded-2xl border border-line bg-surface p-3">
            <RehearsalTable personas={bundle.personas} speaking={view.speaking} hands={view.hands} centre={centre} voiceLevel={r.voiceLevel} />
            {vrRoom && (room.phase === "briefed" || done || live) ? (
              <VrRoomCard live={live} />
            ) : (
              (room.phase === "briefed" || resuming) && (
                <StartGate mic={r.mic} micError={r.micError} resuming={resuming} onAllow={r.allowMic} onWithoutMic={r.goWithoutMic} onStart={r.start} onEnd={r.end} />
              )
            )}
          </section>

          {done ? (
            <DebriefPanel room={room} feed={feed.filter((i) => i.phase === "After")} meetingId={meetingId} onRestart={r.restart} />
          ) : (
            <SpeakerView bundle={bundle} deck={room.deck} slide={r.slide} count={r.slideCount} live={live} cue={view.cue} wrapUp={view.wrapUp} onGo={r.go} />
          )}

          {thinking && <AgentFeed items={feed} status={live ? `Live: ${stage ? STAGE[stage].toLowerCase() : ""}` : done ? "After the run" : undefined} />}
        </main>

        <BottomStrip bundle={bundle} live={live} caption={view.caption} prompt={view.prompt} thinking={live ? (room.live?.thinking ?? []) : []} />
      </div>
      {debug && <DebugOverlay info={r.debugInfo} view={view} />}
    </>
  );
}

// The caption of whoever speaks, the hand prompt, and n8n at work
function BottomStrip({ bundle, live, caption, prompt, thinking }: { bundle: Bundle; live: boolean; caption: { persona_id: string; text: string } | null; prompt: string | null; thinking: ThinkingTurn[] }) {
  const who = caption ? personaTag(bundle.personas, caption.persona_id) : null;
  const reading = thinking[0];
  return (
    <footer className="flex min-h-[4.5rem] flex-col justify-center gap-1 rounded-2xl border border-line bg-surface px-5 py-3" aria-live="polite">
      <p className="text-base leading-snug">
        {caption && who ? (
          <>
            <span className="font-semibold" style={{ color: who.color }}>
              {who.name} ({who.role || who.short}):
            </span>{" "}
            &ldquo;{caption.text}&rdquo;
          </>
        ) : live ? (
          <span className="text-muted">The panel is listening.</span>
        ) : null}
      </p>
      <div className="flex justify-between gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-warn-ink">
          {prompt && (
            <>
              <HandIcon className="size-4" />
              {prompt}
            </>
          )}
        </span>
        {reading && <span className="text-ink-2">n8n is reading {readingWhat(reading, bundle)}…</span>}
      </div>
    </footer>
  );
}

function readingWhat(t: ThinkingTurn, bundle: Bundle): string {
  switch (t.mode) {
    case "opening":
      return "your opening";
    case "segment":
      return `slide ${t.slide_index + 1}`;
    case "answer":
      return t.asked_by ? `your answer to ${personaTag(bundle.personas, t.asked_by).name.split(" ")[0]}` : "your answer";
    case "pitch_end":
      return "the end of your pitch";
  }
}

// After the run: n8n's debrief steps, then the report and the two ways to go again
function DebriefPanel({ room, feed, meetingId, onRestart }: { room: Room; feed: ReturnType<typeof buildDebriefFeed>; meetingId: string | null; onRestart: () => void }) {
  const [rebriefing, startRebrief] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const d = room.debrief;
  const button = "rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-60";
  return (
    <section aria-label="Debrief" className="flex min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1">
        <AgentFeed items={feed} status={d?.state === "running" ? "n8n is debriefing" : d?.state === "done" ? "Debrief ready" : undefined} />
      </div>
      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
        {d?.state === "done" && (
          <Link href={`/s/${d.run_id}/report`} className={`${button} bg-ink text-center text-surface`}>
            Open the report{d.overall != null ? ` (${d.overall}/100)` : ""}
          </Link>
        )}
        {d?.state === "failed" && (
          <button type="button" onClick={() => fetch("/api/room/debrief", { method: "POST" }).catch(() => setError("Couldn't reach the laptop."))} className={`${button} border border-line hover:border-ink`}>
            Try the debrief again
          </button>
        )}
        {d?.state === "skipped" && d.error && <p className="text-sm text-ink-2">{d.error}</p>}
        {d?.state === "running" && <p className="text-sm text-ink-2">n8n is scoring the run. The report opens here when it&apos;s done.</p>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={rebriefing || d?.state === "running"}
            onClick={() =>
              startRebrief(async () => {
                setError(null);
                const res = await rebriefAction();
                if (!res.ok) setError(res.error);
              })
            }
            className={`${button} flex-1 ${d?.state === "done" ? "border border-ink" : "bg-ink text-surface"}`}
          >
            {rebriefing ? "n8n is planning the rehearsal…" : "Run it again, harder"}
          </button>
          <button type="button" disabled={rebriefing} onClick={onRestart} className={`${button} border border-line hover:border-ink`}>
            Same panel again
          </button>
        </div>
        <p className="text-xs text-muted">
          {rebriefing ? "It reads this debrief and presses on the weak spots. About 20 seconds." : "Harder: n8n re-briefs the panel from this debrief. Same panel: no n8n call."}
        </p>
        {error && <p role="alert" className="text-sm text-bad-ink">{error}</p>}
        {meetingId && (
          <Link href={`/m/${encodeURIComponent(meetingId)}`} className="text-xs text-ink-2 hover:text-ink">
            ← Back to the meeting
          </Link>
        )}
      </div>
    </section>
  );
}

// The room is set up for the headset: the browser doesn't take turns unless the presenter switches it here
function VrRoomCard({ live }: { live: boolean }) {
  const [error, setError] = useState<string | null>(null);
  async function switchHere() {
    setError(null);
    try {
      const res = await fetch("/api/room/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rehearse_in: "browser" }) });
      if (!res.ok) setError(((await res.json()) as { error?: string }).error ?? "That didn't work.");
    } catch {
      setError("Couldn't reach the laptop's room.");
    }
  }
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper/60 p-6 backdrop-blur-[2px]">
      <div className="flex max-w-md flex-col gap-3 rounded-2xl border border-line bg-surface p-6 shadow-lg">
        <h2 className="font-display text-2xl leading-tight">This panel is set up for the headset</h2>
        <p className="text-sm text-ink-2">{live ? "A run is going on in the headset. Rehearse here once it ends." : "Rehearse here instead, and the headset will only show the room."}</p>
        {!live && (
          <div>
            <button type="button" onClick={switchHere} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-surface">
              Rehearse here instead
            </button>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-bad-ink">{error}</p>}
      </div>
    </div>
  );
}

// A small level meter for the mic: five bars, the darker ones above the speech threshold
function MicMeter({ level, threshold }: { level: () => number; threshold: () => number }) {
  const bars = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const l = level();
      const t = threshold() || 0.02;
      const lit = Math.min(5, Math.round((l / (t * 2)) * 5));
      bars.current?.childNodes.forEach((n, i) => {
        const el = n as HTMLElement;
        el.style.opacity = i < lit ? "1" : "0.25";
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [level, threshold]);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2" title="Your mic">
      <MicIcon />
      <span ref={bars} aria-hidden="true" className="inline-flex h-4 items-end gap-[2px]">
        {[5, 8, 11, 14, 16].map((h) => (
          <span key={h} className="w-[3px] rounded-sm bg-ink" style={{ height: h, opacity: 0.25 }} />
        ))}
      </span>
      Mic
    </span>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" />
      <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" />
    </svg>
  );
}

// "Show n8n's thinking", remembered in this browser (off by default; on for judges)
function useShowThinking(): [boolean, (on: boolean) => void] {
  const subscribe = (notify: () => void) => {
    window.addEventListener("storage", notify);
    window.addEventListener("dryrun-thinking", notify);
    return () => {
      window.removeEventListener("storage", notify);
      window.removeEventListener("dryrun-thinking", notify);
    };
  };
  const read = () => {
    try {
      return localStorage.getItem(THINKING_KEY) === "1";
    } catch {
      return false;
    }
  };
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = (next: boolean) => {
    try {
      localStorage.setItem(THINKING_KEY, next ? "1" : "0");
    } catch {
      // Not remembered; fine
    }
    window.dispatchEvent(new Event("dryrun-thinking"));
  };
  return [on, set];
}

// ?debug=1: the mic's numbers, to tune the thresholds in the venue
function DebugOverlay({ info, view }: { info: DebugInfo | null; view: ReturnType<typeof useRehearsal>["view"] }) {
  const rows = useMemo(
    () =>
      info
        ? [
            ["level", info.level.toFixed(4)],
            ["background", info.background.toFixed(4)],
            ["threshold", info.threshold.toFixed(4)],
            ["speaking", info.speaking ? "yes" : "no"],
            ["quiet for", `${info.quietFor.toFixed(1)} s`],
            ["recorded", `${info.recorded.toFixed(1)} s (${info.speech.toFixed(1)} s speech)`],
            ["mic rate", `${info.rate} Hz`],
          ]
        : [["mic", "off"]],
    [info],
  );
  return (
    <div className="fixed bottom-24 left-4 z-50 rounded-lg bg-ink/90 p-3 font-mono text-[11px] text-surface">
      {[...rows, ["stage", view.stage], ["in flight", String(view.inFlight)], ["hands", view.hands.join(", ") || "none"]].map(([k, v]) => (
        <div key={k} className="flex justify-between gap-6">
          <span className="opacity-70">{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}
