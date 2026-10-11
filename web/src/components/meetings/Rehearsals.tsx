import Link from "next/link";
import type { SessionSummary } from "@/lib/contract";
import { meetingWhen } from "@/lib/format";

// This meeting's rehearsals, newest first, each with n8n's score and headline and a link to its report
export function Rehearsals({ sessions }: { sessions: SessionSummary[] }) {
  if (sessions.length === 0) return null;
  const scores = sessions.filter((s) => s.status === "done" && s.overall != null).map((s) => s.overall as number).reverse();
  const delta = scores.length > 1 ? scores[scores.length - 1] - scores[scores.length - 2] : null;
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl">Your rehearsals</h2>
        {scores.length > 1 && (
          <p className="text-sm text-ink-2">
            {scores.join(" → ")}
            {delta != null && <span className={delta >= 0 ? "ml-2 text-good-ink" : "ml-2 text-bad-ink"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} since the last one</span>}
          </p>
        )}
      </header>
      <ol className="flex flex-col divide-y divide-line">
        {sessions.map((s, i) => (
          <li key={s.session_id}>
            <Link
              href={`/s/${encodeURIComponent(s.session_id)}/report`}
              className={`flex items-center gap-4 py-3 ${s.status === "done" ? "hover:text-ink" : "pointer-events-none"}`}
              aria-disabled={s.status !== "done"}
            >
              <span className="w-16 shrink-0 font-display text-3xl leading-none tabular-nums">{s.overall ?? "–"}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  Rehearsal {sessions.length - i}
                  <span className="font-normal text-muted">, {meetingWhen(s.at)}</span>
                </span>
                <span className="truncate text-sm text-ink-2">
                  {s.status === "done" ? s.headline : s.status === "debriefing" ? "n8n is debriefing it" : "The debrief didn't finish"}
                </span>
              </span>
              {s.status === "done" && <span className="shrink-0 text-sm underline decoration-line underline-offset-4">Open the report</span>}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
