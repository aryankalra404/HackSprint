import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/api";
import { getBrief, getRoom } from "@/lib/room";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { Loading } from "@/components/shell";

export const metadata = { title: "DryRun dashboard" };

export default function DashboardPage({ params }: PageProps<"/s/[sessionId]">) {
  return (
    <Suspense fallback={<div className="p-8"><Loading>Loading the room…</Loading></div>}>
      {params.then(({ sessionId }) => (
        <Session sessionId={sessionId} />
      ))}
    </Suspense>
  );
}

async function Session({ sessionId }: { sessionId: string }) {
  const session = await getSession(sessionId);
  if (!session) notFound();
  const room = getRoom();
  // Only the session in the laptop's room can be started and ended from here
  const inRoom = room.session_id === sessionId;
  return (
    <Dashboard
      session={session}
      nameCards={room.name_cards}
      heightOffset={room.height_offset}
      room={inRoom ? room : null}
      meetingId={inRoom ? (getBrief()?.draft_id ?? null) : null}
    />
  );
}
