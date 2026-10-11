import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getBrief, getRoom } from "@/lib/room";
import { Rehearsal } from "@/components/rehearse/Rehearsal";

export const metadata = { title: "DryRun rehearsal" };

export default function RehearsePage({ params, searchParams }: PageProps<"/s/[sessionId]/rehearse">) {
  return (
    <Suspense fallback={<p className="px-8 py-24 text-sm text-muted">Seating the panel…</p>}>
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
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-24">
        <h1 className="font-display text-3xl">This rehearsal isn&apos;t in the room any more</h1>
        <p className="text-ink-2">The laptop&apos;s room has moved on to another panel. Brief this meeting&apos;s panel again from its practice page.</p>
        <Link href={meetingId ? `/m/${encodeURIComponent(meetingId)}` : "/"} className="underline">
          {meetingId ? "Back to the meeting" : "Back to your meetings"}
        </Link>
      </div>
    );
  }
  return <Rehearsal room={room} meetingId={getBrief()?.draft_id ?? null} debug={debug} />;
}
