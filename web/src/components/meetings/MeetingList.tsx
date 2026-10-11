import Link from "next/link";
import type { Meeting } from "@/lib/contract";
import { meetingWhen, untilLabel } from "@/lib/format";
import { MeetingStatus } from "./MeetingStatus";

// Upcoming meetings n8n picked up from the calendar (or that were added here), soonest first
export function MeetingList({ meetings }: { meetings: Meeting[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {meetings.map((m) => {
        const d = new Date(m.start);
        const valid = !Number.isNaN(d.getTime());
        return (
          <li key={m.id}>
            <Link
              href={`/m/${encodeURIComponent(m.id)}`}
              className="flex items-stretch gap-4 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-ink sm:gap-6 sm:p-5"
            >
              <span className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-paper py-2 text-center">
                <span className="text-xs text-ink-2">{valid ? d.toLocaleString("en-IN", { month: "short", timeZone: "Asia/Kolkata" }) : ""}</span>
                <span className="font-display text-2xl leading-none">{valid ? d.toLocaleString("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" }) : "?"}</span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-display text-lg leading-tight">{m.title}</span>
                  {m.company !== m.title && <span className="text-sm text-ink-2">{m.company}</span>}
                </span>
                <span className="text-sm text-muted">
                  {meetingWhen(m.start)}
                  {valid && `, ${untilLabel(m.start)}`}
                  {m.attendees.length > 0 && `. With ${m.attendees.map((a) => a.name).join(", ")}`}
                </span>
                {m.why && <span className="text-sm text-ink-2">{m.why}</span>}
                <PrepLine meeting={m} />
                <PracticeLine meeting={m} />
              </span>
              <span className="flex shrink-0 items-start">
                <MeetingStatus status={m.status} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// While n8n works on a meeting (or if it failed): which step it's on, from its progress reports
function PrepLine({ meeting }: { meeting: Meeting }) {
  const steps = meeting.progress ?? [];
  if (!(meeting.status === "researching" || meeting.status === "failed") || steps.length === 0) return null;
  const current = steps.find((s) => s.state === "error") ?? steps.find((s) => s.state === "running");
  if (!current) return null;
  const n = steps.indexOf(current) + 1;
  return (
    <span className={`text-sm ${current.state === "error" ? "text-bad-ink" : "text-ink"}`}>
      Step {n} of {steps.length}: {current.detail}
      {current.state === "running" && <span className="animate-pulse">…</span>}
    </span>
  );
}

// Once rehearsed: how many times, and how the last one went (n8n's debrief)
function PracticeLine({ meeting }: { meeting: Meeting }) {
  const p = meeting.practice;
  if (!p) return null;
  return (
    <span className="text-sm">
      <span className="font-medium">Rehearsed {p.sessions === 1 ? "once" : `${p.sessions} times`}</span>
      {p.last.overall != null && <span className="text-ink-2">, last {p.last.overall}/100</span>}
      {p.last.headline && <span className="text-ink-2">: {p.last.headline}</span>}
    </span>
  );
}
