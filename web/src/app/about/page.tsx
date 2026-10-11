import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { PanelMember } from "@/lib/contract";
import { demoMeetingDetail } from "@/lib/mock/meetings";
import { demoProposal } from "@/lib/mock/panel";
import { PersonaAvatar, RoleTag, StatusIcon } from "@/components/ui";

export const metadata = {
  title: "About DryRun",
  description:
    "DryRun watches your calendar, researches the people you're about to meet, emails you a sourced brief and lets you rehearse the pitch in front of them. Built with n8n.",
};

// Everything shown in the product previews is the sample meeting (a fictional prospect)
const { meeting, brief } = demoMeetingDetail;
const PANEL = [...demoProposal.members].sort((a, b) => a.seat - b.seat);

// The same labels as the practice page: real attendees come from the invite, everyone else is practice
const SOURCE: Record<PanelMember["source"], string> = {
  email: "In the invite",
  research: "Practice role",
  deck: "Practice role",
  typical: "Practice role",
};

export default function About() {
  return (
    <div className="bg-paper text-ink">
      <main>
        <Hero />
        <How />
        <Pipeline />
        <Next />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative isolate flex h-dvh min-h-[560px] flex-col overflow-hidden text-surface">
      <Image
        src="/vr/room_wide.jpg"
        alt="The VR boardroom from the presenter's spot: five stakeholders seated around a long table."
        fill
        preload
        sizes="100vw"
        className="-z-10 object-cover object-[center_70%]"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/40 to-ink/30" />

      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-4 py-5 sm:px-8">
        <Link href="/about" className="font-display text-2xl">
          DryRun
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-surface/85 md:flex">
          <a href="#how" className="hover:text-surface">How it works</a>
          <a href="#n8n" className="hover:text-surface">n8n workflow</a>
          <a href="#next" className="hover:text-surface">What&apos;s next</a>
        </nav>
        <Link href="/" className="rounded-full bg-surface/10 px-4 py-2 text-sm backdrop-blur hover:bg-surface/20">
          Open DryRun
        </Link>
      </header>

      <div className="mx-auto mt-auto flex w-full max-w-7xl flex-col px-4 pb-20 sm:px-8 sm:pb-24">
        <h1 className="max-w-3xl text-balance font-display text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
          Rehearse the meeting before it happens.
        </h1>
        <p className="mt-5 max-w-xl text-pretty text-base text-surface/80 sm:text-lg">
          DryRun spots the meetings that matter on your calendar, researches the people coming and seats them in a VR
          boardroom, so you can pitch to them first.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="rounded-full bg-surface px-6 py-3 text-sm font-medium text-ink hover:bg-paper">Get started</Link>
          <Link href="/s/demo/report" className="rounded-full border border-surface/40 px-6 py-3 text-sm hover:border-surface">
            See a sample report
          </Link>
        </div>
      </div>

      <a href="#how" aria-label="Scroll down" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-surface/60 hover:text-surface sm:block">
        <svg viewBox="0 0 24 24" className="size-6 motion-safe:animate-bounce" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </a>
    </section>
  );
}

// The flow, in order. The index at the top and the rows below share these labels.
const STAGES = [
  {
    id: "meetings",
    label: "Your calendar",
    title: "It picks the meetings worth preparing for.",
    body: "Every new Google Calendar event goes to n8n. Gemini reads the invite and who's coming, decides whether it needs preparing and tells you why. You can also add a meeting by hand.",
    points: ["Runs on its own, no button to press", "You watch each step live, with a link to the n8n run"],
    visual: <ProgressPreview />,
  },
  {
    id: "brief",
    label: "The brief",
    title: "A brief that only states facts.",
    body: "n8n reads your recent emails with the attendees, the company's news and its website, and searches the web when the news is thin. Then it writes who's coming, what each of them cares about, what they'll ask and where you're exposed. It lands in your inbox.",
    points: ["Real attendees only, no guessed roles", "Every news item is dated and links to its source"],
    visual: <BriefPreview />,
  },
  {
    id: "panel",
    label: "The practice panel",
    title: "Rehearse with the people who'll be in the room.",
    body: "n8n proposes a panel: the attendees from the invite, plus the people who usually sign off on a deal like this, each with a reason. Swap anyone, change a face or a chair, up to six people.",
    points: ["Practice roles are always labelled as practice", "Every change shows up in the headset straight away"],
    visual: <PanelPreview />,
  },
  {
    id: "room",
    label: "The room",
    title: "Then pitch to them in VR.",
    body: "Put on a Meta Quest and you're at the head of the table, with the panel in the chairs you chose and your slides on the screen. Start talking and the session starts; they turn to look at you. The big screen shows what you see, so your team can watch along.",
    points: ["The next slide and the time on a monitor only you can see", "No headset? The practice page runs the same room on your laptop"],
    visual: <RoomPreview />,
  },
];

