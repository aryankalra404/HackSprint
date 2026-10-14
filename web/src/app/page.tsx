import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { listMeetings, n8nProblem } from "@/lib/api";
import type { Meeting } from "@/lib/contract";
import { MeetingList } from "@/components/meetings/MeetingList";
import { PreparePopup } from "@/components/meetings/PreparePopup";
import { RefreshWhileResearching } from "@/components/meetings/RefreshWhileResearching";
import { SkippedList } from "@/components/meetings/SkippedList";
import { stillResearching } from "@/lib/format";
import { Loading, PageTitle, ReadingPage } from "@/components/shell";
import { SectionHead, btn } from "@/components/ui";

// Home: the meetings n8n is preparing you for
export default function Home() {
  return (
    <ReadingPage
      active="meetings"
      actions={
        <Link href="/new" className={btn("primary")}>
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
          Add a meeting
        </Link>
      }
    >
      <PageTitle title="Your meetings" lead="From your Google Calendar. n8n picks the ones that matter, researches them and emails you a brief." />
      <Suspense fallback={<Loading>Reading your meetings from n8n…</Loading>}>
        <Meetings />
      </Suspense>
    </ReadingPage>
  );
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
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-axis px-6 py-12 text-center">
          <p className="font-display text-xl">No meetings to prepare yet</p>
          <p className="max-w-md text-sm text-ink-2">
            Add an event with someone from outside your organisation to your Google Calendar, and n8n will pick it up within a couple of
            minutes.
          </p>
          <Link href="/new" className={`${btn("secondary")} mt-2`}>Add a meeting by hand</Link>
        </div>
        <SkippedList meetings={skipped} />
      </>
    );
  }
  return (
    <>
      {meetings.some(stillResearching) && <RefreshWhileResearching />}
      <section className="flex flex-col gap-4" aria-labelledby="upcoming">
        <SectionHead id="upcoming" title="Upcoming" count={prepared.length} />
        <MeetingList meetings={prepared} />
      </section>
      <SkippedList meetings={skipped} />
      <PreparePopup meetings={meetings} />
    </>
  );
}
