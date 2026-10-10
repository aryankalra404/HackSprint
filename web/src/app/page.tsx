import Link from "next/link";

// Placeholder until the Brief screen is built.
export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-24 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">DryRun</p>
      <h1 className="font-display text-6xl leading-none">Rehearse the room before you walk into it.</h1>
      <div className="flex flex-wrap gap-3">
        <Link href="/s/demo-prep" className="rounded-full bg-ink px-5 py-3 text-sm text-surface">
          Sample: room briefed
        </Link>
        <Link href="/s/demo" className="rounded-full border border-line bg-surface px-5 py-3 text-sm hover:border-ink">
          Sample: after the session
        </Link>
      </div>
    </main>
  );
}