function How() {
  return (
    <section id="how" className="border-t border-line bg-surface/50">
      <div className="mx-auto max-w-6xl px-4 pt-20 sm:px-6 sm:pt-28">
        <SectionHead eyebrow="How it works" title="From calendar invite to rehearsal, without asking." />
        <ol className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
          {STAGES.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="flex h-full items-baseline gap-3 bg-surface px-5 py-4 text-sm hover:bg-paper">
                <span className="font-display text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-medium">{s.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        {STAGES.map((s, i) => (
          <Stage key={s.id} n={i + 1} {...s} />
        ))}
      </div>
    </section>
  );
}

// One step of the flow: the words on the left, the app preview on the right
function Stage({ id, n, label, title, body, points, visual }: (typeof STAGES)[number] & { n: number }) {
  return (
    <article id={id} className="grid scroll-mt-20 gap-8 border-b border-line py-16 last:border-b-0 sm:py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div className="min-w-0">
        <p className="flex items-baseline gap-3 text-sm">
          <span className="font-display text-muted">{String(n).padStart(2, "0")}</span>
          <span className="font-medium text-ink-2">{label}</span>
        </p>
        <h3 className="mt-4 text-balance font-display text-2xl leading-tight sm:text-3xl">{title}</h3>
        <p className="mt-4 text-pretty text-ink-2">{body}</p>
        <ul className="mt-6 flex flex-col gap-3 text-sm">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5">
              <StatusIcon tone="good" className="mt-0.5 size-4 shrink-0 text-good-ink" />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0">{visual}</div>
    </article>
  );
}

function SectionHead({ eyebrow, title, invert = false }: { eyebrow: string; title: string; invert?: boolean }) {
  return (
    <div>
      <p className={`text-sm font-medium ${invert ? "text-surface/60" : "text-muted"}`}>{eyebrow}</p>
      <h2 className="mt-3 max-w-2xl text-balance font-display text-3xl leading-tight sm:text-4xl">{title}</h2>
    </div>
  );
}

// A product screen in a window frame, so it reads as the app and not as decoration
function Window({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xl shadow-ink/5">
      <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span key={i} aria-hidden="true" className="size-2.5 rounded-full bg-line" />
        ))}
        <span className="ml-3 truncate text-xs text-muted">{label}</span>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
      <figcaption className="border-t border-line px-5 py-2.5 text-xs text-muted sm:px-6">Sample meeting with a fictional prospect</figcaption>
    </figure>
  );
}

const PROGRESS: { label: string; detail: string; state: "done" | "running" | "pending" }[] = [
  { label: "Decide", detail: "Worth preparing: the CFO wants a payback number", state: "done" },
  { label: "Emails", detail: "Read 4 recent emails with Priya Nair and Rajiv Menon", state: "done" },
  { label: "Research", detail: "Reading the news about Kaveri Freight and their website", state: "running" },
  { label: "Brief", detail: "Writing your brief and the hardest questions", state: "pending" },
  { label: "Panel", detail: "Seating the practice panel", state: "pending" },
  { label: "Email", detail: "Emailing you the brief", state: "pending" },
];

