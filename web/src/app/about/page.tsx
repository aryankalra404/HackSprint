import Image from "next/image";
import Link from "next/link";
import type { TelemetryEvent } from "@/lib/contract";
import { demoSession } from "@/lib/mock/session";
import { portraitOf, colorOf, personaById } from "@/lib/personas";
import { PersonaAvatar } from "@/components/ui";

export const metadata = {
  title: "About DryRun",
  description: "Meet your buyers before you meet your buyers. DryRun prepares you for every important meeting and rehearses you against the people in it. Built with n8n.",
};

// The sample panel and one question from the sample session (a fictional prospect)
const { bundle, telemetry } = demoSession;
const PANEL = [...bundle.personas].sort((a, b) => a.seat - b.seat);
const QUESTION = (telemetry?.events ?? []).find(
  (e): e is Extract<TelemetryEvent, { type: "turn" }> => e.type === "turn" && e.mode === "slide_end" && !!e.reaction,
)?.reaction;
const ASKER = QUESTION ? personaById(bundle.personas, QUESTION.persona_id) : undefined;

const STAGES = [
  { name: "Pre-flight", line: "Spots the meeting on your calendar, researches the people and briefs you." },
  { name: "Live", line: "You pitch. The room interrupts. If you freeze, the Rescue Agent cues you." },
  { name: "Post-flight", line: "Scores you with evidence, then books a drill on your weakest moment." },
  { name: "After", line: "Drafts the follow-up and remembers what each person cared about." },
];

export default function About() {
  return (
    <main className="bg-ink text-surface">
      <Hero />
      <Cast />
      <Still />
      <Stages />
      <Closing />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative isolate flex h-dvh min-h-[560px] flex-col overflow-hidden">
      <Image
        src="/vr/room_wide.jpg"
        alt="The VR boardroom from the presenter's spot: five stakeholders seated around a long table."
        fill
        priority
        sizes="100vw"
        className="-z-10 object-cover object-[center_70%]"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/40 to-ink/30" />

      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-8">
        <span className="font-display text-2xl">DryRun</span>
        <Link href="/" className="rounded-full bg-surface/10 px-4 py-2 text-sm backdrop-blur hover:bg-surface/20">
          Open DryRun
        </Link>
      </header>

      <div className="mx-auto mt-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-20 sm:px-8 sm:pb-24">
        <h1 className="max-w-5xl text-balance font-display text-5xl leading-[0.98] sm:text-8xl">
          Meet your buyers before you meet your buyers.
        </h1>
        <p className="max-w-lg text-base text-surface/75 sm:text-lg">
          Rehearse your next pitch in front of the people who will question it.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/" className="rounded-full bg-surface px-6 py-3 text-sm font-medium text-ink hover:bg-paper">Get started</Link>
          <Link href="/s/demo/report" className="rounded-full border border-surface/40 px-6 py-3 text-sm hover:border-surface">
            See a sample report
          </Link>
        </div>
      </div>

      <a href="#cast" aria-label="Scroll down" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-surface/60 hover:text-surface sm:block">
        <svg viewBox="0 0 24 24" className="size-6 motion-safe:animate-bounce" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </a>
    </section>
  );
}

function Cast() {
  return (
    <section id="cast" className="mx-auto max-w-7xl px-4 py-24 sm:px-8 sm:py-32">
      <h2 className="max-w-2xl text-balance font-display text-4xl leading-tight sm:text-6xl">Your buyers, briefed.</h2>
      <p className="mt-4 max-w-md text-surface/60">
        Real attendees from the invite, plus the roles that sign off. Each one knows your deck and their company.
      </p>
      <ul className="mt-14 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0">
        {PANEL.map((p) => (
          <li key={p.id} className="group w-[62vw] shrink-0 snap-start sm:w-auto">
            <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-ink-2">
              <Image
                src={portraitOf(p.avatar) ?? ""}
                alt=""
                fill
                sizes="(min-width: 640px) 20vw, 62vw"
                className="object-cover transition duration-500 group-hover:scale-105"
              />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/0 to-ink/0" />
              {p.objections[0] && (
                <p className="absolute inset-x-0 bottom-0 p-4 text-sm leading-snug opacity-0 transition duration-300 group-hover:opacity-100">
                  &ldquo;{p.objections[0].text}&rdquo;
                </p>
              )}
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1" style={{ background: colorOf(p.color) }} />
            </div>
            <p className="mt-3 font-display text-base">{p.display_name}</p>
            <p className="text-sm text-surface/60">{p.role}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-surface/40">Sample practice panel for a fictional prospect.</p>
    </section>
  );
}

function Still() {
  return (
    <section className="relative isolate flex min-h-[80dvh] items-end overflow-hidden sm:min-h-dvh">
      <Image
        src="/vr/room_top.jpg"
        alt="The boardroom from above, with the stakeholders seated around the table."
        fill
        sizes="100vw"
        className="-z-10 object-cover"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/30 to-ink/50" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-16 sm:px-8 sm:pb-24">
        <h2 className="max-w-3xl text-balance font-display text-4xl leading-tight sm:text-6xl">They ask what the real room would ask.</h2>
        {QUESTION && ASKER && (
          <figure className="flex max-w-xl gap-4 rounded-2xl bg-ink/70 p-5 backdrop-blur-md">
            <PersonaAvatar persona={ASKER} size={48} />
            <div>
              <blockquote className="font-display text-lg leading-snug sm:text-xl">{QUESTION.text}</blockquote>
              <figcaption className="mt-2 text-sm text-surface/60">
                {ASKER.display_name}, {ASKER.role}
              </figcaption>
            </div>
          </figure>
        )}
      </div>
    </section>
  );
}

function Stages() {
  return (
    <section className="bg-paper text-ink">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-8 sm:py-32">
        <h2 className="max-w-2xl text-balance font-display text-4xl leading-tight sm:text-6xl">n8n does the rest.</h2>
        <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {STAGES.map((s, i) => (
            <li key={s.name} className="flex flex-col gap-3 border-t border-ink pt-5">
              <span className="font-display text-5xl text-axis">{i + 1}</span>
              <h3 className="font-display text-2xl">{s.name}</h3>
              <p className="text-ink-2">{s.line}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-24 sm:px-8 sm:py-32">
      <h2 className="max-w-4xl text-balance font-display text-4xl leading-tight sm:text-7xl">Your next big meeting is already on your calendar.</h2>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className="rounded-full bg-surface px-6 py-3 text-sm font-medium text-ink hover:bg-paper">Get started</Link>
        <Link href="/s/demo" className="rounded-full border border-surface/40 px-6 py-3 text-sm hover:border-surface">
          See a finished session
        </Link>
      </div>
      <footer className="mt-10 flex flex-col gap-2 border-t border-surface/15 pt-8 text-sm text-surface/50 sm:flex-row sm:justify-between">
        <span>Built with n8n by Git Push and Pray</span>
        <span>HackSprint 2026, MAHE Bengaluru</span>
      </footer>
    </section>
  );
}
