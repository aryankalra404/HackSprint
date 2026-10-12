import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { listTwins } from "@/lib/twins";
import { shortDate } from "@/lib/twinView";
import { Loading, PageTitle, ReadingPage } from "@/components/shell";
import { SectionHead, StatusIcon } from "@/components/ui";

export const metadata = { title: "DryRun people" };

// Everyone DryRun keeps a twin of (contract 0.27): from the laptop's copies, and n8n's people table read once
export default function People() {
  return (
    <ReadingPage active="people">
      <PageTitle
        title="People"
        lead="A twin of each real person you meet, built by n8n only from real sources: your emails with them, notes after real meetings, public professional pages and what you add. Never from a rehearsal. Open a brief to start one for someone new."
      />
      <Suspense fallback={<Loading>Reading the twins…</Loading>}>
        <List />
      </Suspense>
    </ReadingPage>
  );
}

async function List() {
  await connection();
  const twins = await listTwins();
  if (twins.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-axis px-6 py-12 text-center">
        <p className="font-display text-xl">No twins yet</p>
        <p className="max-w-md text-sm text-ink-2">Open a meeting&apos;s brief and press Twin next to someone coming to build theirs from your emails.</p>
      </div>
    );
  return (
    <section className="flex flex-col gap-4" aria-labelledby="everyone">
      <SectionHead id="everyone" title="Everyone DryRun knows" count={twins.length} />
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {twins.map((t) => (
          <li key={t.email}>
            <Link
              href={`/people/${encodeURIComponent(t.email)}`}
              className="group grid gap-x-6 gap-y-2 px-4 py-5 transition-colors hover:bg-paper/60 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-6"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="truncate font-display text-lg leading-snug">{t.name || t.email}</span>
                  {t.email.endsWith("@kaverifreight.in") && <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-2">Sample</span>}
                </span>
                <span className="truncate text-sm text-ink-2">{[t.role, t.company].filter(Boolean).join(", ") || t.email}</span>
              </span>
              <span className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2 tabular-nums">
                <span><span className="font-medium text-ink">{t.facts}</span> {t.facts === 1 ? "fact" : "facts"}</span>
                <span><span className="font-medium text-ink">{t.meetings}</span> {t.meetings === 1 ? "meeting" : "meetings"}</span>
                {t.to_check > 0 && (
                  <span className="inline-flex items-center gap-1 font-medium text-warn-ink">
                    <StatusIcon tone="warn" />
                    {t.to_check} to check
                  </span>
                )}
                <span className="text-muted">{t.last_met ? `Last met ${shortDate(t.last_met)}` : "Not met yet"}</span>
              </span>
              <svg viewBox="0 0 16 16" aria-hidden="true" className="hidden size-5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink sm:block" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3.5L10.5 8 6 12.5" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
