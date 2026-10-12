"use client";

import { useState, useTransition } from "react";
import { practiseAction } from "@/app/m/actions";
import { btn } from "../ui";

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
        className={btn("primary", "lg")}
      >
        {pending ? "Seating the panel…" : "Set up the practice panel"}
      </button>
      {error && <p role="alert" className="text-sm text-bad-ink">{error}</p>}
    </div>
  );
}