function ProgressPreview() {
  return (
    <Window label="Your meetings">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-lg">
            {meeting.title} <span className="font-sans text-sm font-normal text-muted">{meeting.company}</span>
          </p>
          <p className="mt-1 text-sm text-ink-2">With {meeting.attendees.map((a) => a.name).join(", ")}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs">
          <span aria-hidden="true" className="size-2 rounded-full bg-warn motion-safe:animate-pulse" />
          n8n is researching
        </span>
      </div>
      <ol className="mt-6 flex flex-col">
        {PROGRESS.map((s, i) => (
          <li key={s.label} className="relative flex gap-3 pb-4 last:pb-0">
            {i < PROGRESS.length - 1 && <span aria-hidden="true" className="absolute top-5 bottom-0 left-[9px] w-px bg-line" />}
            <StepDot state={s.state} />
            <div className="min-w-0">
              <p className={`text-sm font-medium ${s.state === "pending" ? "text-muted" : ""}`}>{s.label}</p>
              <p className={`text-sm ${s.state === "pending" ? "text-muted" : "text-ink-2"}`}>{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </Window>
  );
}

function StepDot({ state }: { state: "done" | "running" | "pending" }) {
  if (state === "done")
    return (
      <span className="relative flex size-[19px] shrink-0 items-center justify-center rounded-full bg-ink text-surface">
        <StatusIcon tone="good" className="size-3" />
      </span>
    );
  if (state === "running")
    return (
      <span className="relative flex size-[19px] shrink-0 items-center justify-center rounded-full border-2 border-ink bg-surface">
        <span className="size-1.5 rounded-full bg-ink motion-safe:animate-pulse" />
      </span>
    );
  return <span className="relative size-[19px] shrink-0 rounded-full border-2 border-line bg-surface" />;
}

function BriefPreview() {
  if (!brief) return null;
  return (
    <Window label={`Brief: ${meeting.title}, ${meeting.company}`}>
      <p className="text-sm text-ink-2">{brief.summary}</p>
      <h3 className="mt-6 text-xs font-medium text-muted">Who&apos;s coming</h3>
      <ul className="mt-2 divide-y divide-line">
        {brief.attendees.map((a) => (
          <li key={a.email} className="py-2.5 text-sm">
            <span className="font-medium">{a.name}</span>
            <span className="text-muted">, {a.role}</span>
            <p className="text-ink-2">{a.likely_focus}</p>
          </li>
        ))}
      </ul>
      <h3 className="mt-5 text-xs font-medium text-muted">They&apos;ll likely ask</h3>
      <div className="mt-2 rounded-xl bg-paper p-4">
        <p className="font-medium">&ldquo;{brief.questions[0].question}&rdquo;</p>
        <p className="mt-1 text-sm text-muted">
          {brief.questions[0].asked_by}, because {brief.questions[0].why.charAt(0).toLowerCase() + brief.questions[0].why.slice(1)}
        </p>
        <p className="mt-3 text-sm">
          <span className="font-medium">Suggested answer: </span>
          {brief.questions[0].suggested_answer}
        </p>
      </div>
      <h3 className="mt-5 text-xs font-medium text-muted">Where you&apos;re exposed</h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {brief.risks.map((r) => (
          <li key={r} className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2.5 py-1 text-xs font-medium text-warn-ink">
            <StatusIcon tone="warn" />
            {r}
          </li>
        ))}
      </ul>
    </Window>
  );
}

function PanelPreview() {
  return (
    <Window label={`Practice panel: ${meeting.title}`}>
      <ul className="divide-y divide-line">
        {PANEL.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-3 first:pt-0">
            <PersonaAvatar persona={m} size={40} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">{m.display_name}</span>
                <RoleTag persona={m} />
              </p>
              <p className="truncate text-xs text-muted">{m.why}</p>
            </div>
            <span
              className={`hidden shrink-0 rounded-full px-2.5 py-1 text-xs sm:inline ${
                m.source === "email" ? "bg-ink text-surface" : "border border-line text-ink-2"
              }`}
            >
              {SOURCE[m.source]}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-xs">
        <span className="text-muted">n8n also suggests</span>
        {demoProposal.suggestions.map((s) => (
          <span key={s.role} className="rounded-full border border-dashed border-axis px-2.5 py-1 text-ink-2">
            + {s.role_short}
          </span>
        ))}
      </div>
    </Window>
  );
}

function RoomPreview() {
  return (
    <figure className="overflow-hidden rounded-2xl border border-line bg-ink shadow-xl shadow-ink/5">
      <div className="relative aspect-[16/10]">
        <Image
          src="/vr/room_top.jpg"
          alt="The boardroom from above, with the practice panel seated around the table."
          fill
          sizes="(min-width: 1152px) 640px, 100vw"
          className="object-cover"
        />
      </div>
      <figcaption className="border-t border-surface/10 px-5 py-2.5 text-xs text-surface/60 sm:px-6">
        The boardroom from above, with the practice panel seated
      </figcaption>
    </figure>
  );
}

const NODES = [
  { tool: "Google Calendar", step: "A new event starts the run" },
  { tool: "Gemini", step: "Decides if it's worth preparing, and says why" },
  { tool: "Gmail", step: "Reads your threads with the attendees" },
  { tool: "News and website", step: "Researches the company, and searches the web if the news is thin" },
  { tool: "Gemini", step: "Writes the brief and seats the panel" },
  { tool: "Data table and Gmail", step: "Saves it for the app and emails you" },
];

function Pipeline() {
  return (
    <section id="n8n" className="scroll-mt-16 bg-ink text-surface">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHead eyebrow="Under the hood" title="Every decision runs in n8n." invert />
        <p className="mt-5 max-w-2xl text-pretty text-surface/65">
          The web app and the headset only show things and capture your voice. n8n decides, researches, writes and sends,
          and reports every step back as it goes. If a step fails, you get told instead of left waiting.
        </p>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-surface/15 bg-surface/15 sm:grid-cols-2 lg:grid-cols-3">
          {NODES.map((n, i) => (
            <li key={i} className="flex gap-4 bg-ink p-6">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-surface/25 font-display text-xs text-surface/70">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="font-display">{n.tool}</p>
                <p className="mt-1 text-sm text-surface/65">{n.step}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-surface/45">
          Two live workflows on n8n Cloud: DryRun prep (above) and DryRun meetings API, which serves the web app.
        </p>
      </div>
    </section>
  );
}

const NEXT = [
  { title: "They interrupt", line: "The panel asks questions mid-pitch, by voice, grounded in the brief and your slides." },
  { title: "A rescue when you freeze", line: "Go quiet and a cue appears. It's written in advance, so it never waits on the network." },
  { title: "A debrief that pushes back", line: "n8n scores each answer with evidence, then makes the next run harder where you were weak." },
];

function Next() {
  return (
    <section id="next" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-20 sm:px-6 sm:pt-28">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHead eyebrow="Being built" title="What's next for the room." />
        <Link href="/s/demo/report" className="text-sm underline underline-offset-4 hover:text-ink-2">
          Preview the debrief with sample data
        </Link>
      </div>
      <ul className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
        {NEXT.map((n) => (
          <li key={n.title} className="bg-surface p-6">
            <h3 className="font-display text-lg">{n.title}</h3>
            <p className="mt-2 text-sm text-ink-2">{n.line}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The page ends where it started: in the room
function Closing() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <div className="relative isolate overflow-hidden rounded-3xl bg-ink text-surface">
        <Image
          src="/vr/room_wide.jpg"
          alt=""
          fill
          sizes="(min-width: 1152px) 1104px, 100vw"
          className="-z-10 object-cover object-[center_70%]"
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/85 to-ink/30" />
        <div className="max-w-xl px-6 py-14 sm:px-12 sm:py-20">
          <h2 className="text-balance font-display text-3xl leading-tight sm:text-4xl">
            Your next big meeting is already on your calendar.
          </h2>
          <p className="mt-4 text-pretty text-surface/75">
            See what n8n has prepared for it, or add a meeting by hand and watch it get ready.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/" className="rounded-full bg-surface px-6 py-3 text-sm font-medium text-ink hover:bg-paper">
              Open DryRun
            </Link>
            <Link href="/new" className="rounded-full border border-surface/40 px-6 py-3 text-sm hover:border-surface">
              Add a meeting
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const FOOTER_LINKS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "The app",
    links: [
      { label: "Your meetings", href: "/" },
      { label: "Add a meeting", href: "/new" },
      { label: "Sample report", href: "/s/demo/report" },
    ],
  },
  {
    title: "The project",
    links: [
      { label: "How it works", href: "#how" },
      { label: "The n8n workflow", href: "#n8n" },
      { label: "Source on GitHub", href: "https://github.com/aryankalra404/HackSprint" },
    ],
  },
];

const BUILT_WITH = ["n8n", "Google Calendar", "Gmail", "Gemini", "Meta Quest"];

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-14 sm:grid-cols-3 sm:px-6 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="col-span-2 max-w-xs sm:col-span-3 lg:col-span-1">
          <Link href="/about" className="font-display text-xl">
            DryRun
          </Link>
          <p className="mt-3 text-sm text-ink-2">
            Prepares you for high-stakes meetings and lets you rehearse them. n8n does the research; you do the talking.
          </p>
        </div>
        {FOOTER_LINKS.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-medium">{col.title}</h3>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.href.startsWith("http") ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className="hover:text-ink">
                      {l.label}
                    </a>
                  ) : l.href.startsWith("#") ? (
                    <a href={l.href} className="hover:text-ink">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="hover:text-ink">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <h3 className="text-sm font-medium">Built with</h3>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-2">
            {BUILT_WITH.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-muted sm:flex-row sm:justify-between sm:px-6">
          <span>Made by Git Push and Pray for HackSprint 2026, MAHE Bengaluru</span>
          <span>Track T.02 AI and Automation, PS 22: Built with n8n</span>
        </div>
      </div>
    </footer>
  );
}
