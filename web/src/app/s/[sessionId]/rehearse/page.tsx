import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getBrief, getRoom } from "@/lib/room";
import { Rehearsal } from "@/components/rehearse/Rehearsal";
import { Loading, PageTitle, ReadingPage } from "@/components/shell";
import { btn } from "@/components/ui";

export const metadata = { title: "DryRun rehearsal" };

export default function RehearsePage({ params, searchParams }: PageProps<"/s/[sessionId]/rehearse">) {
  return (
    <Suspense fallback={<div className="p-8"><Loading>Seating the panel…</Loading></div>}>
      {Promise.all([params, searchParams]).then(([{ sessionId }, query]) => (
        <RehearsalFromRoom sessionId={sessionId} debug={query.debug === "1"} />
      ))}
    </Suspense>
  );
}

// Rehearse in the browser: only the session in the laptop's room can be rehearsed. ?debug=1 shows the mic's numbers.
async function RehearsalFromRoom({ sessionId, debug }: { sessionId: string; debug: boolean }) {
  await connection();
  const room = getRoom();
  if (room.session_id !== sessionId || !room.bundle) {
    const meetingId = getBrief()?.draft_id;
    return (
      <ReadingPage active="meetings">
        <PageTitle
          crumbs={[{ label: "Meetings", href: "/" }]}
          title="This rehearsal isn't in the room any more"
          lead="The laptop's room has moved on to another panel. Brief this meeting's panel again from its practice page."
        />
        <div>
          <Link href={meetingId ? `/m/${encodeURIComponent(meetingId)}` : "/"} className={btn("secondary")}>
            {meetingId ? "Back to the meeting" : "Back to your meetings"}
          </Link>
        </div>
      </ReadingPage>
    );
  }
  return <Rehearsal room={room} meetingId={getBrief()?.draft_id ?? null} debug={debug} />;
}
