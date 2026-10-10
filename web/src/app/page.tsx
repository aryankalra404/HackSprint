import Image from "next/image";
import Link from "next/link";
import { PERSONA_PORTRAIT, PERSONA_STYLE } from "@/lib/personas";
import type { PersonaId } from "@/lib/contract";

const PANEL: PersonaId[] = ["cfo", "cto", "procurement", "vp_ops", "end_user_lead"];

const STEPS = [
  { n: "1", title: "Brief", body: "Upload your deck and name the prospect. n8n researches the company and briefs five stakeholders, each with their own priorities and objections." },
  { n: "2", title: "Rehearse", body: "Pitch in the VR boardroom or the browser. The panel interrupts with grounded questions, and the Rescue Agent cues you when you freeze." },
  { n: "3", title: "Debrief", body: "n8n scores you with evidence, sends the report, books a drill on your weakest slide, and briefs the panel to press harder there next time." },
];

// Placeholder until the Brief screen is built.
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
            <Link href="/s/demo" className="rounded-full bg-surface px-5 py-3 text-sm font-medium text-ink hover:bg-paper">
              See a debriefed session
            </Link>
            <Link href="/s/demo-prep" className="rounded-full border border-surface/40 px-5 py-3 text-sm hover:border-surface">
              See a briefed room
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
        <h2 className="font-display text-3xl sm:text-4xl">The panel</h2>
        <p className="mt-2 max-w-xl text-ink-2">Five seats, five agendas. Names and objections are generated for each prospect.</p>
        <ul className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
          {PANEL.map((id) => (
            <li key={id} className="flex flex-col gap-3">
              <span className="relative aspect-square overflow-hidden rounded-2xl bg-ink">
                <Image src={PERSONA_PORTRAIT[id]!} alt="" fill sizes="(min-width: 1024px) 220px, 45vw" className="object-cover" />
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1" style={{ background: PERSONA_STYLE[id].color }} />
              </span>
              <span className="text-sm font-medium">{PERSONA_STYLE[id].role}</span>
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
