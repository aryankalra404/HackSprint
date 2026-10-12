// Types for the n8n webhook contract. Source of truth: docs/CONTRACT.md (v0.27).
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
  // A real attendee's address, so /prep can read their twin (0.27). The laptop fills it in from the brief's attendees.
  twin_email?: string;
}

// The deck as /prep gets it: each slide's text, extracted by the laptop (n8n can't reach its files)
export interface DeckText {
  name: string;
  slides: { index: number; text: string }[];
}

export interface BriefInput {
  // offer (0.26): what the presenter offers, set once on the web app
  presenter: { name: string; email: string; offer?: string };
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
  // null: no time limit (0.25)
  pitch_minutes: number | null;
  panel: DraftMember[];
  // false skips voicing the lines (testing without spending TTS credits); default true
  voices?: boolean;
  // What the presenter wants from this meeting (0.26): n8n's guess, or their own
  goal?: { text: string; source: "n8n" | "presenter" } | null;
  // The generic lines the laptop already has, by voice (0.26): n8n doesn't voice them again
  cached_voices?: Record<string, string[]>;
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
  // n8n's guess at what the presenter wants from the meeting (0.26), from the invite and emails; missing before 0.26
  goal?: { text: string; why: string };
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
  // "twin" (0.27): something that real person actually raised, from their twin, with the source's date and a short label
  objections: { slide_index: number; text: string; source: "deck" | "research" | "history" | "twin"; date?: string; from?: string }[];
  // The real person this seat is, when DryRun has their twin (0.27)
  twin_email?: string;
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
  // The chair's time_nudge and time_up (0.25) are played by the client itself when time runs out. 0.26: the generic lines (filler,
  // thanks, park, move_on, hand_back, rescue_soft) and the chair's rescue_question per slide.
  kind: "welcome" | "open_floor" | "acknowledge" | "time_nudge" | "time_up" | "rescue_question" | GenericKind;
  text: string;
  // A line that says nothing about the meeting, voiced once per voice and cached by the laptop (0.26)
  generic?: boolean;
  voice?: string;
  // rescue_question: the slide it brings the presenter back to
  slide_index?: number;
  audio_base64?: string;
  audio_url?: string;
}

export type GenericKind = "filler" | "thanks" | "park" | "move_on" | "hand_back" | "rescue_soft";

export interface Drill {
  title: string;
  focus_persona: PersonaId;
  slides: number[];
  minutes: number;
}

export interface Bundle {
  session_id: string;
  prospect: { company: string };
  // The pitch length; with no limit, n8n's estimate of a natural length for the deck
  pitch_seconds: number;
  // How the chair keeps time (0.25); null with no time limit, missing before 0.25
  time?: TimeKeeping | null;
  // How many questions n8n means to ask during and after the pitch, and why; /turn can change its mind
  plan: Plan;
  // Seconds of silence before the calm, keyword and bridge cues
  rescue_after_s: [number, number, number];
  slides: Slide[];
  personas: Persona[];
  lines: VoicedLine[];
  drill: Drill | null;
  // What the presenter wants from the meeting and offers (0.26), for /turn and /debrief; missing before 0.26
  goal?: string | null;
  offer?: string | null;
}

// Seconds since the session began: the chair says time is nearly up at nudge_at_s, and stops the pitch for the questions at
// cut_at_s (0: lets the presenter finish)
export interface TimeKeeping {
  limit_s: number;
  nudge_at_s: number;
  cut_at_s: number;
  why: string;
}

export interface Plan {
  during_pitch: number;
  after_pitch: number;
  why: string;
  // Where someone may interrupt mid-slide (0.25): after this many seconds of speech on that slide (from the pitch's start without a
  // deck). Missing before 0.25.
  interrupts?: InterruptPoint[];
}

export interface InterruptPoint {
  persona_id: PersonaId;
  slide_index: number;
  after_s: number;
  about: string;
}

export type Verdict = "resolved" | "partial" | "dodged";

export type TurnMode = "opening" | "segment" | "answer" | "pitch_end";

// Every question n8n asks is a thread (0.26): asked, at most one follow-up, then closed for good (answered, parked or dodged).
// The laptop keeps them from n8n's replies and sends them back with each turn, so n8n stays stateless.
export interface Thread {
  id: string;
  persona_id: PersonaId;
  text: string;
  slide_index: number;
  // open: asked, or a hand that went down unasked; parked: the presenter didn't know and the asker accepted it
  status: "open" | "followed_up" | "answered" | "parked" | "dodged";
  follow_ups: number;
  planned: boolean;
}

export interface Reaction {
  persona_id: PersonaId;
  // time_nudge and time_up never come from n8n: the client plays them from the bundle's lines when time runs out (0.25).
  // park, move_on and hand_back (0.26): the asker accepts "I don't know", lets a dodged question go, or hands back to the pitch
  kind: "welcome" | "question" | "follow_up" | "acknowledge" | "park" | "move_on" | "hand_back" | "open_floor" | "closing" | "time_nudge" | "time_up";
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
  // The thread it belongs to (0.26)
  thread_id?: string;
}

