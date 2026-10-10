import Link from "next/link";
import type { Meeting } from "@/lib/contract";
import { meetingWhen } from "@/lib/format";
import { PrepareAnyway } from "./PrepareAnyway";

// Meetings n8n decided aren't worth preparing, each with its reason, so nothing is hidden and any of them can be prepared anyway
export function SkippedList({ meetings }: { meetings: Meeting[] }) {
  if (meetings.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="skipped">
      <div className="flex flex-col gap-1">
        <h2 id="skipped" className="font-display text-xl">
          Skipped by n8n ({meetings.length})
        </h2>
        <p className="text-sm text-ink-2">n8n decided these aren&apos;t worth preparing, and why. If one matters, prepare it anyway.</p>
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
        {meetings.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap">
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
    </section>
  );
}
