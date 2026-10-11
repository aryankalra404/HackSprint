import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { listMeetings, n8nProblem } from "@/lib/api";
import type { Meeting } from "@/lib/contract";
import { sampleMeeting } from "@/lib/mock/sample";
import { MeetingList } from "@/components/meetings/MeetingList";
import { PreparePopup } from "@/components/meetings/PreparePopup";
import { RefreshWhileResearching } from "@/components/meetings/RefreshWhileResearching";
import { SkippedList } from "@/components/meetings/SkippedList";
import { stillResearching } from "@/lib/format";

// Home: the meetings n8n is preparing you for
export default function Home() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
        <Link href="/" className="font-display text-2xl">DryRun</Link>
        <nav className="flex items-center gap-1">
          <Link href="/about" className="rounded-full px-3 py-2 text-sm text-ink-2 hover:text-ink">About</Link>
          <Link href="/new" className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-surface hover:bg-ink/85">
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M8 3v10M3 8h10" />
            </svg>
            Add a meeting
          </Link>
        </nav>
      </header>
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">Your meetings</h1>
        <p className="max-w-xl text-ink-2">
          From your Google Calendar. n8n picks the ones that matter, researches them and emails you a brief.
        </p>
      </section>
      <Suspense fallback={<p className="text-sm text-muted">Loading your meetings…</p>}>
        <Meetings />
      </Suspense>
      <section className="flex flex-col gap-3" aria-labelledby="sample">
        <SectionHead id="sample" title="Try the sample" note="A scripted meeting: no speaking, no n8n, no AI." />
        <Suspense fallback={null}>
          <Sample />
        </Suspense>
      </section>
    </div>
  );
}

function SectionHead({ id, title, count, note }: { id?: string; title: string; count?: number; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="flex items-baseline gap-2 text-sm font-semibold">
        {title}
        {count != null && <span className="font-normal text-muted">{count}</span>}
      </h2>
      {note && <p className="text-sm text-muted">{note}</p>}
    </div>
  );
}

// The sample meeting, read at request time like the others (its card says how far off it is)
async function Sample() {
  await connection();
  return <MeetingList meetings={[sampleMeeting]} />;
}

async function Meetings() {
  await connection();
  let meetings: Meeting[];
  try {
    meetings = await listMeetings();
  } catch (err) {
    return (
      <p role="alert" className="rounded-2xl border border-line bg-surface p-5 text-sm text-ink-2">
        Couldn&apos;t reach n8n. {n8nProblem(err)}
      </p>
    );
  }
  // Every decision n8n made is listed: the meetings it's preparing, then the ones it skipped (with why)
  const skipped = meetings.filter((m) => m.status === "skipped");
  const prepared = meetings.filter((m) => m.status !== "skipped");
  if (prepared.length === 0) {
    return (
      <>
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
          <p className="font-display text-xl">No meetings to prepare yet</p>
          <p className="mx-auto max-w-md text-sm text-ink-2">
          Add an event with someone from outside your organisation to your Google Calendar, and n8n will pick it up within a couple of
          minutes. Or <Link href="/new" className="underline">add a meeting here</Link>.
          </p>
        </div>
        <SkippedList meetings={skipped} />
      </>
    );
  }
  return (
    <>
      {meetings.some(stillResearching) && <RefreshWhileResearching />}
      <section className="flex flex-col gap-3" aria-labelledby="upcoming">
        <SectionHead id="upcoming" title="Upcoming" count={prepared.length} />
        <MeetingList meetings={prepared} />
      </section>
      <SkippedList meetings={skipped} />
      <PreparePopup meetings={meetings} />
    </>
  );
}
