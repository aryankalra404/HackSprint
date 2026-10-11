import type { PersonaId, Slide, Telemetry, Verdict } from "./contract";

export interface SlideSegment {
  slide_index: number;
  title: string;
  start: number;
  end: number;
  target: number;
}

export interface Exchange {
  id: string;
  t: number;
  slide_index: number;
  persona_id: PersonaId;
  question: string;
  reason: string;
  answer: { t: number; transcript: string; verdict: Verdict | null } | null;
}

export interface Freeze {
  id: string;
  t: number;
  duration_s: number;
  rescue_level: 0 | 1 | 2 | 3;
  slide_index: number;
}

export function slideSegments(telemetry: Telemetry, slides: Slide[]): SlideSegment[] {
  const starts = telemetry.events.filter((e) => e.type === "slide");
  return starts.map((e, i) => {
    const slide = slides[e.slide_index];
    return {
      slide_index: e.slide_index,
      title: slide?.title ?? `Slide ${e.slide_index + 1}`,
      start: e.t,
      end: starts[i + 1]?.t ?? telemetry.duration_s,
      target: slide?.target_seconds ?? 0,
    };
  });
}

// Pairs each stakeholder question with the presenter's next answer to that stakeholder.
export function exchanges(telemetry: Telemetry): Exchange[] {
  const out: Exchange[] = [];
  for (const e of telemetry.events) {
    if (e.type !== "turn") continue;
    if (e.mode === "answer") {
      const open = out.findLast((x) => !x.answer && x.persona_id === e.asked_by);
      if (open) open.answer = { t: e.t, transcript: e.transcript, verdict: e.answer_verdict };
    }
    for (const r of e.reactions) {
      if (r.kind !== "question" && r.kind !== "follow_up") continue;
      out.push({
        id: `q-${e.t}-${r.persona_id}`,
        t: e.t,
        slide_index: e.slide_index,
        persona_id: r.persona_id,
        question: r.text,
        reason: r.reason,
        answer: null,
      });
    }
  }
  return out;
}

export function freezes(telemetry: Telemetry, segments: SlideSegment[]): Freeze[] {
  return telemetry.events.flatMap((e) =>
    e.type === "silence"
      ? [{ id: `f-${e.t}`, t: e.t, duration_s: e.duration_s, rescue_level: e.rescue_level, slide_index: slideAt(segments, e.t) }]
      : [],
  );
}

export function slideAt(segments: SlideSegment[], t: number): number {
  return segments.findLast((s) => s.start <= t)?.slide_index ?? 0;
}

export const RESCUE_LABEL = ["No cue", "Calm cue", "Keyword cue", "Bridge phrase"] as const;
