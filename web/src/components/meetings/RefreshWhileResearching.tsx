"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// While n8n is still researching a meeting, re-read it every couple of seconds so progress and the brief appear by themselves
export function RefreshWhileResearching({ everyMs = 2000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);
  return null;
}
