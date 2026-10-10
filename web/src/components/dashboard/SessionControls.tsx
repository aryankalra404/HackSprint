"use client";

import { useEffect, useState } from "react";
import type { Room, SessionAction } from "@/lib/contract";
import { clock } from "@/lib/format";

// Start, end and restart the rehearsal from the laptop: the backup for the headset's "start speaking" and its A and B buttons.
// Shows the room as the dashboard follows it, so it also shows when the headset started or ended the session.
export function SessionControls({ room }: { room: Room }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(room.phase === "live" ? room.live?.started_at : undefined);

  async function send(action: SessionAction) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/room/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, by: "web" }) });
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
        ? { dot: "bg-good", text: `Session ended${lasted(room)}` }
        : { dot: "bg-warn animate-pulse", text: "Waiting for the presenter to start speaking" };

  const button = "rounded-full px-4 py-1.5 text-xs font-medium disabled:opacity-60";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs" aria-live="polite">
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
      {room.phase === "done" && (
        <button type="button" disabled={busy} onClick={() => send("restart")} className={`${button} bg-ink text-surface`}>
          Run it again
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

// "02:14" since the session started, ticking every second
function useElapsed(since: string | undefined): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since ? clock(Math.max(0, (now - Date.parse(since)) / 1000)) : "";
}
