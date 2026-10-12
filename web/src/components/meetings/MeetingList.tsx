import Link from "next/link";
import type { Meeting } from "@/lib/contract";
import { untilLabel } from "@/lib/format";
import { MeetingStatus } from "./MeetingStatus";

const IST = "Asia/Kolkata";

// Upcoming meetings n8n picked up from the calendar (or that were added here), soonest first, as rows of one list
export function MeetingList({ meetings }: { meetings: Meeting[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {meetings.map((m) => (
        <li key={m.id}>
          <MeetingRow meeting={m} />
        </li>
      ))}
    </ul>
  );
}

function MeetingRow({ meeting: m }: { meeting: Meeting }) {
  const d = new Date(m.start);
  const valid = !Number.isNaN(d.getTime());
  const until = valid ? untilLabel(m.start) : "";
  return (
    <Link
      href={`/m/${encodeURIComponent(m.id)}`}
      className="group grid grid-cols-[3.5rem_1fr] gap-x-4 gap-y-3 px-4 py-5 transition-colors hover:bg-paper/60 sm:grid-cols-[4rem_1fr_auto] sm:gap-x-6 sm:px-6"
    >
      <span className="flex flex-col items-center self-start rounded-xl border border-line py-2 text-center">
        <span className="text-xs text-ink-2">{valid ? d.toLocaleString("en-IN", { month: "short", timeZone: IST }) : ""}</span>
        <span className="font-display text-2xl leading-none">{valid ? d.toLocaleString("en-IN", { day: "numeric", timeZone: IST }) : "?"}</span>
        <span className="mt-1 text-xs text-muted">{valid ? d.toLocaleString("en-IN", { weekday: "short", timeZone: IST }) : ""}</span>
      </span>

      <span className="flex min-w-0 flex-col gap-2">
        <span className="flex flex-col gap-0.5">
          <span className="truncate font-display text-lg leading-snug">{m.title}</span>
          {m.company !== m.title && <span className="text-sm text-ink-2">{m.company}</span>}
        </span>
        <span className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
          {valid && (
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon />
              {d.toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: IST })}
              {until && <span className="text-ink-2">({until})</span>}
            </span>
          )}
          {m.attendees.length > 0 && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <PeopleIcon />
              <span className="truncate">{m.attendees.map((a) => a.name).join(", ")}</span>
            </span>
          )}
        </span>
        {m.why && <span className="line-clamp-2 max-w-2xl text-sm leading-relaxed text-ink-2">{m.why}</span>}
        <PrepLine meeting={m} />
        <PracticeLine meeting={m} />
      </span>

      <span className="col-start-2 flex items-center justify-between gap-3 sm:col-start-3 sm:flex-col sm:items-end sm:justify-between">
        <MeetingStatus status={m.status} />
        <span className="inline-flex items-center text-muted group-hover:text-ink">
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3.5L10.5 8 6 12.5" />
          </svg>
        </span>
      </span>
    </Link>
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
    <span className="mt-1 flex max-w-2xl items-start gap-3 rounded-xl bg-paper px-3 py-2.5">
      {p.last.overall != null && (
        <span className="flex shrink-0 flex-col items-center leading-none">
          <span className="font-display text-xl">{p.last.overall}</span>
          <span className="mt-0.5 text-xs text-muted">of 100</span>
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-0.5 text-sm">
        <span className="font-medium">
          Last rehearsal{p.sessions > 1 && <span className="font-normal text-muted">, {p.sessions} so far</span>}
        </span>
        {p.last.headline && <span className="line-clamp-2 text-ink-2">{p.last.headline}</span>}
      </span>
    </span>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.75V8l2.25 1.5" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="6" cy="5.5" r="2.5" />
      <path d="M1.75 13.5c0-2.4 1.9-4 4.25-4s4.25 1.6 4.25 4" />
      <path d="M10.5 3.2a2.5 2.5 0 0 1 0 4.6M12 9.8c1.3.5 2.25 1.8 2.25 3.7" />
    </svg>
  );
}
