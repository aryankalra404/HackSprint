import Image from "next/image";
import Link from "next/link";
import { demoSession } from "@/lib/mock/session";
import { portraitOf, colorOf } from "@/lib/personas";

// An example panel, as n8n proposed it for the sample prospect
const PANEL = [...demoSession.bundle.personas].sort((a, b) => a.seat - b.seat);

const STEPS = [
  { n: "1", title: "Brief", body: "Upload your deck, name the prospect and paste the meeting email. n8n researches the company, proposes who will be in the room and why, and briefs whoever you confirm." },
  { n: "2", title: "Rehearse", body: "Pitch in the VR boardroom or the browser. The panel interrupts with grounded questions, and the Rescue Agent cues you when you freeze." },
  { n: "3", title: "Debrief", body: "n8n scores you with evidence, sends the report, books a drill on your weakest slide, and briefs the panel to press harder there next time." },
];

export default function Home() {
  return (
    <main>
      <section className="relative isolate flex min-h-[88dvh] flex-col justify-end overflow-hidden bg-ink text-surface">
        <Image
          src="/vr/room_wide.jpg"
          alt="The VR boardroom from the presenter's spot: five stakeholders seated around a long table."
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover object-[center_75%]"
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/50 to-ink/20" />

        <header className="absolute inset-x-0 top-0 mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
          <span className="font-display text-2xl">DryRun</span>
          <span className="rounded-full border border-surface/30 px-3 py-1 text-xs text-surface/80">Built with n8n</span>
        </header>

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-14 sm:px-8 sm:pb-20">
          <h1 className="max-w-3xl font-display text-5xl leading-[1.02] sm:text-7xl">Rehearse the room before you walk into it.</h1>
          <p className="max-w-xl text-base text-surface/80 sm:text-lg">
            Pitch to an AI buying committee that has researched your prospect. They interrupt, push back and decide, and you find out
            why before the real meeting.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/new" className="rounded-full bg-surface px-5 py-3 text-sm font-medium text-ink hover:bg-paper">
              Start a rehearsal
            </Link>
            <Link href="/s/demo" className="rounded-full border border-surface/40 px-5 py-3 text-sm hover:border-surface">
              See a finished session
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
        <h2 className="font-display text-3xl sm:text-4xl">Who&apos;s in the room</h2>
        <p className="mt-2 max-w-xl text-ink-2">
          n8n reads the meeting email, your deck and its research, then proposes the panel: real attendees first, then the roles that sign off
          on a deal like yours. Rename, swap or add anyone before you rehearse. This is the panel it proposed for {demoSession.bundle.prospect.company}.
        </p>
        <ul className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
          {PANEL.map((p) => (
            <li key={p.id} className="flex flex-col gap-3">
              <span className="relative aspect-square overflow-hidden rounded-2xl bg-ink">
                <Image src={portraitOf(p.avatar) ?? ""} alt="" fill sizes="(min-width: 1024px) 220px, 45vw" className="object-cover" />
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1" style={{ background: colorOf(p.color) }} />
              </span>
              <span className="flex flex-col">
                <span className="font-display text-base">{p.display_name}</span>
                <span className="text-sm text-ink-2">{p.role}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line bg-surface">
        <ol className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-8 sm:py-20 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex flex-col gap-3">
              <span className="font-display text-5xl text-axis">{s.n}</span>
              <h3 className="font-display text-xl">{s.title}</h3>
              <p className="text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
