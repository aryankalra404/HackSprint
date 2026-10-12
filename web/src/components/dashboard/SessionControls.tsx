"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { Room, SessionAction } from "@/lib/contract";
import { clock } from "@/lib/format";
import { rebriefAction } from "@/app/m/actions";

// Start, end and restart the rehearsal from the laptop: the backup for the headset's "start speaking" and its A and B buttons.
// Shows the room as the dashboard follows it, so it also shows when the headset started or ended the session.
export function SessionControls({ room }: { room: Room }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rebriefing, startRebrief] = useTransition();
  const elapsed = useElapsed(room.phase === "live" ? room.live?.started_at : undefined);

  async function send(action: SessionAction | "debrief") {
    setBusy(true);
    setError(null);
    try {
      const res =
        action === "debrief"
          ? await fetch("/api/room/debrief", { method: "POST" })
          : await fetch("/api/room/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, by: "web" }) });
      if (!res.ok) setError(((await res.json()) as { error?: string }).error ?? "That didn't work.");
    } catch {
      setError("Couldn't reach the laptop's room.");
    } finally {
      setBusy(false);
    }
  }

  const status =
    room.phase === "live"
      ? { dot: "bg-bad animate-pulse", text: `Live ${elapsed}${room.live?.started_by === "headset" ? ", started in the headset" : ""}` }
      : room.phase === "done"
        ? room.debrief?.state === "running"
          ? { dot: "bg-warn animate-pulse", text: `Session ended${lasted(room)}. n8n is debriefing it` }
          : { dot: "bg-good", text: `Session ended${lasted(room)}` }
        : { dot: "bg-warn animate-pulse", text: "Waiting for the presenter to start speaking" };

  const button = "inline-flex h-8 items-center rounded-full px-4 text-xs font-medium disabled:opacity-60";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="inline-flex items-center gap-2 h-8 rounded-full border border-line bg-surface px-3 text-xs" aria-live="polite">
        <span aria-hidden="true" className={`size-2 rounded-full ${status.dot}`} />
        {status.text}
      </p>
      {room.phase === "briefed" && (
        <button type="button" disabled={busy} onClick={() => send("start")} className={`${button} bg-ink text-surface`}>
          Start now
        </button>
      )}
      {room.phase === "live" && (
        <button type="button" disabled={busy} onClick={() => send("end")} className={`${button} border border-line bg-surface hover:border-ink`}>
          End session
        </button>
      )}
      {room.phase === "done" && room.debrief?.state === "done" && (
        <Link href={`/s/${room.debrief.run_id}/report`} className={`${button} bg-ink text-surface`}>
          Open the report{room.debrief.overall != null ? ` (${room.debrief.overall}/100)` : ""}
        </Link>
      )}
      {room.phase === "done" && room.debrief?.state === "failed" && (
        <button type="button" disabled={busy} onClick={() => send("debrief")} className={`${button} border border-line bg-surface hover:border-ink`}>
          Try the debrief again
        </button>
      )}
      {room.phase === "done" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => send("restart")}
          className={`${button} ${room.debrief?.state === "done" ? "border border-line bg-surface hover:border-ink" : "bg-ink text-surface"}`}
        >
          Run it again
        </button>
      )}
      {room.phase === "done" && !room.scripted && (
        // n8n re-briefs the same panel from the last debrief and presses on the weak spots (the sample's script is fixed)
        <button
          type="button"
          disabled={busy || rebriefing || room.debrief?.state === "running"}
          onClick={() =>
            startRebrief(async () => {
              setError(null);
              const res = await rebriefAction();
              if (!res.ok) setError(res.error);
            })
          }
          className={`${button} border border-line bg-surface hover:border-ink`}
        >
          {rebriefing ? "n8n is planning the rehearsal…" : "Run it again, harder"}
        </button>
      )}
      {error && <p role="alert" className="text-xs text-bad-ink">{error}</p>}
    </div>
  );
}

// " after 04:12", from when it started to when it ended
function lasted(room: Room): string {
  const { started_at, ended_at } = room.live ?? {};
  if (!started_at || !ended_at) return "";
  return ` after ${clock(Math.max(0, (Date.parse(ended_at) - Date.parse(started_at)) / 1000))}`;
}

// "02:14" since the session started, ticking every second (the browser rehearsal's header uses it too)
export function useElapsed(since: string | undefined): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since ? clock(Math.max(0, (now - Date.parse(since)) / 1000)) : "";
}
