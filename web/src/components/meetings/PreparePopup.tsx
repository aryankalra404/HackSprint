"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Meeting } from "@/lib/contract";
import { meetingWhen, untilLabel } from "@/lib/format";

const DISMISSED = "dryrun-dismissed-";

// On opening the app: "prepare for your next meeting?", for the soonest upcoming meeting whose brief is ready.
// "Later" hides it for that meeting, in this browser.
export function PreparePopup({ meetings }: { meetings: Meeting[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [now] = useState(() => Date.now());
  const meeting = meetings.find((m) => m.status === "ready" && Date.parse(m.start) >= now - 3600000) ?? null;

  // Open it unless "Later" was pressed for this meeting before (remembered in this browser)
  useEffect(() => {
    if (!meeting) return;
    let dismissed = false;
    try {
      dismissed = !!localStorage.getItem(DISMISSED + meeting.id);
    } catch {
      // No storage: ask every time
    }
    if (!dismissed && !dialog.current?.open) dialog.current?.showModal();
  }, [meeting]);

  function later() {
    if (meeting) {
      try {
        localStorage.setItem(DISMISSED + meeting.id, "1");
      } catch {
        // Not remembered; it will ask again next time
      }
    }
    dialog.current?.close();
  }

  if (!meeting) return null;
  const href = `/m/${encodeURIComponent(meeting.id)}`;
  return (
    <dialog
      ref={dialog}
      onCancel={later}
      aria-labelledby="prepare-title"
      className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
    >
      <div className="flex flex-col gap-4 p-6">
        <p className="text-sm text-ink-2">
          {meetingWhen(meeting.start)}, {untilLabel(meeting.start)}
        </p>
        <h2 id="prepare-title" className="font-display text-2xl leading-tight">
          Prepare for {meeting.title}?
        </h2>
        <p className="text-sm text-ink-2">
          {meeting.why ? meeting.why + " " : ""}n8n has researched {meeting.company} and written your brief.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href={href} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-surface">
            Read the brief
          </Link>
          <Link href={`${href}#practise`} className="rounded-full border border-line px-5 py-2.5 text-sm hover:border-ink">
            Practise now
          </Link>
          <button type="button" onClick={later} className="rounded-full px-4 py-2.5 text-sm text-ink-2 hover:text-ink">
            Later
          </button>
        </div>
      </div>
    </dialog>
  );
}
