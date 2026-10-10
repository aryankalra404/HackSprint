// Types for the n8n webhook contract. Source of truth: docs/CONTRACT.md (v0.2).
// Field names stay snake_case so JSON from n8n can be used as-is.

export type PersonaId = "cfo" | "cto" | "procurement" | "vp_ops" | "end_user_lead";

export interface Slide {
  index: number;
  title: string;
  image_url: string;
  key_points: string[];
  target_seconds: number;
  rescue: { calm: string; keyword: string; bridge: string };
}

export interface Persona {
  id: PersonaId;
  display_name: string;
  priorities: string[];
  objections: { slide_index: number; text: string; source: "deck" | "research" | "history" }[];
  difficulty: 1 | 2 | 3;
  voice: string;
}

export interface Drill {
  title: string;
  focus_persona: PersonaId;
  slides: number[];
  minutes: number;
}

export interface Bundle {
  session_id: string;
  join_code: string;
  prospect: { company: string };
  slides: Slide[];
  personas: Persona[];
  drill: Drill | null;
}

export type Verdict = "resolved" | "partial" | "dodged";

export interface Reaction {
  persona_id: PersonaId;
  kind: "question" | "follow_up" | "acknowledge";
  text: string;
  audio_url: string;
  reason: string;
}

export type TelemetryEvent =
  | { t: number; type: "slide"; slide_index: number }
  | { t: number; type: "silence"; duration_s: number; rescue_level: 0 | 1 | 2 | 3 }
  | {
      t: number;
      type: "turn";
      mode: "slide_end" | "answer";
      slide_index: number;
      asked_by?: PersonaId;
      transcript: string;
      reaction: Reaction | null;
      answer_verdict: Verdict | null;
    };

export interface Telemetry {
  session_id: string;
  client: "vr" | "web";
  duration_s: number;
  events: TelemetryEvent[];
  gaze_dwell_s?: Partial<Record<PersonaId, number>>;
}

export interface Evidence {
  t: number;
  slide_index: number;
  quote: string;
}

export interface Metric {
  name: string;
  score: number;
  explanation: string;
  evidence: Evidence[];
}

export interface StakeholderVerdict {
  persona_id: PersonaId;
  stance: "backs" | "undecided" | "opposes";
  reason: string;
  deciding_moment: Evidence | null;
}

export interface Debrief {
  headline: string;
  overall: number;
  previous_overall: number | null;
  stakeholders: StakeholderVerdict[];
  metrics: Metric[];
  drill: Drill;
  actions_taken: string[];
}

export interface SessionRecord {
  bundle: Bundle;
  telemetry: Telemetry;
  debrief: Debrief;
  history: { session_id: string; at: string; overall: number }[];
}
