import { Suspense } from "react";
import { connection } from "next/server";
import { Brief } from "@/components/brief/Brief";
import { demoBriefInput } from "@/lib/mock/panel";
import { getBrief, getRoom } from "@/lib/room";

export const metadata = { title: "New rehearsal" };

export default function NewRehearsalPage() {
  return (
    <Suspense fallback={<p className="px-8 py-24 text-sm text-muted">Loading…</p>}>
      <BriefFromRoom />
    </Suspense>
  );
}

// Picks up a panel that is still being drafted in the room
async function BriefFromRoom() {
  await connection();
  const room = getRoom();
  const brief = getBrief();
  const resume =
    room.phase === "drafting" && brief
      ? { input: brief.input, draft: { draft_id: brief.draft_id, suggestions: brief.suggestions }, panel: room.panel }
      : null;
  return <Brief sample={demoBriefInput} resume={resume} />;
}
