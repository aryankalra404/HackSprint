import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getMeeting } from "@/lib/api";
import { getBrief, getRoom } from "@/lib/room";
import { Practice } from "@/components/brief/Practice";
import { getDeckReview } from "@/lib/deckReview";
import { PractiseButton } from "@/components/meetings/PractiseButton";
import { twinSummaries } from "@/lib/twins";
import { Loading, PageTitle, ReadingPage } from "@/components/shell";
import { btn } from "@/components/ui";

export const metadata = { title: "DryRun practice" };

export default function PractisePage({ params }: PageProps<"/m/[id]/practise">) {
  return (
    <Suspense fallback={<div className="p-8"><Loading>Setting the table…</Loading></div>}>
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
    const detail = await getMeeting(id).catch(() => null);
    return (
      <ReadingPage active="meetings">
        <PageTitle
          crumbs={[{ label: "Meetings", href: "/" }, ...(detail ? [{ label: detail.meeting.title, href: `/m/${encodeURIComponent(id)}` }] : [])]}
          title="The table is set for another meeting"
          lead="Seat this meeting's practice panel to start. The headset will follow."
        />
        <div>{detail?.proposal ? <PractiseButton meetingId={id} /> : <Link href={`/m/${encodeURIComponent(id)}`} className={btn("secondary")}>Back to the brief</Link>}</div>
      </ReadingPage>
    );
  }
  // The title only; the practice page works from the room even when n8n can't be reached
  const detail = await getMeeting(id).catch(() => null);
  return (
    <Practice
      meeting={{ id, title: detail?.meeting.title ?? "Meeting", company: room.prospect?.company ?? detail?.meeting.company ?? "" }}
      input={brief.input}
      draft={{ draft_id: brief.draft_id, suggestions: brief.suggestions }}
      pitch={brief.pitch}
      panel={room.panel}
      nameCards={room.name_cards}
      room={room}
      review={await getDeckReview(id)}
      twins={await twinSummaries(detail?.meeting.attendees ?? [])}
    />
  );
}
