import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/api";
import { isDebriefed } from "@/lib/contract";
import { DebriefView } from "@/components/debrief/DebriefView";

export const metadata = { title: "Report · DryRun" };

export default function ReportPage({ params }: PageProps<"/s/[sessionId]/report">) {
  return (
    <Suspense fallback={<p className="px-8 py-24 font-mono text-sm text-muted">Loading report…</p>}>
      {params.then(({ sessionId }) => (
        <Report sessionId={sessionId} />
      ))}
    </Suspense>
  );
}

async function Report({ sessionId }: { sessionId: string }) {
  const session = await getSession(sessionId);
  if (!session) notFound();
  // No report before the session has been rehearsed: show the dashboard instead.
  if (!isDebriefed(session)) redirect(`/s/${sessionId}`);
  return <DebriefView session={session} />;
}
