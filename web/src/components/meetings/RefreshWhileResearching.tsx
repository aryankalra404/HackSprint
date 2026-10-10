"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// While n8n is still researching a meeting, re-read it every few seconds so progress and the brief appear by themselves.
// Every re-read is an n8n execution, so it gives up after a few minutes (a run takes under a minute); reloading starts again.
export function RefreshWhileResearching({ everyMs = 3000, forMs = 180_000 }: { everyMs?: number; forMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const until = Date.now() + forMs;
    const timer = setInterval(() => {
      if (Date.now() > until) clearInterval(timer);
      else router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs, forMs]);
  return null;
}
