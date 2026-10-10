import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/api";
import { getRoom } from "@/lib/room";
import { Dashboard } from "@/components/dashboard/Dashboard";

export const metadata = { title: "DryRun dashboard" };

export default function DashboardPage({ params }: PageProps<"/s/[sessionId]">) {
  return (
    <Suspense fallback={<p className="px-8 py-24 text-sm text-muted">Loading the room…</p>}>
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
  return <Dashboard session={session} nameCards={room.name_cards} room={room.session_id === sessionId ? room : null} />;
}
