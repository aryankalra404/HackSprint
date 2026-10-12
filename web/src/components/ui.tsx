import type { ReactNode } from "react";
import type { Persona, StakeholderVerdict, Verdict } from "@/lib/contract";
import { portraitOf, colorOf } from "@/lib/personas";

// Every button and button-like link: three kinds, three sizes. sm sits in toolbars and rows, md is the default, lg is a page's one main action.
type ButtonKind = "primary" | "secondary" | "quiet";
const BTN_KIND: Record<ButtonKind, string> = {
  primary: "bg-ink text-surface hover:bg-ink/85",
  secondary: "border border-line bg-surface text-ink hover:border-ink",
  quiet: "text-ink-2 hover:bg-ink/5 hover:text-ink",
};
const BTN_SIZE = { sm: "h-8 px-3.5 text-xs", md: "h-9 px-4 text-sm", lg: "h-11 px-6 text-sm" };

export function btn(kind: ButtonKind = "secondary", size: keyof typeof BTN_SIZE = "md") {
  return `inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 ${BTN_KIND[kind]} ${BTN_SIZE[size]}`;
}

// A section's heading on a reading page: a title, an optional count, a line on what it holds and an action on the right
export function SectionHead({ id, title, count, note, action }: { id?: string; title: ReactNode; count?: number; note?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={id} className="flex items-baseline gap-2 font-display text-xl leading-tight">
          {title}
          {count != null && <span className="font-sans text-sm font-normal text-muted">{count}</span>}
        </h2>
        {note && <p className="text-sm text-ink-2">{note}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ title, aside, children, className = "" }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 sm:p-6 ${className}`}>
      {(title || aside) && (
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

// Portrait rendered from the VR avatar when there is one, initials otherwise.
// With a stance, a small badge on the ring shows the verdict (the label sits next to it).
export function PersonaAvatar({
  persona,
  size = 40,
  stance,
}: {
  persona: Pick<Persona, "display_name" | "color"> & { avatar?: Persona["avatar"] };
  size?: number | string;
  stance?: StakeholderVerdict["stance"];
}) {
  const initials = persona.display_name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  const portrait = persona.avatar && portraitOf(persona.avatar);
  const tone = stance && STANCE[stance][0];
  return (
    <span aria-hidden="true" className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="inline-flex size-full items-center justify-center overflow-hidden rounded-full bg-surface text-xs font-medium text-ink"
        style={{ boxShadow: `0 0 0 2px ${colorOf(persona.color)}` }}
      >
        {portrait ? (
          // eslint-disable-next-line @next/next/no-img-element -- small static files, sized by the parent
          <img src={portrait} alt="" className="size-full object-cover" />
        ) : initials ? (
          initials
        ) : (
          // Not seated yet: n8n picks the face and name when it briefs the panel
          <svg viewBox="0 0 24 24" className="size-[70%] translate-y-[12%] text-axis" fill="currentColor">
            <circle cx="12" cy="8" r="4.5" />
            <path d="M3 22c0-5 4-8.5 9-8.5s9 3.5 9 8.5z" />
          </svg>
        )}
      </span>
      {tone && (
        <span className={`absolute -right-[4%] -bottom-[4%] flex size-[36%] items-center justify-center rounded-full ring-2 ring-surface ${BADGE[tone]}`}>
          <StatusIcon tone={tone} className="size-[70%]" />
        </span>
      )}
    </span>
  );
}

export function RoleTag({ persona }: { persona: Pick<Persona, "color" | "role_short"> }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: colorOf(persona.color) }} />
      {persona.role_short}
    </span>
  );
}

type Tone = "good" | "warn" | "bad";

const TONE: Record<Tone, { ink: string; bg: string }> = {
  good: { ink: "text-good-ink", bg: "bg-good/10" },
  warn: { ink: "text-warn-ink", bg: "bg-warn/15" },
  bad: { ink: "text-bad-ink", bg: "bg-bad/10" },
};

const BADGE: Record<Tone, string> = { good: "bg-good text-surface", warn: "bg-warn text-ink", bad: "bg-bad text-surface" };

export function StatusIcon({ tone, className = "size-3.5" }: { tone: Tone; className?: string }) {
  const d = { good: "M3 8.5l3 3 7-7", warn: "M4 8h8", bad: "M4.5 4.5l7 7M11.5 4.5l-7 7" }[tone];
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONE[tone].ink} ${TONE[tone].bg}`}>
      <StatusIcon tone={tone} />
      {children}
    </span>
  );
}

const VERDICT: Record<Verdict, [Tone, string]> = {
  resolved: ["good", "Resolved"],
  partial: ["warn", "Partly answered"],
  dodged: ["bad", "Dodged"],
};

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  const [tone, label] = VERDICT[verdict];
  return <Pill tone={tone}>{label}</Pill>;
}

export function verdictTone(verdict: Verdict): Tone {
  return VERDICT[verdict][0];
}

export function verdictLabel(verdict: Verdict): string {
  return VERDICT[verdict][1];
}

const STANCE: Record<StakeholderVerdict["stance"], [Tone, string]> = {
  backs: ["good", "Backs it"],
  undecided: ["warn", "Undecided"],
  opposes: ["bad", "Not convinced"],
};

const OWED: Record<"parked" | "dodged" | "partial", [Tone, string]> = {
  parked: ["warn", "Parked"],
  partial: ["warn", "Partly answered"],
  dodged: ["bad", "Dodged"],
};

export function OwedPill({ status }: { status: "parked" | "dodged" | "partial" }) {
  const [tone, label] = OWED[status];
  return <Pill tone={tone}>{label}</Pill>;
}

export function StancePill({ stance }: { stance: StakeholderVerdict["stance"] }) {
  const [tone, label] = STANCE[stance];
  return <Pill tone={tone}>{label}</Pill>;
}

// Compact form for tight spaces: icon and label in the status colour, sized by the parent
export function StanceText({ stance }: { stance: StakeholderVerdict["stance"] }) {
  const [tone, label] = STANCE[stance];
  return (
    <span className={`inline-flex items-center gap-[0.25em] font-medium ${TONE[tone].ink}`}>
      <StatusIcon tone={tone} className="size-[1.1em]" />
      {label}
    </span>
  );
}

// A raised hand: the cue for the presenter to pause
export function HandIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 11V6a2 2 0 0 0-4 0v5" />
      <path d="M14 10V4a2 2 0 0 0-4 0v6" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}
