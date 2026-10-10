import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Persona, TelemetryEvent } from "@/lib/contract";
import { demoSession } from "@/lib/mock/session";
import { portraitOf, colorOf, personaById } from "@/lib/personas";
import { PersonaAvatar, VerdictPill } from "@/components/ui";

export const metadata = {
  title: "About DryRun",
  description: "DryRun prepares you for every important meeting, rehearses you against the people in it, and follows up afterwards. Built with n8n.",
};

// The sample panel and one exchange from the sample session (a fictional prospect)
const { bundle, telemetry } = demoSession;
const PANEL = [...bundle.personas].sort((a, b) => a.seat - b.seat);
type Turn = Extract<TelemetryEvent, { type: "turn" }>;
const TURNS = (telemetry?.events ?? []).filter((e): e is Turn => e.type === "turn");
const ASKED = TURNS.find((e) => e.mode === "slide_end" && e.reaction?.persona_id === "p1");
const ANSWERED = TURNS.find((e) => e.mode === "answer" && e.asked_by === "p1");

const SOURCES = [
  { name: "Calendar invite", detail: "Who's coming, and when" },
  { name: "Email threads", detail: "What they've already asked you" },
  { name: "Company website", detail: "What they do, where they're going" },
  { name: "News", detail: "What's putting pressure on them" },
  { name: "Your deck", detail: "Claims they'll want proof of" },
  { name: "Last meeting", detail: "What you promised them" },
];

const STAGES: { name: string; title: string; decides: string; does: string[]; you: string }[] = [
  {
    name: "Pre-flight",
    title: "It spots the meeting and briefs you",
    decides: "Is this meeting worth preparing for, and how much?",
    does: [
      "Watches your Google Calendar for new invites",
      "Reads your emails with the attendees, the company's website and the news",
      "Writes a brief that states only sourced facts, and emails it to you",
      "Reads your deck slide by slide: what each person will push on, and cues in case you freeze",
    ],
    you: "Read the brief. Upload your deck.",
  },
  {
    name: "Live",
    title: "You rehearse in front of the room",
    decides: "After this slide, does anyone speak up? Who, and why?",
    does: [
      "Seats the panel in a VR boardroom on Meta Quest, with your slides on the screen",
      "Stakeholders raise a hand and interrupt with questions grounded in the research",
      "If you go quiet, the Rescue Agent steps in: a calm cue, then a keyword, then a bridge phrase",
    ],
    you: "Pitch, answer, recover.",
  },
  {
    name: "Post-flight",
    title: "It scores you and acts on the result",
    decides: "Was each objection resolved, half-answered or dodged? What should you drill?",
    does: [
      "Scores the session with fixed formulas, and cites a moment and a quote for every score",
      "Emails you the report and books a short drill on your calendar",
      "Briefs the panel to press harder on your weak spots next time",
    ],
    you: "Read the report. Run the drill.",
  },
  {
    name: "After the meeting",
    title: "It follows up and remembers",
    decides: "What did each person care about, and what did you promise?",
    does: [
      "Asks how the real meeting went: a one-minute voice note is enough",
      "Drafts the follow-up email, and sends it once you approve",
      "Books the next step and updates what it knows about each person",
    ],
    you: "Talk for a minute. Approve the email.",
  },
];

const DECISIONS = [
  { q: "Is this meeting worth preparing for?", stage: "Pre-flight" },
  { q: "Who will really be in the room, and why?", stage: "Pre-flight" },
  { q: "What will each of them push on, and on which slide?", stage: "Pre-flight" },
  { q: "Does anyone interrupt after this slide, or does the room stay quiet?", stage: "Live" },
  { q: "Did that answer resolve the objection?", stage: "Live" },
  { q: "What's the one thing to drill before the real meeting?", stage: "Post-flight" },
  { q: "What should the follow-up email say?", stage: "After the meeting" },
  { q: "What should it remember about each person?", stage: "After the meeting" },
];

const SOURCE_LABEL: Record<Persona["objections"][number]["source"], string> = {
  deck: "From your deck",
  research: "From research",
  history: "From your last rehearsal",
};

export default function About() {
  return (
    <main>
      <Hero />
      <Problem />
      <HowItWorks />
      <TheRoom />
      <Moment />
      <Memory />
      <WhyN8n />
      <Trust />
      <Closing />
    </main>
  );
}

function Section({ id, tone = "paper", children }: { id?: string; tone?: "paper" | "surface" | "ink"; children: ReactNode }) {
  const bg = { paper: "", surface: "border-y border-line bg-surface", ink: "bg-ink text-surface" }[tone];
  return (
    <section id={id} className={`scroll-mt-4 ${bg}`}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">{children}</div>
    </section>
  );
}

