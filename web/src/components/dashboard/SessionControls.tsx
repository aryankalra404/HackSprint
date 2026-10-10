"use client";

import { useEffect, useState } from "react";
import type { Room } from "@/lib/contract";
import { clock } from "@/lib/format";
import { useRoom } from "@/lib/useRoom";

// Start and end the rehearsal from the laptop: the backup for the headset's "start speaking" and its A and B buttons.
// Follows the room, so it also shows when the headset started or ended the session.
export function SessionControls({ initial }: { initial: Room }) {
  const room = useRoom(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(room.phase === "live" ? room.live?.started_at : undefined);

  async function send(action: "start" | "end") {
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
        ? { dot: "bg-good", text: "Session ended" }
        : { dot: "bg-warn animate-pulse", text: "Waiting for the presenter to start speaking" };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs" aria-live="polite">
        <span aria-hidden="true" className={`size-2 rounded-full ${status.dot}`} />
        {status.text}
      </p>
      {room.phase === "briefed" && (
        <button type="button" disabled={busy} onClick={() => send("start")} className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-surface disabled:opacity-60">
          Start now
        </button>
      )}
      {room.phase === "live" && (
        <button type="button" disabled={busy} onClick={() => send("end")} className="rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-medium hover:border-ink disabled:opacity-60">
          End session
        </button>
      )}
      {error && <p role="alert" className="text-xs text-bad-ink">{error}</p>}
    </div>
  );
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
