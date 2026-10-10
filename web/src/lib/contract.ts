// Types for the n8n webhook contract. Source of truth: docs/CONTRACT.md (v0.15).
// Field names stay snake_case so JSON from n8n can be used as-is.

// Persona ids are per panel ("p1", "p2", …); every field that names a person uses one.
export type PersonaId = string;

// Every chair at the boardroom table: 0 is the head, 1–4 the wall side, 5–8 the window side.
export type Seat = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

// One colour per person (0–5), kept wherever they sit
export type ColorIndex = 0 | 1 | 2 | 3 | 4 | 5;

export type AvatarId =
  | "business_female_01"
  | "business_female_02"
  | "business_female_03"
  | "business_female_04"
  | "business_male_01"
  | "business_male_02"
  | "business_male_03"
  | "business_male_04"
  | "business_male_05"
  | "business_male_06"
  | "business_male_07";

// Who sits where: shared by the /panel proposal, the room, the /prep panel and the bundle personas.
export interface Seating {
  id: PersonaId;
  seat: Seat;
  color: ColorIndex;
  role: string;
  role_short: string;
  display_name: string;
  avatar: AvatarId;
}

export interface PanelMember extends Seating {
  gender: "male" | "female";
  why: string;
  // "email": a real attendee from the invite; anything else is a hypothetical practice role
  source: "email" | "research" | "deck" | "typical";
  will_push_on?: string;
}

export interface BriefInput {
  presenter: { name: string; email: string };
  deck: { pdf_url: string; slide_image_urls: string[] };
  prospect: { company: string; website: string; context: string };
}

// A panel member after the presenter's edits: in the room while drafting, and sent to /prep.
// People the presenter added have no gender and may have no name: n8n fills those in.
export interface DraftMember extends Omit<PanelMember, "gender" | "why" | "source"> {
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

// A meeting n8n picked up from the calendar (or the web app added), with its brief once ready (contract: Meetings and briefs)
export interface Meeting {
  id: string;
  title: string;
  start: string;
  company: string;
  // n8n's reason for its decision: what's at stake, or why it isn't worth preparing
  why: string;
  // skipped: n8n decided it isn't worth preparing; it can still be prepared anyway (POST /add-meeting with the same id)
  status: "researching" | "ready" | "practised" | "done" | "failed" | "skipped";
  attendees: { name: string; email: string }[];
  // Where n8n is in preparing it, saved by the workflow after each stage
  progress?: PrepStep[];
  started_at?: string | null;
  run?: { workflow_id: string; execution_id: string } | null;
}

// Only facts: real attendees, sourced news. Hypothetical roles live in the proposal's practice panel.
export interface MeetingBrief {
  summary: string;
  company: { what_they_do: string; recent_news: { text: string; date: string }[] };
  attendees: { name: string; email: string; role: string; likely_focus: string }[];
  questions: { question: string; asked_by: string; why: string; suggested_answer: string }[];
  risks: string[];
  sources: { title: string; url: string }[];
}

export interface MeetingDetail {
  meeting: Meeting;
  brief: MeetingBrief | null;
  proposal: PanelProposal | null;
}

export interface NewMeeting {
  id: string;
  title: string;
  start?: string;
  company: string;
  website: string;
  context: string;
  attendees: { name: string; email: string }[];
  owner_email: string;
}

// The one room, held by the laptop (contract: Room API). The headset seats `panel` live.
export interface Room {
  version: number;
  phase: "empty" | "drafting" | "briefed" | "live" | "done";
  prospect: { company: string } | null;
  panel: DraftMember[];
  bundle: Bundle | null;
  session_id: string | null;
  // Tent cards with each person's name in VR; off unless switched on from the web
  name_cards: boolean;
  // Set when the session starts; null before
  live: LiveSession | null;
  // The presenter's slides, converted and served by the laptop; null until one is uploaded
  deck: Deck | null;
  // The slide on screen, from 0
  slide: number;
  // Metres to raise (or lower, if negative) the presenter's eyes in VR, from -0.5 to 0.5; 0 unless moved on the web
  height_offset: number;
}

// One slide image on the laptop: `image_url` is a path there (GET /api/deck/<id>/<n>.jpg)
export interface DeckSlide {
  index: number;
  image_url: string;
  width: number;
  height: number;
}

// A new upload gets a new id, so its images never change
export interface Deck {
  id: string;
  name: string;
  slides: DeckSlide[];
}

export type SessionActor = "headset" | "web";

// POST /api/room/session: start (briefed → live), end (live → done), restart (done → briefed, same panel)
export type SessionAction = "start" | "end" | "restart";

export interface LiveSession {
  started_at: string;
  started_by: SessionActor;
  ended_at: string | null;
  ended_by: SessionActor | null;
}
