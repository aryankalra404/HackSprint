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
      <Nav />
      <main>
        <Hero />
        <Steps />
        <Feature
          id="meetings"
          eyebrow="Your calendar"
          title="It picks the meetings worth preparing for."
          body="Every new Google Calendar event goes to n8n. Gemini reads the invite and who's coming, decides whether it needs preparing and tells you why. You can also add a meeting by hand."
          points={["Runs on its own, no button to press", "You watch each step live, with a link to the n8n run"]}
          visual={<ProgressPreview />}
        />
        <Feature
          id="brief"
          eyebrow="The brief"
          title="A brief that only states facts."
          body="n8n reads your recent emails with the attendees, the company's news and its website, and searches the web when the news is thin. Then it writes who's coming, what each of them cares about, what they'll ask and where you're exposed. It lands in your inbox."
          points={["Real attendees only, no guessed roles", "Every news item is dated and links to its source"]}
          visual={<BriefPreview />}
          flip
        />
        <Feature
          id="panel"
          eyebrow="The practice panel"
          title="Rehearse with the people who'll be in the room."
          body="n8n proposes a panel: the attendees from the invite, plus the people who usually sign off on a deal like this, each with a reason. Swap anyone, change a face or a chair, up to six people."
          points={["Practice roles are always labelled as practice", "Every change shows up in the headset straight away"]}
          visual={<PanelPreview />}
        />
        <Room />
        <Pipeline />
        <Next />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-paper/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/about" className="font-display text-xl">
          DryRun
        </Link>
        <div className="hidden items-center gap-7 text-sm text-ink-2 md:flex">
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#room" className="hover:text-ink">The room</a>
          <a href="#n8n" className="hover:text-ink">n8n workflow</a>
          <a href="#next" className="hover:text-ink">What&apos;s next</a>
        </div>
        <Link href="/" className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-surface hover:bg-ink-2">
          Open DryRun
        </Link>
      </nav>
    </header>
  );
}

