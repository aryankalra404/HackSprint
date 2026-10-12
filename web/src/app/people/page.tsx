import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { listTwins } from "@/lib/twins";
import { shortDate } from "@/lib/twinView";

export const metadata = { title: "DryRun people" };

// Everyone DryRun keeps a twin of (contract 0.27): from the laptop's copies, and n8n's people table read once
export default function People() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
        <Link href="/" className="font-display text-2xl">DryRun</Link>
        <Link href="/" className="text-sm text-ink-2 hover:text-ink">← Your meetings</Link>
      </header>
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">People</h1>
        <p className="max-w-2xl text-ink-2">
          A twin of each real person you meet, built by n8n only from real sources: your emails with them, notes after real meetings, public
          professional pages and what you add. Never from a rehearsal. Open a brief to start one for someone new.
        </p>
      </section>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  await connection();
  const twins = await listTwins();
  return (
    <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
      {twins.map((t) => (
        <li key={t.email}>
          <Link href={`/people/${encodeURIComponent(t.email)}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 p-4 hover:bg-paper">
            <span className="font-display text-lg">{t.name || t.email}</span>
            <span className="text-sm text-ink-2">{[t.role, t.company].filter(Boolean).join(", ")}</span>
            {t.email.endsWith("@kaverifreight.in") && <span className="text-xs text-muted">Sample</span>}
            <span className="ml-auto flex gap-4 text-sm text-ink-2 tabular-nums">
              <span>{t.facts} facts</span>
              <span>{t.meetings} {t.meetings === 1 ? "meeting" : "meetings"}</span>
              {t.to_check > 0 && <span className="font-medium text-ink">{t.to_check} to check</span>}
              <span>{t.last_met ? `Last met ${shortDate(t.last_met)}` : "Not met yet"}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