function Heading({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="flex max-w-2xl flex-col gap-3">
      <p className="text-sm font-medium text-muted">{kicker}</p>
      <h2 className="font-display text-3xl leading-tight text-balance sm:text-5xl">{title}</h2>
      {children && <p className="text-base text-ink-2 sm:text-lg">{children}</p>}
    </header>
  );
}

function Hero() {
  return (
    <section className="relative isolate flex min-h-[92dvh] flex-col overflow-hidden bg-ink text-surface">
      <Image
        src="/vr/room_wide.jpg"
        alt="The VR boardroom from the presenter's spot: five stakeholders seated around a long table."
        fill
        priority
        sizes="100vw"
        className="-z-10 object-cover object-[center_75%]"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/60 to-ink/30" />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <Link href="/" className="font-display text-2xl">DryRun</Link>
        <nav className="flex items-center gap-1 text-sm">
          <a href="#how" className="hidden rounded-full px-3 py-2 text-surface/80 hover:text-surface sm:inline">How it works</a>
          <a href="#n8n" className="hidden rounded-full px-3 py-2 text-surface/80 hover:text-surface sm:inline">Why n8n</a>
          <Link href="/" className="rounded-full bg-surface px-4 py-2 font-medium text-ink hover:bg-paper">Open DryRun</Link>
        </nav>
      </header>

      <div className="mx-auto mt-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-14 sm:px-8 sm:pb-20">
        <span className="w-fit rounded-full border border-surface/30 px-3 py-1 text-xs text-surface/80">Built with n8n</span>
        <h1 className="max-w-4xl text-balance font-display text-5xl leading-[1.02] sm:text-7xl">Meet your buyers before you meet your buyers.</h1>
        <p className="max-w-2xl text-base text-surface/80 sm:text-lg">
          DryRun spots your important meetings, researches the people in them and seats them across a boardroom table, so you can rehearse
          the pitch with the people who will question it. After the real meeting, it writes the follow-up and remembers what each of them
          cared about.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/" className="rounded-full bg-surface px-5 py-3 text-sm font-medium text-ink hover:bg-paper">Open DryRun</Link>
          <Link href="/s/demo/report" className="rounded-full border border-surface/40 px-5 py-3 text-sm hover:border-surface">
            See a sample report
          </Link>
        </div>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <Section>
      <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <Heading kicker="The problem" title="Every important meeting starts with an hour of digging.">
          Before a pitch, someone opens the invite, scrolls back through old emails, reads the company&apos;s site and the news, and guesses
          who will ask what. Afterwards, the notes, the follow-up and the next step wait for a free evening. It happens for every meeting,
          and it&apos;s the first thing to slip when the week is busy.
        </Heading>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SOURCES.map((s) => (
            <li key={s.name} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
              <span className="font-medium">{s.name}</span>
              <span className="text-sm text-ink-2">{s.detail}</span>
            </li>
          ))}
          <li className="col-span-2 rounded-2xl bg-ink p-4 text-surface sm:col-span-3">
            <span className="font-display text-lg">DryRun reads all of it, decides what matters and acts, without being asked.</span>
          </li>
        </ul>
      </div>
    </Section>
  );
}

