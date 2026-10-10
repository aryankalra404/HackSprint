// Types for the n8n webhook contract. Source of truth: docs/CONTRACT.md (v0.4).
// Field names stay snake_case so JSON from n8n can be used as-is.

// Persona ids are per panel ("p1", "p2", …); every field that names a person uses one.
export type PersonaId = string;

// Six panel seats in the VR boardroom, numbered by seniority (0 is the head of the table).
export type Seat = 0 | 1 | 2 | 3 | 4 | 5;

export type AvatarId =
  | "business_male_01"
  | "business_male_02"
  | "business_male_03"
  | "business_male_04"
  | "business_female_01"
  | "business_female_02"
  | "business_female_03";

// Who sits where: shared by the /panel proposal, the edited /prep panel and the bundle personas.
export interface Seating {
  id: PersonaId;
  seat: Seat;
  role: string;
  role_short: string;
  display_name: string;
  avatar: AvatarId;
}

export interface PanelMember extends Seating {
  gender: "male" | "female";
  why: string;
  source: "email" | "research" | "deck" | "typical";
}

export interface BriefInput {
  presenter: { name: string; email: string };
  deck: { pdf_url: string; slide_image_urls: string[] };
  prospect: { company: string; website: string; context: string };
}

// A panel member after the presenter's edits, as sent to /prep.
// People the presenter added have no avatar or gender yet, and may have no name: n8n fills those in.
export interface DraftMember extends Omit<PanelMember, "avatar" | "gender" | "why" | "source"> {
  avatar?: AvatarId;
  gender?: PanelMember["gender"];
  why?: string;
  source?: PanelMember["source"];
  difficulty: 1 | 2 | 3;
}

export interface PanelProposal {
  draft_id: string;
  members: PanelMember[];
  suggestions: { role: string; role_short: string; why: string }[];
}

export interface Slide {
  index: number;
  title: string;
  image_url: string;
  key_points: string[];
  target_seconds: number;
  rescue: { calm: string; keyword: string; bridge: string };
}

export interface Persona extends Seating {
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
  gaze_dwell_s?: Record<PersonaId, number>;
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

export interface PrepStep {
  id: string;
  label: string;
  state: "pending" | "running" | "done" | "error";
  detail?: string;
  sources?: { title: string; url: string }[];
}

export interface PrepStatus {
  done: boolean;
  steps: PrepStep[];
}

export interface SessionRecord {
  bundle: Bundle;
  status: PrepStatus;
  // Null until the session has been rehearsed and debriefed.
  telemetry: Telemetry | null;
  debrief: Debrief | null;
  history: { session_id: string; at: string; overall: number }[];
}

export type DebriefedSession = SessionRecord & { telemetry: Telemetry; debrief: Debrief };

export function isDebriefed(s: SessionRecord): s is DebriefedSession {
  return s.telemetry != null && s.debrief != null;
}
