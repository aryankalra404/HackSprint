"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// While n8n is still researching a meeting, re-read it every few seconds so the brief appears by itself
export function RefreshWhileResearching() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
