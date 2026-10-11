import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getMeeting } from "@/lib/api";
import { getBrief, getRoom } from "@/lib/room";
import { Practice } from "@/components/brief/Practice";
import { PractiseButton } from "@/components/meetings/PractiseButton";

export const metadata = { title: "DryRun practice" };

export default function PractisePage({ params }: PageProps<"/m/[id]/practise">) {
  return (
    <Suspense fallback={<p className="px-8 py-24 text-sm text-muted">Loading the table…</p>}>
      {params.then(({ id }) => (
        <PracticeFromRoom id={decodeURIComponent(id)} />
      ))}
    </Suspense>
  );
}

// The practice table for this meeting, as it is in the room (so a reload keeps your edits)
async function PracticeFromRoom({ id }: { id: string }) {
  await connection();
  const room = getRoom();
  const brief = getBrief();
  if (room.phase !== "drafting" || !brief || brief.draft_id !== id) {
    const detail = await getMeeting(id);
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-24">
        <h1 className="font-display text-3xl">The table is set for another meeting</h1>
        <p className="text-ink-2">Seat this meeting&apos;s practice panel to start. The headset will follow.</p>
        {detail?.proposal ? <PractiseButton meetingId={id} /> : <Link href={`/m/${encodeURIComponent(id)}`} className="underline">Back to the brief</Link>}
      </div>
    );
  }
  const detail = await getMeeting(id);
  return (
    <Practice
      meeting={{ id, title: detail?.meeting.title ?? "Meeting", company: room.prospect?.company ?? detail?.meeting.company ?? "" }}
      input={brief.input}
      draft={{ draft_id: brief.draft_id, suggestions: brief.suggestions }}
      pitch={brief.pitch}
      panel={room.panel}
      nameCards={room.name_cards}
      room={room}
    />
  );
}
