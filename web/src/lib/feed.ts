import type { Bundle, LiveSession, LoggedTurn, Reaction, RoomDebrief, SessionRecord, ThinkingTurn, Verdict } from "./contract";
import { personaTag } from "./personas";
import { clock } from "./format";
import { exchanges, freezes, RESCUE_LABEL, slideSegments } from "./timeline";

// The agent feed: n8n's decisions in plain language, in the order they happened.
export interface FeedItem {
  id: string;
  phase: "Before" | "During" | "After";
  when: string;
  title: string;
  detail?: string;
  // Seat colour of the stakeholder involved, if any
  color?: string;
  verdict?: Verdict | null;
  // n8n is still working on it
  busy?: boolean;
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
      title: `${personaTag(bundle.personas, x.persona_id).short} asked: ${x.question}`,
      detail: x.reason,
      color: personaTag(bundle.personas, x.persona_id).color,
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
      detail: `${debrief.drill.minutes} minutes against ${personaTag(bundle.personas, debrief.drill.focus_persona).name}`,
      color: personaTag(bundle.personas, debrief.drill.focus_persona).color,
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

// The rehearsal as it happens, from the room's live feed (contract: live.feed and live.thinking): what n8n heard on each turn,
// its reading of it, who reacted and why, and the turns it's still working on.
export function buildLiveFeed(live: LiveSession, bundle: Bundle): FeedItem[] {
  const first = (id: string) => personaTag(bundle.personas, id).name.split(" ")[0];
  const items: FeedItem[] = [];
  live.feed.forEach((turn, i) => {
    items.push({
      id: `turn-${i}`,
      phase: "During",
      when: clock(turn.t),
      title: `Listened to ${what(turn, first)}`,
      detail: turn.note || undefined,
      verdict: turn.mode === "answer" ? turn.answer_verdict : null,
    });
    turn.reactions.forEach((r, j) =>
      items.push({
        id: `turn-${i}-${j}`,
        phase: "During",
        when: clock(turn.t),
        title: reacted(r, first(r.persona_id)),
        detail: r.reason || undefined,
        color: personaTag(bundle.personas, r.persona_id).color,
      }),
    );
  });
  for (const t of live.thinking ?? [])
    items.push({ id: `thinking-${t.id}`, phase: "During", when: "now", title: `Reading ${what(t, first)}`, busy: true });
  return items;
}

function what(turn: LoggedTurn | ThinkingTurn, first: (id: string) => string): string {
  switch (turn.mode) {
    case "opening":
      return "your opening";
    case "segment":
      return `slide ${turn.slide_index + 1}`;
    case "answer":
      return turn.asked_by ? `your answer to ${first(turn.asked_by)}` : "your answer";
    case "pitch_end":
      return "the end of your pitch";
  }
}

function reacted(r: Pick<Reaction, "kind" | "text" | "raise_hand">, name: string): string {
  switch (r.kind) {
    case "welcome":
      return `${name} welcomed you`;
    case "question":
      return r.raise_hand ? `${name} raised a hand: ${r.text}` : `${name} asked: ${r.text}`;
    case "follow_up":
      return `${name} followed up: ${r.text}`;
    case "acknowledge":
      return `${name}: ${r.text}`;
    case "open_floor":
      return `${name} opened the floor`;
    case "closing":
      return `${name} closed the meeting`;
  }
}

// n8n's debrief of the run that just ended, step by step as the laptop reads it (contract: the room's debrief)
export function buildDebriefFeed(debrief: RoomDebrief): FeedItem[] {
  const steps: FeedItem[] = debrief.steps
    .filter((s) => s.state !== "pending")
    .map((s) => ({
      id: `debrief-${s.id}`,
      phase: "After",
      when: s.state === "running" ? "now" : s.state === "error" ? "failed" : "done",
      title: s.label,
      detail: s.detail || undefined,
      busy: s.state === "running" && debrief.state === "running",
    }));
  if (debrief.state === "done")
    steps.push({ id: "debrief-ready", phase: "After", when: "done", title: `Debrief ready: ${debrief.overall ?? "?"}/100`, detail: debrief.headline || undefined });
  if (debrief.state === "failed") steps.push({ id: "debrief-failed", phase: "After", when: "failed", title: "The debrief didn't finish", detail: debrief.error ?? undefined });
  if (debrief.state === "skipped") steps.push({ id: "debrief-skipped", phase: "After", when: "skipped", title: "No debrief", detail: debrief.error ?? undefined });
  return steps;
}