const WORKS_WITH = ["Google Calendar", "Gmail", "Gemini", "Meta Quest"];
const IN_INVITE = PANEL.filter((m) => m.source === "email").length;

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-8 sm:px-6 sm:pt-16 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14 lg:py-12">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ea4b71]" />
          Built with n8n for HackSprint 2026
        </p>
        <h1 className="mt-6 text-balance font-display text-4xl leading-[1.05] sm:text-5xl">
          Know the hard questions before the meeting starts.
        </h1>
        <p className="mt-6 max-w-xl text-pretty text-lg text-ink-2">
          An n8n agent watches your calendar, researches the people you&apos;re about to meet and emails you a brief with
          sources. Then you pitch to them in a VR boardroom, before the real thing.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/" className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-surface hover:bg-ink-2">
            Open DryRun
          </Link>
          <a href="#how" className="rounded-full border border-line bg-surface px-6 py-3 text-sm hover:border-ink">
            See how it works
          </a>
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <span className="mr-1 text-muted">Works with</span>
          {WORKS_WITH.map((t) => (
            <span key={t} className="rounded-full border border-line px-2.5 py-1">
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* The product in one picture: the room you rehearse in, and the app cards that get you there */}
      <div className="relative lg:pr-4">
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-ink shadow-2xl shadow-ink/20">
          <Image
            src="/vr/room_wide.jpg"
            alt="The VR boardroom from where you stand: the practice panel seated around a long table."
            fill
            preload
            sizes="(min-width: 1024px) 600px, 100vw"
            className="object-cover object-[center_75%]"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink/40 via-transparent to-ink/20" />
          <p className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1.5 text-xs shadow-sm backdrop-blur">
            <StatusIcon tone="good" className="size-3.5 text-good-ink" />
            Brief emailed to you
          </p>
        </div>

        <div className="absolute top-[18%] -right-2 hidden w-56 rounded-2xl border border-line bg-surface p-4 shadow-xl shadow-ink/10 sm:block lg:-right-4">
          <p className="text-xs text-muted">Practice panel</p>
          <div className="mt-3 flex -space-x-2">
            {PANEL.map((m) => (
              <span key={m.id} className="rounded-full ring-2 ring-surface">
                <PersonaAvatar persona={m} size={34} />
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-2">
            {IN_INVITE} from the invite, {PANEL.length - IN_INVITE} practice roles
          </p>
        </div>

        {/* n8n has prepared a meeting and asks if you want to practise */}
        <div className="relative mx-3 -mt-12 rounded-2xl border border-line bg-surface p-5 shadow-xl shadow-ink/10 sm:absolute sm:-bottom-14 sm:-left-6 sm:mx-0 sm:mt-0 sm:w-[340px]">
          <p className="text-xs text-muted">In 2 days, 3:00 pm</p>
          <p className="mt-1 font-display text-lg">Prepare for {meeting.title}?</p>
          <p className="mt-2 text-sm text-ink-2">{meeting.why}</p>
          <div className="mt-4 flex gap-2 text-sm">
            <span className="rounded-full bg-ink px-4 py-2 text-surface">Read the brief</span>
            <span className="rounded-full border border-line px-4 py-2">Practise now</span>
          </div>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { title: "n8n spots the meeting", line: "A new event on your Google Calendar starts the workflow. No forms to fill." },
  { title: "You get a brief", line: "Attendees, the questions they'll ask and sourced news, in your inbox." },
  { title: "You rehearse", line: "Edit the practice panel on the web, then pitch to it in the VR boardroom." },
];

function Steps() {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-20 sm:px-6 lg:pt-12">
      <SectionHead eyebrow="How it works" title="From calendar invite to rehearsal, without asking." />
      <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="bg-surface p-6">
            <span className="font-display text-sm text-muted">0{i + 1}</span>
            <h3 className="mt-3 font-display text-lg">{s.title}</h3>
            <p className="mt-2 text-sm text-ink-2">{s.line}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Feature({ id, eyebrow, title, body, points, visual, flip = false }: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  visual: ReactNode;
  flip?: boolean;
}) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-24 sm:px-6 sm:pt-32">
      <div className="grid items-center gap-10 lg:grid-cols-[5fr_7fr] lg:gap-16">
        <div className={`min-w-0 ${flip ? "lg:order-2" : ""}`}>
          <SectionHead eyebrow={eyebrow} title={title} />
          <p className="mt-5 text-pretty text-ink-2">{body}</p>
          <ul className="mt-6 flex flex-col gap-3 text-sm">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2.5">
                <StatusIcon tone="good" className="mt-0.5 size-4 shrink-0 text-good-ink" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>{visual}</div>
      </div>
    </section>
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

function Room() {
  return (
    <section id="room" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-24 sm:px-6 sm:pt-32">
      <div className="relative isolate overflow-hidden rounded-3xl bg-ink text-surface">
        <Image
          src="/vr/room_top.jpg"
          alt="The boardroom from above, with the practice panel seated around the table."
          fill
          sizes="(min-width: 1152px) 1104px, 100vw"
          className="-z-10 object-cover object-[75%_50%]"
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/75 to-transparent" />
        <div className="max-w-lg p-8 sm:p-14">
          <SectionHead eyebrow="The room" title="Then pitch to them in VR." invert />
          <p className="mt-5 text-surface/75">
            Put on a Meta Quest and you&apos;re at the head of the table, with the panel in the chairs you chose. Start
            talking and the session starts; they turn to look at you. The big screen shows what you see, so your team
            can watch along.
          </p>
          <p className="mt-6 text-sm text-surface/50">No headset? The practice page runs the same room on your laptop.</p>
        </div>
      </div>
    </section>
  );
}

const NODES = [
  { tool: "Google Calendar", step: "A new event starts the run" },
  { tool: "Gemini", step: "Decides if it's worth preparing" },
  { tool: "Gmail", step: "Reads your threads with the attendees" },
  { tool: "News and website", step: "Researches the company, searches the web if news is thin" },
  { tool: "Gemini", step: "Writes the brief and seats the panel" },
  { tool: "Data table and Gmail", step: "Saves it for the app and emails you" },
];

function Pipeline() {
  return (
    <section id="n8n" className="mt-24 scroll-mt-16 bg-ink text-surface sm:mt-32">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <SectionHead eyebrow="Under the hood" title="Every decision runs in n8n." invert />
          <p className="max-w-md text-surface/65">
            The web app and the headset only show things and capture your voice. n8n decides, researches, writes and sends,
            and reports every step back as it goes. If a step fails, you get told instead of left waiting.
          </p>
        </div>
        <ol className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {NODES.map((n, i) => (
            <li key={i} className="relative flex flex-col gap-2 rounded-2xl border border-surface/15 bg-surface/5 p-5">
              <span className="font-display text-xs text-surface/40">{String(i + 1).padStart(2, "0")}</span>
              <p className="font-display text-sm">{n.tool}</p>
              <p className="text-sm text-surface/65">{n.step}</p>
              {i < NODES.length - 1 && (
                <span aria-hidden="true" className="absolute top-1/2 -right-3 z-10 hidden size-3 -translate-y-1/2 rotate-45 border-t border-r border-surface/40 lg:block" />
              )}
            </li>
          ))}
        </ol>
        <p className="mt-8 text-sm text-surface/45">
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
    <section id="next" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-24 sm:px-6 sm:pt-32">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHead eyebrow="Being built" title="What's next for the room." />
        <Link href="/s/demo/report" className="text-sm underline underline-offset-4 hover:text-ink-2">
          Preview the debrief with sample data
        </Link>
      </div>
      <ul className="mt-12 grid gap-4 sm:grid-cols-3">
        {NEXT.map((n) => (
          <li key={n.title} className="rounded-2xl border border-line bg-surface p-6">
            <span className="rounded-full bg-paper px-2.5 py-1 text-xs text-ink-2">In progress</span>
            <h3 className="mt-4 font-display text-lg">{n.title}</h3>
            <p className="mt-2 text-sm text-ink-2">{n.line}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Closing() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6 sm:py-32">
      <h2 className="mx-auto max-w-2xl text-balance font-display text-3xl leading-tight sm:text-5xl">
        Your next big meeting is already on your calendar.
      </h2>
      <p className="mx-auto mt-5 max-w-md text-ink-2">See what n8n has prepared for it, or add one by hand.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-surface hover:bg-ink-2">
          Open DryRun
        </Link>
        <Link href="/new" className="rounded-full border border-line bg-surface px-6 py-3 text-sm hover:border-ink">
          Add a meeting
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:justify-between sm:px-6">
        <span>Built with n8n by Git Push and Pray</span>
        <span>HackSprint 2026, MAHE Bengaluru</span>
      </div>
    </footer>
  );
}
