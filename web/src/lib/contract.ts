// Types for the n8n webhook contract. Source of truth: docs/CONTRACT.md (v0.24).
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

// The deck as /prep gets it: each slide's text, extracted by the laptop (n8n can't reach its files)
export interface DeckText {
  name: string;
  slides: { index: number; text: string }[];
}

export interface BriefInput {
  presenter: { name: string; email: string };
  deck: DeckText | null;
  prospect: { company: string; website: string; context: string };
}

// n8n's suggested pitch length for a meeting, from the invite and the kind of meeting
export interface PitchSuggestion {
  minutes: number;
  why: string;
}

// A panel member after the presenter's edits: in the room while drafting, and sent to /prep.
// People the presenter added have no gender and may have no name: n8n fills those in.
export interface DraftMember extends Omit<PanelMember, "gender" | "why" | "source"> {
  gender?: PanelMember["gender"];
  why?: string;
  source?: PanelMember["source"];
  difficulty: 1 | 2 | 3;
}

// POST /prep: the brief inputs, the confirmed panel and how long the presenter means to pitch
export interface PrepRequest extends BriefInput {
  draft_id: string;
  pitch_minutes: number;
  panel: DraftMember[];
  // false skips voicing the lines (testing without spending TTS credits); default true
  voices?: boolean;
}

export interface PanelSuggestion {
  role: string;
  role_short: string;
  why: string;
  display_name?: string;
  gender?: "male" | "female";
  avatar?: string;
  will_push_on?: string;
}

export interface PanelProposal {
  draft_id: string;
  members: PanelMember[];
  // Practice people to add with one tap, most influential first (0.22: whole people; older meetings have role, role_short and why only)
  suggestions: PanelSuggestion[];
  // Missing on meetings prepared before contract 0.18
  pitch?: PitchSuggestion;
}

export interface Slide {
  index: number;
  title: string;
  image_url: string;
  key_points: string[];
  target_seconds: number;
  rescue: { calm: string; keyword: string; bridge: string };
  // The talk track from the last debrief of this meeting, for the speaker view; null on a first rehearsal
  notes: string | null;
}

export interface Persona extends Seating {
  priorities: string[];
  objections: { slide_index: number; text: string; source: "deck" | "research" | "history" }[];
  difficulty: 1 | 2 | 3;
  // interrupts: raises a hand during the pitch; waits: keeps it for the questions
  manner: "interrupts" | "waits";
  // Exactly one person chairs: welcomes the presenter, opens the floor and closes the meeting
  chair: boolean;
  // TTS voice name
  voice: string;
}

// A short line voiced ahead of time in /prep, so common reactions play without waiting.
// n8n sends audio_base64 (MP3 or WAV); the laptop saves it as WAV and puts audio_url (/api/audio/<id>.wav) in the room's bundle.
export interface VoicedLine {
  id: string;
  persona_id: PersonaId;
  kind: "welcome" | "open_floor" | "acknowledge";
  text: string;
  audio_base64?: string;
  audio_url?: string;
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
  pitch_seconds: number;
  // How many questions n8n means to ask during and after the pitch, and why; /turn can change its mind
  plan: { during_pitch: number; after_pitch: number; why: string };
  // Seconds of silence before the calm, keyword and bridge cues
  rescue_after_s: [number, number, number];
  slides: Slide[];
  personas: Persona[];
  lines: VoicedLine[];
  drill: Drill | null;
}

export type Verdict = "resolved" | "partial" | "dodged";

export type TurnMode = "opening" | "segment" | "answer" | "pitch_end";

export interface Reaction {
  persona_id: PersonaId;
  kind: "welcome" | "question" | "follow_up" | "acknowledge" | "open_floor" | "closing";
  text: string;
  // One of the bundle's lines, played instead of new audio
  line_id?: string;
  // n8n to laptop: MP3 or WAV
  audio_base64?: string;
  // laptop to headset: /api/audio/<id>.wav
  audio_url?: string;
  // Raise a hand and wait for the presenter to pause before speaking
  raise_hand: boolean;
  reason: string;
}

// POST /turn, headset to laptop
export interface TurnRequest {
  session_id: string;
  mode: TurnMode;
  slide_index: number;
  t: number;
  audio_wav_base64: string;
  asked_by?: PersonaId;
}

// A turn as the laptop logs it and sends it back to n8n as context (no audio)
export interface LoggedTurn {
  mode: TurnMode;
  slide_index: number;
  t: number;
  asked_by?: PersonaId;
  transcript: string;
  note?: string;
  reactions: Pick<Reaction, "persona_id" | "kind" | "text" | "raise_hand" | "reason">[];
  answer_verdict: Verdict | null;
}

// What the laptop adds before forwarding a turn to n8n, which keeps no state between turns
export interface TurnContext {
  bundle: Bundle;
  elapsed_s: number;
  turns: LoggedTurn[];
  // Questions whose hand went down unasked because the presenter talked on
  pending: { persona_id: PersonaId; text: string; slide_index: number }[];
}

