import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/api";
import { DebriefView } from "@/components/debrief/DebriefView";

export const metadata = { title: "Debrief · DryRun" };

export default function DebriefPage({ params }: PageProps<"/s/[sessionId]/debrief">) {
  return (
    <Suspense fallback={<p className="px-8 py-24 font-mono text-sm text-muted">Loading debrief…</p>}>
      {params.then(({ sessionId }) => (
        <Debrief sessionId={sessionId} />
      ))}
    </Suspense>
  );
}

async function Debrief({ sessionId }: { sessionId: string }) {
  const session = await getSession(sessionId);
  if (!session) notFound();
  return <DebriefView session={session} />;
}
