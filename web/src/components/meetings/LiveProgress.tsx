"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PrepStep } from "@/lib/contract";
import { retryMeetingAction } from "@/app/m/actions";
import { PrepProgress } from "./PrepProgress";

// The live progress, with "Try again" wired to n8n for a failed run
export function LiveProgress(props: { meetingId: string; title: string; progress: PrepStep[]; startedAt: string | null; runUrl: string | null; runId: string | null }) {
  const router = useRouter();
  const [retrying, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <PrepProgress
        {...props}
        retrying={retrying}
        onRetry={() =>
          start(async () => {
            const res = await retryMeetingAction(props.meetingId);
            if (!res.ok) setError(res.error);
            else router.refresh();
          })
        }
      />
      {error && <p role="alert" className="text-sm text-bad-ink">{error}</p>}
    </div>
  );
}