// POST /turn, headset to laptop
export interface TurnRequest {
  session_id: string;
  mode: TurnMode;
  slide_index: number;
  t: number;
  audio_wav_base64: string;
  asked_by?: PersonaId;
  // A segment sent mid-slide, at one of the plan's interruption points (0.25)
  mid_slide?: boolean;
  // A pitch_end after the chair stopped the pitch for time (0.25): n8n doesn't open the floor again
  time_up?: boolean;
}

// A turn as the laptop logs it and sends it back to n8n as context (no audio)
export interface LoggedTurn {
  mode: TurnMode;
  slide_index: number;
  t: number;
  asked_by?: PersonaId;
  // The chair stopped the pitch for time (0.25)
  time_up?: boolean;
  transcript: string;
  note?: string;
  reactions: Pick<Reaction, "persona_id" | "kind" | "text" | "raise_hand" | "reason" | "thread_id">[];
  answer_verdict: Verdict | null;
  // The threads this turn opened or changed, whole (0.26)
  threads?: Thread[];
}

// What the laptop adds before forwarding a turn to n8n, which keeps no state between turns
export interface TurnContext {
  bundle: Bundle;
  elapsed_s: number;
  turns: LoggedTurn[];
  // Every question so far with its life (0.26)
  threads: Thread[];
  // Questions whose hand went down unasked because the presenter talked on; replaced by threads, kept for one version
  pending: { persona_id: PersonaId; text: string; slide_index: number }[];
}

export interface TurnResponse {
  transcript: string;
  // n8n's one-line reading of the turn, also when nobody reacts
  note: string;
  reactions: Reaction[];
  answer_verdict: Verdict | null;
  // The threads this turn opened or changed (0.26); missing from older workflows
  threads?: Thread[];
  // The reactions end with the chair's closing: the headset ends the session once they've played
  end_session: boolean;
}

export type TelemetryEvent =
  | { t: number; type: "slide"; slide_index: number }
  | { t: number; type: "silence"; duration_s: number; rescue_level: 0 | 1 | 2 | 3 }
  // The chair spoke to bring a presenter back from a freeze (0.26): "Take your time" (2) or the way-back-in question (3)
  | { t: number; type: "rescue"; level: 2 | 3; line_id: string }
  // A turn n8n didn't answer (0.26), logged by the laptop so the report doesn't blame the presenter for the silence
  | { t: number; type: "turn_failed"; mode: TurnMode }
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
  // null: too short to score (0.26)
  score: number | null;
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

// A question the presenter couldn't answer (0.26), with a suggested answer drafted by n8n from the deck, the research and what they said
export interface OwedAnswer {
  thread_id: string;
  persona_id: PersonaId;
  question: string;
  said: string;
  status: "parked" | "dodged" | "partial";
  suggested: string;
  // What they must check or fill in themselves (n8n never invents facts about their product)
  confirm: string;
  sources: { title: string; url: string }[];
}

// Something that went wrong on the system's side, which the debrief discounts (0.26)
export interface Trouble {
  t: number;
  kind: "garbled" | "cut_short" | "turn_failed";
  note: string;
}

