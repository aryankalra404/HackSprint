import Link from "next/link";

// Placeholder until the Brief screen is built (step 3 in docs/PLAN.md).
export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-24 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">DryRun</p>
      <h1 className="font-display text-6xl leading-none">Rehearse the room before you walk into it.</h1>
      <Link href="/s/demo/debrief" className="w-fit rounded-full bg-ink px-5 py-3 text-sm text-surface">
        Open the sample debrief
      </Link>
    </main>
  );
}
