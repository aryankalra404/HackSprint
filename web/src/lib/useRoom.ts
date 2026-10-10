"use client";

import { useEffect, useState } from "react";
import type { Room } from "./contract";

const RETRY_MS = 2000;

// Follows the laptop's room from the browser with the same long poll the headset uses (contract: GET /api/room).
// Pass null when the page isn't about the laptop's room; nothing is polled then.
export function useRoom(initial: Room): Room;
export function useRoom(initial: Room | null): Room | null;
export function useRoom(initial: Room | null): Room | null {
  const [room, setRoom] = useState(initial);
  const version = initial?.version;
  useEffect(() => {
    if (version === undefined) return;
    const abort = new AbortController();
    let since = version;
    (async () => {
      while (!abort.signal.aborted) {
        try {
          const res = await fetch(`/api/room?since=${since}`, { cache: "no-store", signal: abort.signal });
          const next = (await res.json()) as Room;
          if (next.version !== since) {
            since = next.version;
            setRoom(next);
          }
        } catch {
          if (abort.signal.aborted) return;
          await new Promise((r) => setTimeout(r, RETRY_MS));
        }
      }
    })();
    return () => abort.abort();
  }, [version]);
  return room;
}
