import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/api";
import { Dashboard } from "@/components/dashboard/Dashboard";

export const metadata = { title: "Dashboard · DryRun" };

export default function DashboardPage({ params }: PageProps<"/s/[sessionId]">) {
  return (
    <Suspense fallback={<p className="px-8 py-24 font-mono text-sm text-muted">Loading the room…</p>}>
      {params.then(({ sessionId }) => (
        <Session sessionId={sessionId} />
      ))}
    </Suspense>
  );
}

async function Session({ sessionId }: { sessionId: string }) {
  const session = await getSession(sessionId);
  if (!session) notFound();
  return <Dashboard session={session} />;
}
