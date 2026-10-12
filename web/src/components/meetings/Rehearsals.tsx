import Link from "next/link";
import type { SessionSummary } from "@/lib/contract";
import { meetingWhen } from "@/lib/format";
import { SectionHead } from "../ui";

// This meeting's rehearsals, newest first, each with n8n's score and headline and a link to its report
export function Rehearsals({ sessions }: { sessions: SessionSummary[] }) {
  if (sessions.length === 0) return null;
  const scores = sessions.filter((s) => s.status === "done" && s.overall != null).map((s) => s.overall as number).reverse();
  const delta = scores.length > 1 ? scores[scores.length - 1] - scores[scores.length - 2] : null;
  return (
    <section className="flex flex-col gap-4">
      <SectionHead
        title="Your rehearsals"
        count={sessions.length}
        note={
          scores.length > 1 && (
            <>
              Scores {scores.join(" → ")}
              {delta != null && <span className={delta >= 0 ? "ml-2 text-good-ink" : "ml-2 text-bad-ink"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} since the last one</span>}
            </>
          )
        }
      />
      <ol className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
        {sessions.map((s, i) => (
          <li key={s.session_id}>
            <Link
              href={`/s/${encodeURIComponent(s.session_id)}/report`}
              className={`group flex items-center gap-4 px-4 py-4 sm:px-5 ${s.status === "done" ? "hover:bg-paper/60" : "pointer-events-none"}`}
              aria-disabled={s.status !== "done"}
            >
              <span className="w-14 shrink-0 font-display text-3xl leading-none tabular-nums">{s.overall ?? "–"}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  Rehearsal {sessions.length - i}
                  <span className="font-normal text-muted">, {meetingWhen(s.at)}</span>
                </span>
                <span className="truncate text-sm text-ink-2">
                  {s.status === "done" ? s.headline : s.status === "debriefing" ? "n8n is debriefing it" : "The debrief didn't finish"}
                </span>
              </span>
              {s.status === "done" && <span className="shrink-0 text-sm text-ink-2 group-hover:text-ink">Open the report ›</span>}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
