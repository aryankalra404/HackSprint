"use client";

import { useState, useTransition } from "react";
import { practiseAction } from "@/app/m/actions";

// Seats this meeting's practice panel (the headset follows) and opens the practice table
export function PractiseButton({ meetingId }: { meetingId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await practiseAction(meetingId);
            if (!res.ok) setError(res.error);
          })
        }
        className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-surface disabled:opacity-60"
      >
        {pending ? "Seating the panel…" : "Set up the practice panel"}
      </button>
      {error && <p role="alert" className="text-sm text-bad-ink">{error}</p>}
    </div>
  );
}
