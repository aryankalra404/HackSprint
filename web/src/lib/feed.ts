import type { PersonaId, SessionRecord, Verdict } from "./contract";
import { PERSONA_STYLE } from "./personas";
import { clock } from "./format";
import { exchanges, freezes, RESCUE_LABEL, slideSegments } from "./timeline";

// The agent feed: n8n's decisions in plain language, in the order they happened.
export interface FeedItem {
  id: string;
  phase: "Before" | "During" | "After";
  when: string;
  title: string;
  detail?: string;
  persona?: PersonaId;
  verdict?: Verdict | null;
}

const ACTION_TEXT: Record<string, string> = {
  report_emailed: "Emailed the report",
  drill_scheduled: "Booked the drill on the calendar",
  weak_spots_saved: "Briefed the panel to press on weak spots next time",
};

export function buildFeed(session: SessionRecord): FeedItem[] {
  const { bundle, status, telemetry, debrief } = session;
  const items: FeedItem[] = status.steps
    .filter((s) => s.state !== "pending")
    .map((s) => ({
      id: `prep-${s.id}`,
      phase: "Before",
      when: s.state === "running" ? "now" : s.state === "error" ? "failed" : "done",
      title: s.label,
      detail: s.detail,
    }));

  if (!telemetry || !debrief) return items;

  const segments = slideSegments(telemetry, bundle.slides);
  const during: (FeedItem & { t: number })[] = [
    ...exchanges(telemetry).map((x) => ({
      id: x.id,
      t: x.t,
      phase: "During" as const,
      when: clock(x.t),
      title: `${PERSONA_STYLE[x.persona_id].short} asked: ${x.question}`,
      detail: x.reason,
      persona: x.persona_id,
      verdict: x.answer?.verdict ?? null,
    })),
    ...freezes(telemetry, segments)
      .filter((f) => f.rescue_level > 0)
      .map((f) => ({
        id: f.id,
        t: f.t,
        phase: "During" as const,
        when: clock(f.t),
        title: `Rescue Agent: ${RESCUE_LABEL[f.rescue_level].toLowerCase()}`,
        detail: `You went silent for ${f.duration_s.toFixed(1)} s.`,
      })),
  ].sort((a, b) => a.t - b.t);

  const after: FeedItem[] = [
    {
      id: "drill",
      phase: "After",
      when: "done",
      title: `Planned the next drill: ${debrief.drill.title}`,
      detail: `${debrief.drill.minutes} minutes against ${PERSONA_STYLE[debrief.drill.focus_persona].short}`,
      persona: debrief.drill.focus_persona,
    },
    ...debrief.actions_taken.map((a) => ({
      id: `act-${a}`,
      phase: "After" as const,
      when: "done",
      title: ACTION_TEXT[a] ?? a.replaceAll("_", " "),
    })),
  ];

  return [...items, ...during, ...after];
}
