import Link from "next/link";
import type { AfterPerson, MeetingAfter } from "@/lib/contract";
import { meetingWhen } from "@/lib/format";
import { StatusIcon } from "../ui";

// What n8n found in the presenter's account of the real meeting (contract 0.28, the meeting's after): per person what they raised,
// what was promised and decided, how much of it the last rehearsal predicted, and where the follow-up stands. Facts only, each quoted
// from the notes.
export function HowItWent({ after, runUrl }: { after: MeetingAfter; runUrl: string | null }) {
  const f = after.followup;
  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-xl">How it went</h2>
        <p className="text-sm text-ink-2">
          From your {after.source === "voice" ? "voice note" : "notes"} of {meetingWhen(after.at)}
          {after.heard ? `, transcribed by ${after.heard}` : ""}. Each point is quoted from what you said, and went into that person&apos;s twin.
        </p>
      </header>

      {after.predictions.length > 0 && (
        <ul className="flex flex-col gap-2">
          {after.predictions.map((p) => (
            <li key={p.email} className="flex items-baseline gap-3">
              <span className="font-display text-3xl leading-none tabular-nums">
                {p.predicted}/{p.asked}
              </span>
              <span className="text-sm">
                Your rehearsal predicted {p.predicted} of the {p.asked} {p.asked === 1 ? "thing" : "things"} {p.name.split(" ")[0]} raised
                <span className="text-ink-2"> (their practice seat asked {p.practice_asked} {p.practice_asked === 1 ? "question" : "questions"})</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {after.people.length === 0 ? (
        <p className="text-sm text-ink-2">n8n found nothing it could quote about any attendee in what you said.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {after.people.map((p) => (
            <Person key={p.email} person={p} />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">The follow-up</h3>
        <FollowupStatus followup={f} />
        {f.body && (
          <details className="group text-sm">
            <summary className="w-fit cursor-pointer list-none text-ink-2 underline decoration-line hover:text-ink">
              {f.status === "sent" ? "What was sent" : "The draft"}
            </summary>
            <div className="mt-2 flex flex-col gap-2 rounded-xl bg-paper p-4">
              <p className="text-xs text-ink-2">To {f.to.join(", ")}</p>
              <p className="font-medium">{f.subject}</p>
              <p className="whitespace-pre-line">{f.body}</p>
            </div>
          </details>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        {after.transcript && (
          <details className="w-full">
            <summary className="w-fit cursor-pointer list-none text-ink-2 underline decoration-line hover:text-ink">What you said</summary>
            <p className="mt-2 max-w-3xl whitespace-pre-line text-ink-2">{after.transcript}</p>
          </details>
        )}
        {runUrl && (
          <a href={runUrl} target="_blank" rel="noreferrer" className="text-ink-2 underline decoration-line hover:text-ink">
            Open this run in n8n ↗
          </a>
        )}
      </div>
    </section>
  );
}

function Person({ person: p }: { person: AfterPerson }) {
  const groups: [string, { text: string; quote: string }[]][] = [
    ["Raised", p.raised],
    ["You promised", p.promised],
    ["Decided", p.decided],
  ];
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <Link href={`/people/${encodeURIComponent(p.email)}`} className="w-fit font-medium hover:underline">
        {p.name} <span className="text-xs font-normal text-ink-2">Twin ›</span>
      </Link>
      {groups
        .filter(([, items]) => items.length > 0)
        .map(([label, items]) => (
          <div key={label} className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-2">{label}</span>
            <ul className="flex flex-col gap-1">
              {items.map((x) => (
                <li key={x.text} title={`“${x.quote}”`}>
                  {x.text}
                </li>
              ))}
            </ul>
          </div>
        ))}
      {p.next_step && (
        <p className="text-sm">
          <span className="text-xs text-ink-2">Next step </span>
          {p.next_step}
        </p>
      )}
    </li>
  );
}

function FollowupStatus({ followup: f }: { followup: MeetingAfter["followup"] }) {
  if (f.status === "waiting")
    return (
      <p className="flex items-center gap-2 text-sm text-warn-ink">
        <StatusIcon tone="warn" className="size-4 shrink-0" /> Waiting for you: n8n emailed you the draft. Answer Send it or Don&apos;t send from your inbox.
      </p>
    );
  if (f.status === "sent")
    return (
      <p className="flex items-center gap-2 text-sm text-good-ink">
        <StatusIcon tone="good" className="size-4 shrink-0" /> Sent to {f.to.join(", ")}
        {f.answered_at ? `, ${meetingWhen(f.answered_at)}` : ""}
      </p>
    );
  if (f.status === "failed")
    return (
      <p className="flex items-center gap-2 text-sm text-bad-ink">
        <StatusIcon tone="bad" className="size-4 shrink-0" /> You approved it, but Gmail couldn&apos;t send it. Copy the draft below and send it yourself.
      </p>
    );
  // 0.29: a draft with a [fill in: …] gap is never offered for sending
  if (f.status === "draft")
    return (
      <p className="flex items-center gap-2 text-sm text-warn-ink">
        <StatusIcon tone="warn" className="size-4 shrink-0" /> Not sent: it still has a gap to fill in. Finish the draft below and send it yourself.
      </p>
    );
  if (f.status === "declined") return <p className="text-sm text-ink-2">Not sent: you kept it as a draft. It&apos;s below to edit and send yourself.</p>;
  return <p className="text-sm text-ink-2">No follow-up was drafted.</p>;
}
