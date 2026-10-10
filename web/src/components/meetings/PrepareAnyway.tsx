"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryMeetingAction } from "@/app/m/actions";

// Overrules n8n's decision to skip a meeting: n8n prepares it like any meeting added by hand, and its page shows the progress
export function PrepareAnyway({ meetingId, className }: { meetingId: string; className?: string }) {
  const router = useRouter();
  const [starting, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  // n8n takes a moment to pick it up: check again until the page shows its progress (which unmounts this button)
  useEffect(() => {
    if (!started) return;
    const timer = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(timer);
  }, [started, router]);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={starting || started}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await retryMeetingAction(meetingId);
            if (!res.ok) return setError(res.error);
            setStarted(true);
            router.push(`/m/${encodeURIComponent(meetingId)}`);
          })
        }
        className={className ?? "rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:border-ink disabled:opacity-60"}
      >
        {starting || started ? "n8n is starting…" : "Prepare anyway"}
      </button>
      {error && <span role="alert" className="text-xs text-bad-ink">{error}</span>}
    </span>
  );
}