function HowItWorks() {
  return (
    <Section id="how" tone="surface">
      <Heading kicker="How it works" title="Four stages. You do only the part only you can do.">
        n8n runs every stage. The one step it leaves to you is the rehearsal, on purpose.
      </Heading>
      <ol className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STAGES.map((s, i) => (
          <li key={s.name} className="flex flex-col gap-4 rounded-2xl border border-line bg-paper p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-4xl text-axis">{i + 1}</span>
              <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink-2">{s.name}</span>
            </div>
            <h3 className="font-display text-xl leading-snug">{s.title}</h3>
            <p className="rounded-xl bg-surface p-3 text-sm">
              <span className="block text-xs text-muted">n8n decides</span>
              {s.decides}
            </p>
            <ul className="flex flex-col gap-2 text-sm text-ink-2">
              {s.does.map((d) => (
                <li key={d} className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-ink-2" />
                  {d}
                </li>
              ))}
            </ul>
            <p className="mt-auto border-t border-line pt-3 text-sm">
              <span className="text-muted">You: </span>
              {s.you}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function TheRoom() {
  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-end">
        <Heading kicker="The room" title="The people who sign off, not a generic audience.">
          DryRun seats the real attendees from the invite first, then the roles that usually sign off on a deal like yours. Each one comes
          briefed: their priorities, and the objection they&apos;ll raise on a specific slide. Rename, swap or reseat anyone before you
          rehearse.
        </Heading>
        <figure className="relative aspect-[5/3] overflow-hidden rounded-2xl bg-ink">
          <Image
            src="/vr/room_top.jpg"
            alt="The boardroom from above: five stakeholders seated around the table, the presenter's spot at the far end."
            fill
            sizes="(min-width: 1024px) 600px, 100vw"
            className="object-cover"
          />
        </figure>
      </div>

      <ul className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {PANEL.map((p) => {
          const objection = p.objections[0];
          return (
            <li key={p.id} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
              <span className="relative aspect-[4/3] bg-ink">
                <Image src={portraitOf(p.avatar) ?? ""} alt="" fill sizes="(min-width: 1024px) 220px, (min-width: 640px) 30vw, 50vw" className="object-cover" />
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1" style={{ background: colorOf(p.color) }} />
              </span>
              <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
                <div>
                  <p className="font-display text-base">{p.display_name}</p>
                  <p className="text-sm text-ink-2">{p.role}</p>
                </div>
                {objection && (
                  <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
                    <p className="text-sm">&ldquo;{objection.text}&rdquo;</p>
                    <p className="text-xs text-muted">
                      Slide {objection.slide_index + 1}, {SOURCE_LABEL[objection.source].toLowerCase()}
                    </p>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm text-muted">A sample practice panel for Kaveri Freight, a fictional prospect.</p>
    </Section>
  );
}

function Moment() {
  const asker = ASKED?.reaction ? personaById(bundle.personas, ASKED.reaction.persona_id) : undefined;
  if (!ASKED?.reaction || !asker) return null;
  return (
    <Section tone="ink">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:items-start">
        <header className="flex max-w-xl flex-col gap-3">
          <p className="text-sm font-medium text-surface/60">A moment from a rehearsal</p>
          <h2 className="font-display text-3xl leading-tight text-balance sm:text-5xl">They ask what the real room would ask.</h2>
          <p className="text-base text-surface/70 sm:text-lg">
            Most slides pass without a word. When someone does speak up, it&apos;s because something you said, or didn&apos;t say, touched
            what they care about. Every question comes with the reason it was asked, and every answer gets a verdict.
          </p>
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-surface/15 p-5">
            <p className="text-sm text-surface/60">If you freeze, the Rescue Agent steps in on the confidence monitor</p>
            <ol className="flex flex-col gap-2 text-sm">
              <RescueCue after="3 s" kind="Calm" text="Take a breath. You're on pricing." />
              <RescueCue after="6 s" kind="Keyword" text="Payback at 400 trucks" />
              <RescueCue after="10 s" kind="Bridge" text="The simplest way to see the value is…" />
            </ol>
          </div>
        </header>

        <ol className="flex flex-col gap-4">
          <Line who="You" meta={`Slide ${ASKED.slide_index + 1}`}>
            <p className="text-surface/80">{ASKED.transcript}</p>
          </Line>
          <Line who={asker.display_name} meta={asker.role} persona={asker}>
            <p className="font-display text-xl leading-snug">{ASKED.reaction.text}</p>
            <p className="mt-3 rounded-xl bg-surface/10 p-3 text-sm text-surface/80">
              <span className="block text-xs text-surface/50">Why {asker.display_name.split(" ")[0]} asked</span>
              {ASKED.reaction.reason}
            </p>
          </Line>
          {ANSWERED && (
            <Line who="You" meta="Your answer">
              <p className="text-surface/80">{ANSWERED.transcript}</p>
              {ANSWERED.answer_verdict && (
                <div className="mt-3 w-fit rounded-full bg-surface">
                  <VerdictPill verdict={ANSWERED.answer_verdict} />
                </div>
              )}
            </Line>
          )}
        </ol>
      </div>
    </Section>
  );
}

function Line({ who, meta, persona, children }: { who: string; meta: string; persona?: Persona; children: ReactNode }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-surface/15 p-5">
      {persona ? (
        <PersonaAvatar persona={persona} size={44} />
      ) : (
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-surface/30 text-xs">
          You
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-sm">
          <span className="font-medium">{who}</span>
          <span className="text-surface/50">, {meta}</span>
        </p>
        {children}
      </div>
    </li>
  );
}

function RescueCue({ after, kind, text }: { after: string; kind: string; text: string }) {
  return (
    <li className="grid grid-cols-[3.5rem_5rem_1fr] items-baseline gap-2">
      <span className="text-surface/50">{after}</span>
      <span className="font-medium">{kind}</span>
      <span className="text-surface/80">{text}</span>
    </li>
  );
}

function Memory() {
  const priya = bundle.personas.find((p) => p.id === "p4");
  return (
    <Section tone="surface">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
        <Heading kicker="Memory" title="It remembers people, not meetings.">
          DryRun keeps a profile of everyone you meet, keyed by their email. You never mark a meeting as a one-off or a regular: the second
          time someone appears on an invite, DryRun already knows them, writes a catch-up brief instead of starting from scratch, and their
          seat in the next rehearsal opens with what they actually raised last time.
        </Heading>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-paper p-5 sm:p-6">
            <div className="flex items-center gap-3">
              {priya && <PersonaAvatar persona={priya} size={48} />}
              <div>
                <p className="font-display text-lg">Priya Nair</p>
                <p className="text-sm text-ink-2">VP Operations, Kaveri Freight. Met 3 times.</p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs text-muted">Since last time</p>
              <ul className="flex flex-col gap-2 text-sm">
                <li className="flex gap-2"><Dot />Asked whether the rollout would overlap the festive peak</li>
                <li className="flex gap-2"><Dot />You promised a case study from another carrier: not sent yet</li>
                <li className="flex gap-2"><Dot />Brought her head of IT to the second meeting</li>
              </ul>
            </div>
          </div>

          <ul className="grid gap-3 sm:grid-cols-3">
            <Triage title="Full brief" body="New people from outside your company, and a meeting that matters." />
            <Triage title="Catch-up brief" body="People you've met before: only what's changed and what's still open." />
            <Triage title="Skip" body="Internal syncs and routine calls. It says why it skipped." />
          </ul>
        </div>
      </div>
    </Section>
  );
}

function Dot() {
  return <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-ink-2" />;
}

function Triage({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex flex-col gap-1 rounded-2xl border border-line p-4">
      <span className="font-medium">{title}</span>
      <span className="text-sm text-ink-2">{body}</span>
    </li>
  );
}

function WhyN8n() {
  return (
    <Section id="n8n">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
        <Heading kicker="Why n8n" title="The decisions live in n8n, where you can see them.">
          The headset and the browser only listen, render and play audio. Every judgement is made by an n8n workflow using Gemini, and each
          one is logged with its reason, so you can open the run and see exactly why DryRun prepared a meeting, seated a person or asked a
          question.
        </Heading>
        <ol className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
          {DECISIONS.map((d, i) => (
            <li key={d.q} className="flex items-baseline gap-4 px-5 py-4">
              <span className="w-5 shrink-0 text-sm text-muted">{i + 1}</span>
              <span className="flex-1">{d.q}</span>
              <span className="shrink-0 text-xs text-muted">{d.stage}</span>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

function Trust() {
  const points = [
    { title: "Facts in the brief", body: "The emailed brief names only the real attendees and news from cited sources. Nothing is guessed." },
    { title: "Practice is labelled", body: "Roles DryRun adds to rehearse against are marked as practice, and never appear in the brief." },
    { title: "Your inbox, your call", body: "It reads only your own calendar and email, and sends nothing to anyone else until you approve it." },
    { title: "No recording others", body: "After a meeting, your own one-minute voice note is enough. Transcripts are used only if you already keep them." },
  ];
  return (
    <Section tone="surface">
      <Heading kicker="Trust" title="It works for you, not on the people you meet." />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {points.map((p) => (
          <li key={p.title} className="flex flex-col gap-2 rounded-2xl border border-line bg-paper p-5">
            <span className="font-display text-lg">{p.title}</span>
            <span className="text-sm text-ink-2">{p.body}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Closing() {
  const stack = ["n8n", "Gemini", "Google Calendar", "Gmail", "Unity on Meta Quest 3S", "Next.js"];
  return (
    <section className="bg-ink text-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-8 sm:py-24">
        <h2 className="max-w-3xl text-balance font-display text-4xl leading-tight sm:text-6xl">Your next important meeting is already on your calendar.</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/" className="rounded-full bg-surface px-5 py-3 text-sm font-medium text-ink hover:bg-paper">Open DryRun</Link>
          <Link href="/s/demo" className="rounded-full border border-surface/40 px-5 py-3 text-sm hover:border-surface">
            See a finished session
          </Link>
        </div>
        <footer className="mt-8 flex flex-col gap-4 border-t border-surface/15 pt-8 text-sm text-surface/60 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-surface">Built by Git Push and Pray</p>
            <p>HackSprint 2026, MAHE Bengaluru. Track AI and Automation, problem statement 22: Built with n8n.</p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {stack.map((s) => (
              <li key={s} className="rounded-full border border-surface/20 px-3 py-1 text-xs">{s}</li>
            ))}
          </ul>
        </footer>
      </div>
    </section>
  );
}
