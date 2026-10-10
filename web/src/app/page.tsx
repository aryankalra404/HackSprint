import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { listMeetings } from "@/lib/api";
import type { Meeting } from "@/lib/contract";
import { MeetingList } from "@/components/meetings/MeetingList";
import { PreparePopup } from "@/components/meetings/PreparePopup";
import { RefreshWhileResearching } from "@/components/meetings/RefreshWhileResearching";
import { SkippedList } from "@/components/meetings/SkippedList";
import { stillResearching } from "@/lib/format";

// Home: the meetings n8n is preparing you for
export default function Home() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="font-display text-2xl">DryRun</Link>
        <nav className="flex items-center gap-2">
          <Link href="/about" className="rounded-full px-3 py-2 text-sm text-ink-2 hover:text-ink">About</Link>
          <Link href="/new" className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-surface">Add a meeting</Link>
        </nav>
      </header>
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-4xl leading-tight">Your meetings</h1>
        <p className="max-w-2xl text-ink-2">
          n8n watches your Google Calendar, picks out the meetings that matter, researches them and emails you a brief. Open one to read it and
          practise.
        </p>
      </section>
      <Suspense fallback={<p className="text-sm text-muted">Loading your meetings…</p>}>
        <Meetings />
      </Suspense>
    </div>
  );
}

async function Meetings() {
  await connection();
  let meetings: Meeting[];
  try {
    meetings = await listMeetings();
  } catch {
    return (
      <p role="alert" className="rounded-2xl border border-line bg-surface p-5 text-sm text-ink-2">
        Couldn&apos;t reach n8n. Check that the DryRun meetings API workflow is active, then reload.
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
      <MeetingList meetings={prepared} />
      <SkippedList meetings={skipped} />
      <PreparePopup meetings={meetings} />
    </>
  );
}
