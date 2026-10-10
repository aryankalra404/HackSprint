import type { ReactNode } from "react";
import type { PersonaId, StakeholderVerdict, Verdict } from "@/lib/contract";
import { PERSONA_STYLE } from "@/lib/personas";

export function Card({ title, aside, children, className = "" }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 sm:p-6 ${className}`}>
      {(title || aside) && (
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          {title && <h2 className="font-mono text-xs uppercase tracking-widest text-ink-2">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export function PersonaAvatar({ id, name, size = 40 }: { id: PersonaId; name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface font-mono text-xs font-medium text-ink"
      style={{ width: size, height: size, boxShadow: `inset 0 0 0 2px ${PERSONA_STYLE[id].color}` }}
    >
      {initials}
    </span>
  );
}

export function RoleTag({ id }: { id: PersonaId }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-2">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: PERSONA_STYLE[id].color }} />
      {PERSONA_STYLE[id].short}
    </span>
  );
}

type Tone = "good" | "warn" | "bad";

const TONE: Record<Tone, { ink: string; bg: string }> = {
  good: { ink: "text-good-ink", bg: "bg-good/10" },
  warn: { ink: "text-warn-ink", bg: "bg-warn/15" },
  bad: { ink: "text-bad-ink", bg: "bg-bad/10" },
};

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