export interface TurnResponse {
  transcript: string;
  // n8n's one-line reading of the turn, also when nobody reacts
  note: string;
  reactions: Reaction[];
  answer_verdict: Verdict | null;
  // The reactions end with the chair's closing: the headset ends the session once they've played
  end_session: boolean;
}

export type TelemetryEvent =
  | { t: number; type: "slide"; slide_index: number }
  | { t: number; type: "silence"; duration_s: number; rescue_level: 0 | 1 | 2 | 3 }
  | ({ type: "turn" } & LoggedTurn);

export interface Telemetry {
  session_id: string;
  client: "vr" | "web";
  duration_s: number;
  events: TelemetryEvent[];
  // Seconds the presenter's head faced each person (head direction: the Quest 3S has no eye tracking)
  gaze_dwell_s?: Record<PersonaId, number>;
  // Seconds turned to the TV behind them
  facing_slides_s?: number;
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

// One mark on the transcript; quote is copied exactly from it, so the report can underline it
export interface TranscriptMark {
  quote: string;
  kind: "filler" | "hedge" | "unsupported" | "wrong_fact" | "dodged" | "landed";
  note: string;
  // A way to say it instead; empty for "landed"
  better: string;
}

// What the presenter said on one slide, with n8n's marks and a talk track for next time
export interface DebriefSlide {
  index: number;
  transcript: string;
  seconds: number;
  target_seconds: number;
  words_per_minute: number;
  covered: string[];
  missed: string[];
  marks: TranscriptMark[];
  notes: string;
}

// Who you faced (VR only)
export interface Facing {
  slides_s: number;
  longest_gap: { persona_id: PersonaId; seconds: number; from_slide: number; to_slide: number } | null;
}

export interface Debrief {
  headline: string;
  overall: number;
  previous_overall: number | null;
  stakeholders: StakeholderVerdict[];
  metrics: Metric[];
  slides: DebriefSlide[];
  facing: Facing | null;
  drill: Drill;
  // What the panel presses on next time (0.20); the next /prep for the meeting raises them
  weak_spots?: string[];
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
  // n8n's steps through the debrief, saved after each one; the dashboard shows them until debrief arrives
  debrief_status: PrepStatus | null;
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
  // The rehearsals debriefed so far, with the latest (0.20); null before the first
  practice?: { sessions: number; last: Pick<SessionSummary, "session_id" | "at" | "overall" | "headline"> } | null;
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
  // This meeting's rehearsals, newest first (0.20)
  sessions?: SessionSummary[];
}

// One rehearsal of a meeting, from the DryRun sessions table (0.20)
export interface SessionSummary {
  session_id: string;
  at: string;
  status: "debriefing" | "done" | "failed";
  overall: number | null;
  headline: string;
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
  // How long the presenter means to pitch, sent to /prep; starts at n8n's suggestion, or 5
  pitch_minutes: number;
  // Where the presenter rehearses this panel (0.23): the headset, or the browser's rehearsal page; "vr" for older rooms
  rehearse_in: RehearseIn;
  // The debrief of the run that just ended (0.20); null until a session ends, and again once one starts
  debrief: RoomDebrief | null;
  // The sample meeting is in the room (0.21): the headset stands in for the presenter and the laptop answers turns from its script
  scripted?: boolean;
}

export interface RoomDebrief {
  // That run's session id: the bundle's plus its start time, so each run gets its own report
  run_id: string;
  state: "running" | "done" | "failed" | "skipped";
  // n8n's steps, as the laptop last read them
  steps: PrepStep[];
  error: string | null;
  // The debrief's score and headline, once done
  overall?: number | null;
  headline?: string;
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

export type RehearseIn = "vr" | "browser";

// Who on the panel is speaking and who has a hand up right now (0.23), set by the rehearsing client with POST /api/room/now
export interface LiveNow {
  speaking: PersonaId | null;
  hands: PersonaId[];
}

// POST /api/room/session: start (briefed → live), end (live → done), restart (done → briefed, same panel)
export type SessionAction = "start" | "end" | "restart";

export interface LiveSession {
  started_at: string;
  started_by: SessionActor;
  ended_at: string | null;
  ended_by: SessionActor | null;
  // Kept by the laptop from the turns it forwards
  stage: "opening" | "pitch" | "questions" | "closing";
  // Turns sent to n8n and not answered yet (0.19), so the dashboard shows n8n at work
  thinking?: ThinkingTurn[];
  // Missing until the rehearsing client first sends it; cleared when the session ends (0.23)
  now?: LiveNow;
  feed: LoggedTurn[];
}

export interface ThinkingTurn {
  id: string;
  mode: TurnMode;
  slide_index: number;
  t: number;
  asked_by?: PersonaId;
}