export interface Debrief {
  headline: string;
  // null: too short to score (0.26)
  overall: number | null;
  previous_overall: number | null;
  stakeholders: StakeholderVerdict[];
  metrics: Metric[];
  slides: DebriefSlide[];
  facing: Facing | null;
  drill: Drill;
  // What the panel presses on next time (0.20); the next /prep for the meeting raises them
  weak_spots?: string[];
  // 0.26: the questions owed, the system's trouble, and the pitch as counted (only the presenter's own time); missing before 0.26
  owed?: OwedAnswer[];
  trouble?: Trouble[];
  pitch?: { seconds: number; words: number; scored: boolean };
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

// Who else already does what the deck pitches (0.31, POST /deck-research), from the news. The panel asks how this is different;
// nothing about it is shown as a finding.
export interface DeckSource {
  title: string;
  url: string;
  publisher: string;
  date: string;
}

export interface DeckOther {
  // As the headline names them, e.g. "HAL" or "an IIT Delhi startup"
  name: string;
  // What the source says they do
  what: string;
  // "same": they do what the deck pitches; "near": it overlaps
  close: "same" | "near";
  // The slide where the panel brings them up
  slide_index: number;
  // How a panel would put it: practice, never shown as a fact
  question: string;
  sources: DeckSource[];
}

export interface DeckResearch {
  about: string;
  searched: { query: string; slide_index: number; found: number }[];
  others: DeckOther[];
  at: string;
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
  // twin (0.27): what DryRun knows of each, from the DryRun people table; null when there's no twin of that address
  attendees: { name: string; email: string; twin?: TwinSummary | null }[];
  // Where n8n is in preparing it, saved by the workflow after each stage
  progress?: PrepStep[];
  started_at?: string | null;
  run?: { workflow_id: string; execution_id: string } | null;
  // The rehearsals debriefed so far, with the latest (0.20); null before the first
  practice?: { sessions: number; last: Pick<SessionSummary, "session_id" | "at" | "overall" | "headline"> } | null;
  // What happened in the real meeting (0.28), from the presenter's voice note or notes; null before. A meeting with one is done.
  after?: MeetingAfter | null;
}

// POST /after-meeting (0.28): what each person raised, promised and decided, the hit rate and the follow-up
export interface MeetingAfter {
  at: string;
  source: "voice" | "notes";
  transcript: string;
  // Who transcribed the voice note: "Sarvam", or "Sarvam and Whisper" when a piece fell back to Groq Whisper
  heard?: string;
  people: AfterPerson[];
  // Per person who had a practice seat in the last rehearsal: how many of the things they raised it had asked
  predictions: { email: string; name: string; asked: number; predicted: number; practice_asked: number }[];
  // waiting: in the presenter's inbox for approval; draft: it still has a [fill in: …] gap, so it's never offered for sending (0.29);
  // failed: approved but Gmail didn't send it
  followup: { to: string[]; subject: string; body: string; status: "waiting" | "draft" | "sent" | "declined" | "failed" | "none"; answered_at?: string };
  run: { workflow_id: string; execution_id: string } | null;
}

export interface AfterPerson {
  email: string;
  name: string;
  raised: { text: string; quote: string }[];
  promised: { text: string; quote: string }[];
  decided: { text: string; quote: string }[];
  next_step: string;
}

// Only facts: real attendees, sourced news. Hypothetical roles live in the proposal's practice panel.
export interface MeetingBrief {
  summary: string;
  company: { what_they_do: string; recent_news: { text: string; date: string }[] };
  attendees: { name: string; email: string; role: string; likely_focus: string }[];
  questions: { question: string; asked_by: string; why: string; suggested_answer: string }[];
  risks: string[];
  sources: { title: string; url: string }[];
  // For each attendee with a twin (0.27): what they raised and what the presenter promised, facts only, newest first
  since_last_time?: SinceLastTime[];
}

export interface SinceLastTime {
  email: string;
  name: string;
  raised: { text: string; date: string; source: string }[];
  promised: { text: string; date: string; source: string }[];
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
  // What the presenter offers (0.26)
  offer?: string;
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
  // How long the presenter means to pitch, sent to /prep; starts at n8n's suggestion, or 5. null: no time limit (0.25)
  pitch_minutes: number | null;
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

// ---------------------------------------------------------------- Twins (0.27): one per real person, keyed by email

export type TwinSourceType = "email" | "meeting_note" | "web" | "news" | "manual";
// connected: sure (the same address, the presenter's note, or confirmed); suggested: found by name, waiting; rejected: kept so it's never suggested again
export type TwinStatus = "connected" | "suggested" | "rejected";
export type TwinFactKind = "raised" | "promised" | "decision" | "preference" | "role" | "context";

export interface TwinSource {
  id: string;
  type: TwinSourceType;
  title: string;
  date: string;
  url?: string;
  from?: string;
  status: TwinStatus;
  why?: string;
  key: string;
  // A note or pasted text the presenter added
  text?: string;
}

export interface TwinFact {
  id: string;
  kind: TwinFactKind;
  text: string;
  source_id: string;
  quote: string;
  status: TwinStatus;
  added: string;
}

// n8n's interpretation, never a fact: at least two connected facts behind it
export interface TwinReading {
  id: string;
  text: string;
  evidence: string[];
}

export interface TwinMeeting {
  id: string;
  title: string;
  date: string;
}

// What one build step added, by id (the build log) or whole (the live stream)
export interface TwinAdds<T = string> {
  sources: T extends string ? string[] : TwinSource[];
  facts: T extends string ? string[] : TwinFact[];
  readings: T extends string ? string[] : TwinReading[];
  meetings?: T extends string ? string[] : TwinMeeting[];
}

export type TwinStepId = "load" | "emails" | "meetings" | "mentions" | "fallback" | "extract" | "save";

export interface TwinLogStep {
  step: TwinStepId;
  text: string;
  // ms from the start of the build
  t: number;
  adds: TwinAdds;
}

export interface Twin {
  email: string;
  aliases: string[];
  name: string;
  company: string;
  role: { text: string; source_id: string } | null;
  sources: TwinSource[];
  facts: TwinFact[];
  readings: TwinReading[];
  meetings: TwinMeeting[];
  // Per real meeting (0.28): how many of the things they raised (asked) the last rehearsal's practice seat had asked (predicted), and
  // which of their facts those were (matched)
  predictions: TwinPrediction[];
  build_log: TwinLogStep[];
  updated: string;
  sample: boolean;
}

export interface TwinPrediction {
  meeting_id: string;
  date?: string;
  asked: number;
  predicted: number;
  matched?: string[];
}

export interface TwinSummary {
  facts: number;
  meetings: number;
  to_check: number;
  last_met: string | null;
}

// GET /twins: everyone DryRun knows
export interface TwinListItem extends TwinSummary {
  email: string;
  name: string;
  company: string;
  role: string;
  updated: string;
}

// POST /twin/update: one change in the batch
export type TwinChange =
  | { op: "confirm" | "reject"; source_id: string }
  | { op: "note"; text: string; kind?: TwinFactKind }
  | { op: "alias"; email: string }
  | { op: "delete"; fact_id: string }
  | { op: "forget" };
