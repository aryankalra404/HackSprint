import type { ReactNode } from "react";
import type { Persona, StakeholderVerdict, Verdict } from "@/lib/contract";
import { portraitOf, seatColor } from "@/lib/personas";

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
  persona: Pick<Persona, "display_name" | "seat" | "avatar">;
  size?: number | string;
  stance?: StakeholderVerdict["stance"];
}) {
  const initials = persona.display_name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  const portrait = portraitOf(persona.avatar);
  const tone = stance && STANCE[stance][0];
  return (
    <span aria-hidden="true" className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="inline-flex size-full items-center justify-center overflow-hidden rounded-full bg-surface text-xs font-medium text-ink"
        style={{ boxShadow: `0 0 0 2px ${seatColor(persona.seat)}` }}
      >
        {portrait ? (
          // eslint-disable-next-line @next/next/no-img-element -- small static files, sized by the parent
          <img src={portrait} alt="" className="size-full object-cover" />
        ) : (
          initials
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

export function RoleTag({ persona }: { persona: Pick<Persona, "seat" | "role_short"> }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: seatColor(persona.seat) }} />
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

const STANCE: Record<StakeholderVerdict["stance"], [Tone, string]> = {
  backs: ["good", "Backs it"],
  undecided: ["warn", "Undecided"],
  opposes: ["bad", "Not convinced"],
};

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
