import Link from "next/link";
import type { Meeting } from "@/lib/contract";
import { meetingWhen } from "@/lib/format";
import { PrepareAnyway } from "./PrepareAnyway";

// Meetings n8n decided aren't worth preparing, each with its reason, so nothing is hidden and any of them can be prepared anyway
export function SkippedList({ meetings }: { meetings: Meeting[] }) {
  if (meetings.length === 0) return null;
  return (
    <details className="group flex flex-col gap-3" aria-labelledby="skipped">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 [&::-webkit-details-marker]:hidden">
        <h2 id="skipped" className="flex items-center gap-2 font-display text-xl leading-tight">
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3.5L10.5 8 6 12.5" />
          </svg>
          Skipped by n8n
          <span className="font-sans text-sm font-normal text-muted">{meetings.length}</span>
        </h2>
        <p className="text-sm text-ink-2">Not worth preparing, with n8n&apos;s reason. Prepare one anyway if it matters.</p>
      </summary>
      <ul className="mt-4 flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
        {meetings.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:flex-nowrap sm:px-6">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Link href={`/m/${encodeURIComponent(m.id)}`} className="flex flex-wrap items-baseline gap-x-3 hover:underline">
                <span className="font-medium">{m.title}</span>
                <span className="text-sm text-muted">{meetingWhen(m.start)}</span>
              </Link>
              {m.why && <span className="text-sm text-ink-2">{m.why}</span>}
            </div>
            <PrepareAnyway meetingId={m.id} />
          </li>
        ))}
      </ul>
    </details>
  );
}
