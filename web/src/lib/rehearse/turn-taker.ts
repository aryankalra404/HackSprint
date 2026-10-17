import type { Bundle, LiveSession, PersonaId, Reaction, TelemetryEvent, TurnMode, TurnRequest, TurnResponse, VoicedLine } from "../contract";
import type { Recording } from "./voice-activity";
import { minimumLevel } from "./voice-activity";
import { SAMPLE_RATE, concat, encodeWav, toBase64, trimSilence } from "./wav";

// How the browser takes turns with the panel: a port of the headset's TurnTaker.cs and SessionController.WrapUp (tuned there; keep
// the numbers and their names), plus the Rescue Agent's cues. n8n decides who reacts and what they say; this only decides when to send
// what the presenter said, when someone may speak, and which reactions are too late to play. Time never decides when a slide is sent
// (0.25): each slide goes whole when the presenter moves on, and mid-slide only at the interruption points n8n planned. With a time
// limit, the chair keeps time with lines n8n voiced ahead of time. Everything it touches is injected, so it runs without a browser.
// A meeting that flows (0.34): an answer the presenter carries on after a pause to think is sent again whole (replaces_t) and the panel's
// reaction to the half of it is dropped; one question waits for its answer at a time; a hand ignored for a while cuts in at the
// presenter's next breath; near the end of the pitch a pause sends the slide so far, so n8n can hear "that's all from me" and the chair
// opens the floor; the chair's spoken rescue comes at most once per slide.

// Seconds
export const turnTimeoutS = 15;
export const pitchEndTimeoutS = 20;
export const minSpeechS = 1.5;
export const preRollS = 1;
export const answerPauseS = 0.8;
export const maxTurnS = 90;
// A slide recorded for longer than this goes at the next pause anyway, only so each upload stays small
export const maxSegmentS = 300;
export const minHandS = 1.2;
export const handTimeoutS = 15;
export const welcomeLateS = 3;
export const muteTailS = 0.4;
export const gapS = 0.4;
export const questionsQuietEndS = 25;
export const wrapUpSilence = 3;
export const wrapUpCountdown = 2;
// 0.34 A raised hand ignored for this much of the presenter's speech cuts in at their next breath (the level down this long)
export const cutInAfterS = 6;
export const breathS = 0.2;
// Speech after an answer went, before the panel reacted, that means the presenter is carrying on
export const carryOnS = 0.6;
// Near the end of the pitch, a pause this long (after speech ended; shorter on the last slide) sends the slide so far, from this share
// of the pitch length on (always on the last slide and without a deck), with this much new speech since the last one
export const pauseCheckS = 1.2;
export const lastSlidePauseCheckS = 0.7;
export const pauseCheckFrom = 0.6;
export const pauseCheckSpeechS = 1;
// The chair's spoken rescue comes at most this often, and once per slide
export const rescueCooldownS = 30;
// A filler that hasn't started this long after the answer went is dropped (0.26)
export const fillerLateS = 1.5;
// The opening goes once this much is said; an answer needs this much speech to count
const openingMinS = 0.4;
const answerMinS = 0.5;
// A hand goes down this long after its owner starts speaking
const handDownS = 0.6;
// A caption stays this long after the voice stops
const captionTailS = 2;
// With no deck, the pitch ends from time: this share of the pitch length (300 s without one)
const noDeckPitchShare = 0.8;
const fallbackPitchS = 300;

export type Stage = LiveSession["stage"];

// The mic side, as VoiceActivity provides it
export interface Ears {
  readonly speaking: boolean;
  readonly quietFor: number;
  readonly recordedSpeech: number;
  readonly recordedSeconds: number;
  readonly background: number;
  // Seconds the level has been down: a breath between words (0.34)
  readonly gapFor: number;
  beginRecording(preRoll?: number): void;
  takeRecording(): Recording;
  peekRecording(): Recording;
  mute(): void;
  unmuteAfter(seconds: number): void;
}

export interface Clip {
  duration: number;
}

export interface TurnDeps {
  // Seconds, any monotonic clock
  now(): number;
  // Seconds since the session started (the turns' and events' t)
  elapsed(): number;
  // The slide on screen, and how many there are (null without a deck)
  slide(): number;
  slideCount(): number | null;
  // Resolves null when the turn failed or timed out
  send(request: TurnRequest, timeoutS: number): Promise<TurnResponse | null>;
  // A voice, decoded; null if it couldn't be
  load(url: string): Promise<Clip | null>;
  // Plays a loaded voice; returns a stop function. onEnd isn't called after stop.
  play(clip: Clip, onEnd: () => void): () => void;
  // The session ended by itself (the chair closed, a failed pitch end, quiet questions)
  ended(reason: string): void;
}

// What the page shows
export interface TurnView {
  active: boolean;
  stage: Stage;
  speaking: PersonaId | null;
  hands: PersonaId[];
  caption: { persona_id: PersonaId; text: string } | null;
  // "Priya has a question."
  prompt: string | null;
  cue: { level: 1 | 2 | 3; text: string } | null;
  // Seconds left before the questions, while counting down
  wrapUp: number | null;
  // The pitch against its time limit, during the opening and the pitch; null with no limit
  time: { elapsed: number; limit: number; tone: "ok" | "near" | "over" } | null;
  inFlight: number;
}

interface Queued {
  reaction: Reaction;
  mode: TurnMode;
  slide: number;
  speechAtSend: number;
  // undefined while loading, null if it failed; "text" for a reaction with no voice (shown as a caption for a while)
  clip: Clip | null | undefined | "text";
  hand: { since: number; speechAt: number } | null;
  // The chair keeping time: played by this client, never late, and time_up ends the pitch once it's said. A filler (0.26) is played
  // by this client the moment an answer goes, and dropped if it can't start soon.
  local?: "time_nudge" | "time_up" | "filler" | "rescue";
  queuedAt?: number;
  // The turn whose reply this came in, and when that turn was sent (0.34: a question decided before another was asked is dropped)
  turn: number;
  sentAt: number;
}

interface Speaking {
  item: Queued;
  start: number;
  // For a caption with no voice
  until: number | null;
  stop: (() => void) | null;
  handDown: boolean;
}

const EMPTY_VIEW: TurnView = { active: false, stage: "opening", speaking: null, hands: [], caption: null, prompt: null, cue: null, wrapUp: null, time: null, inFlight: 0 };
// The pitch clock turns amber at this share of the limit
const nearShare = 0.8;

export class TurnTaker {
  view: TurnView = EMPTY_VIEW;
  onView?: (view: TurnView) => void;

  private active = false;
  private run = 0;
  private sessionId = "";
  private stage: Stage = "opening";
  private mode: "opening" | "segment" | "answer" = "opening";
  private askedBy: PersonaId | null = null;
  private slide = 0;
  // The speech clock when the current slide began, for the interruption points
  private slideSpeechFrom = 0;
  private speechClock = 0;
  private points: { slide: number; after: number; used: boolean }[] = [];
  private timeKept = { nudged: false, cut: false };
  private held: Recording[] = [];
  private inFlight = 0;
  private queue: Queued[] = [];
  private current: Speaking | null = null;
  private lastVoiceEnd = -Infinity;
  private caption: { persona_id: PersonaId; text: string; until: number } | null = null;
  private endWhenPlayed = false;
  private lastActivity = 0;
  private lastTick = 0;
  private wasSpeaking = false;
  private wrap = { spoke: false, countdownFrom: null as number | null };
  private cueFrom = 0;
  private silence: { from: number; level: 0 | 1 | 2 | 3 } | null = null;
  private silences: TelemetryEvent[] = [];
  private cue: TurnView["cue"] = null;
  private lastFiller: string | null = null;
  // A freeze in the pitch (0.26): whether the chair has said "Take your time" and asked the way back in, until the presenter speaks
  private freeze = { soft: false, asked: false };
  private rescuedSlides = new Set<number>();
  private softSlides = new Set<number>();
  private lastRescueAt = -Infinity;
  // 0.34 Turns are numbered; the last answer sent stays here until the panel's reaction to it starts, so if the presenter carries on
  // first, it's sent again whole and the reaction to the half of it is dropped
  private turnSeq = 0;
  private lastAnswer: { turn: number; t: number; samples: Float32Array; by: PersonaId; carried: boolean } | null = null;
  private replaced = new Set<number>();
  // When the last question finished (a question decided before it is stale), and the pause check near the end of the pitch
  private lastQuestionAt = -Infinity;
  private pauseSent = false;
  private pauseSpeechAt = 0;

  constructor(
    private readonly bundle: Bundle,
    private readonly ears: Ears,
    private readonly deps: TurnDeps,
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  // The session went live (or is resumed after a reload, at the stage the laptop kept)
  begin(sessionId: string, stage: Stage = "opening"): void {
    const now = this.deps.now();
    this.run++;
    this.active = true;
    this.sessionId = sessionId;
    this.stage = stage;
    this.mode = stage === "opening" ? "opening" : stage === "pitch" ? "segment" : "answer";
    this.askedBy = null;
    this.slide = this.deps.slide();
    this.speechClock = 0;
    this.slideSpeechFrom = 0;
    this.points = (this.bundle.plan.interrupts ?? []).map((p) => ({ slide: p.slide_index, after: p.after_s, used: false }));
    this.timeKept = { nudged: false, cut: false };
    this.held = [];
    this.inFlight = 0;
    this.queue = [];
    this.current = null;
    this.caption = null;
    this.endWhenPlayed = false;
    this.lastActivity = now;
    this.lastTick = now;
    this.wasSpeaking = this.ears.speaking;
    this.wrap = { spoke: false, countdownFrom: null };
    this.cueFrom = now;
    this.silence = null;
    this.silences = [];
    this.cue = null;
    this.lastFiller = null;
    this.freeze = { soft: false, asked: false };
    this.rescuedSlides = new Set();
    this.softSlides = new Set();
    this.lastRescueAt = -Infinity;
    this.lastAnswer = null;
    this.replaced = new Set();
    this.lastQuestionAt = -Infinity;
    this.pauseSent = false;
    this.pauseSpeechAt = 0;
    this.ears.beginRecording(preRollS);
    this.publish();
  }

  // Stops taking turns (the session ended, here or elsewhere). Returns the silences for the debrief.
  stop(): TelemetryEvent[] {
    if (this.active) this.closeSilence(this.deps.now());
    this.active = false;
    this.run++;
    this.current?.stop?.();
    this.current = null;
    this.queue = [];
    this.caption = null;
    this.cue = null;
    this.ears.unmuteAfter(0);
    this.publish();
    return this.silences;
  }

  // Run it every 100 ms or so
  tick(): void {
    if (!this.active) return;
    const now = this.deps.now();
    const dt = Math.max(0, now - this.lastTick);
    this.lastTick = now;
    const speaking = this.ears.speaking;
    const paused = this.wasSpeaking && !speaking;
    this.wasSpeaking = speaking;
    if (speaking) {
      this.speechClock += dt;
      this.lastActivity = now;
      this.freeze = { soft: false, asked: false };
    }
    const slideNow = this.deps.slide();

    if (this.stage === "opening" && this.mode === "opening") this.opening(paused, slideNow);
    else if (this.mode === "answer" && this.askedBy) this.answering(speaking, slideNow);
    else if (this.stage === "pitch" && this.mode === "segment") this.pitching(paused, slideNow);

    if (this.active) this.wrapUp(speaking, slideNow, now);
    if (this.active) this.keepTime();
    if (this.active) this.playQueue(speaking, slideNow, now);
    if (this.active) this.rescue(speaking, now);
    if (this.active) this.maybeEnd(speaking, now);
    this.publish();
  }

  // 6.2 Opening: the first pause (or a slide change) sends what was said, then the pitch starts
  private opening(paused: boolean, slideNow: number): void {
    if (!((paused && this.ears.recordedSpeech > openingMinS) || slideNow !== this.slide)) return;
    const rec = this.ears.takeRecording();
    if (rec.speech > openingMinS) this.send("opening", this.slide, [rec]);
    this.stage = "pitch";
    this.mode = "segment";
    this.toSlide(slideNow);
  }

  private toSlide(slideNow: number): void {
    this.slide = slideNow;
    this.slideSpeechFrom = this.speechClock;
  }

  // An answer is done at a pause; during the pitch a slide change or a long answer cuts it off
  private answering(speaking: boolean, slideNow: number): void {
    const last = this.lastAnswer;
    // 0.34 They carry on the answer they just sent before the panel has reacted to it: that reaction is dropped (n8n heard half the
    // answer), and the whole answer goes again at the next pause. During the pitch, talking on after an answer already sent again whole
    // is the pitch going on.
    if (last && !this.replaced.has(last.turn) && last.by === this.askedBy && this.ears.recordedSpeech >= carryOnS) {
      if (this.stage === "pitch" && last.carried) return this.backToPitch();
      this.replaced.add(last.turn);
      this.queue = this.queue.filter((q) => q.turn !== last.turn || q.local != null);
    }
    const moved = this.stage === "pitch" && slideNow !== this.slide;
    // Someone who has already paused to think in this answer gets twice as long
    const carrying = !!last && this.replaced.has(last.turn);
    const done = !speaking && this.ears.quietFor >= (carrying ? 2 * answerPauseS : answerPauseS) && this.ears.recordedSpeech > answerMinS;
    if (!done && !moved && this.ears.recordedSeconds <= maxTurnS) return;
    const rec = this.ears.takeRecording();
    if (rec.speech > answerMinS) {
      // The rest of an answer goes with what came before it, replacing that turn
      const carried = last && carrying && last.by === this.askedBy ? last : null;
      this.send("answer", this.slide, carried ? [{ samples: carried.samples, speech: 0 }, { samples: new Float32Array(Math.round(0.3 * SAMPLE_RATE)), speech: 0 }, rec] : [rec], this.askedBy ?? undefined, carried ? { replaces_t: carried.t } : {});
    }
    // Whatever comes next is still answering, until the panel reacts: in the questions until someone else asks, during the pitch until
    // the asker hands back (or the reply has nothing to say). Moving to another slide ends it.
    if (moved) {
      this.backToPitch();
      const held = this.takeHeld();
      if (sum(held) >= minSpeechS) this.send("segment", this.slide, held);
      this.toSlide(slideNow);
    }
  }

  // Each slide goes whole when the presenter moves on, however long they took. Mid-slide only at the next pause once they've said
  // enough to reach one of n8n's interruption points on it, so that person can raise a hand in time (n8n still decides if they do).
  private pitching(paused: boolean, slideNow: number): void {
    if (slideNow !== this.slide) {
      const rec = [...this.takeHeld(), this.ears.takeRecording()];
      if (sum(rec) >= minSpeechS) this.send("segment", this.slide, rec);
      this.toSlide(slideNow);
      return;
    }
    // 0.34 Near the end of the pitch, a pause sends a copy of the slide so far: n8n listens for a finish ("that's all from me") and,
    // hearing one, the chair opens the floor. The slide's recording carries on, so it's still sent whole when they move on. Only with
    // real speech in it: Whisper hears "Thank you" in a silent clip.
    if (this.ears.speaking) this.pauseSent = false;
    else if (!this.pauseSent && !this.panelBusy() && this.pauseCheckDue(slideNow) && this.wrap.countdownFrom == null) {
      const atEnd = this.atPitchEnd(slideNow);
      const speech = this.ears.recordedSpeech + sum(this.held);
      if (this.ears.quietFor >= (atEnd ? lastSlidePauseCheckS : pauseCheckS) && this.speechClock - this.pauseSpeechAt >= pauseCheckSpeechS && speech >= pauseCheckSpeechS) {
        this.pauseSent = true;
        this.pauseSpeechAt = this.speechClock;
        this.send("segment", this.slide, [...this.held, this.ears.peekRecording()], undefined, { pause: true });
        return;
      }
    }
    if (!paused) return;
    const said = this.speechClock - this.slideSpeechFrom;
    const due = this.points.filter((p) => !p.used && p.slide === this.slide && said >= p.after);
    if (!due.length && this.ears.recordedSeconds <= maxSegmentS) return;
    for (const p of due) p.used = true;
    const rec = [...this.takeHeld(), this.ears.takeRecording()];
    if (sum(rec) >= minSpeechS) this.send("segment", this.slide, rec, undefined, due.length ? { mid_slide: true } : {});
  }

  // The last slide, or without a deck, near the planned length
  private atPitchEnd(slideNow: number): boolean {
    const count = this.deps.slideCount();
    return count != null ? slideNow >= count - 1 : this.deps.elapsed() >= noDeckPitchShare * (this.bundle.pitch_seconds || fallbackPitchS);
  }

  // Pauses are checked on the last slide, without a deck, and from pauseCheckFrom of the pitch length on
  private pauseCheckDue(slideNow: number): boolean {
    const count = this.deps.slideCount();
    if (this.stage !== "pitch" || count == null || slideNow >= count - 1) return this.stage === "pitch";
    return this.deps.elapsed() >= pauseCheckFrom * (this.bundle.pitch_seconds || fallbackPitchS);
  }

  // Back to the slide after an answer during the pitch: what they say next is the pitch again
  private backToPitch(): void {
    if (this.stage !== "pitch" || this.mode !== "answer") return;
    this.mode = "segment";
    this.askedBy = null;
    this.lastAnswer = null;
  }

  // 6.5 At the pitch end, quiet after speaking there, with the panel idle: count down, then the questions
  private wrapUp(speaking: boolean, slideNow: number, now: number): void {
    if (this.stage !== "opening" && this.stage !== "pitch") return;
    const atEnd = this.atPitchEnd(slideNow);
    if (!atEnd) {
      this.wrap = { spoke: false, countdownFrom: null };
      return;
    }
    if (speaking) this.wrap.spoke = true;
    const ready = this.wrap.spoke && !speaking && this.ears.quietFor >= wrapUpSilence && !this.panelBusy() && this.hands().length === 0;
    if (!ready) {
      this.wrap.countdownFrom = null;
      return;
    }
    this.wrap.countdownFrom ??= now;
    if (now - this.wrap.countdownFrom < wrapUpCountdown) return;
    this.endPitch(slideNow, false);
  }

  // The presenter says the pitch is over (the speaker view's button), on any slide: without a deck there's no last slide to wrap up on,
  // and before this a pitch that finished early sat in silence until its time ran out. Whoever was speaking stops; on to the questions.
  takeQuestions(): void {
    if (!this.active || (this.stage !== "opening" && this.stage !== "pitch")) return;
    this.current?.stop?.();
    this.current = null;
    this.queue = [];
    this.caption = null;
    this.cue = null;
    this.ears.unmuteAfter(0);
    this.closeSilence(this.deps.now());
    this.endPitch(this.deps.slide(), false);
    this.publish();
  }

  // The pitch is over (wrapped up, stopped for time, or n8n heard the presenter finish at a pause): the last slide goes with the pitch
  // end, then the questions
  private endPitch(slideNow: number, timeUp: boolean, floorOpened = false): void {
    this.wrap = { spoke: false, countdownFrom: null };
    const rec = [...this.takeHeld(), this.ears.takeRecording()];
    this.send("pitch_end", slideNow, rec, undefined, timeUp ? { time_up: true } : floorOpened ? { floor_opened: true } : {});
    this.stage = "questions";
    this.mode = "answer";
    this.askedBy = null;
    this.lastAnswer = null;
    this.slide = slideNow;
  }

  // 0.25 With a time limit, the chair keeps time as n8n planned it: says time is nearly up, and maybe stops the pitch for the questions.
  // From lines voiced ahead of time, at the presenter's next pause (the queue waits for it), with nothing sent to n8n. Never over the
  // panel, a raised hand, a turn on its way, an answer or the wrap-up countdown.
  private keepTime(): void {
    const time = this.bundle.time;
    if (!time?.limit_s || this.stage !== "pitch" || this.mode !== "segment") return;
    if (this.panelBusy() || this.wrap.countdownFrom != null) return;
    const elapsed = this.deps.elapsed();
    const chair = this.bundle.personas.find((p) => p.chair);
    if (time.cut_at_s > 0 && elapsed >= time.cut_at_s && !this.timeKept.cut) {
      this.timeKept = { nudged: true, cut: true };
      const line = chair && this.line(chair.id, "time_up");
      // Without the chair's line, the pitch still ends, and n8n opens the floor as usual
      if (line) this.say(line, "time_up");
      else this.endPitch(this.deps.slide(), false);
      return;
    }
    if (time.nudge_at_s > 0 && elapsed >= time.nudge_at_s && !this.timeKept.nudged) {
      this.timeKept.nudged = true;
      const line = chair && this.line(chair.id, "time_nudge");
      if (line) this.say(line, "time_nudge");
    }
  }

  private line(personaId: PersonaId, kind: VoicedLine["kind"]): VoicedLine | undefined {
    return this.bundle.lines.find((l) => l.persona_id === personaId && l.kind === kind);
  }

  // 0.26 The panel answers at once while n8n decides: the asker's "Mm-hm" when an answer goes, the chair's "Thank you" at the pitch
  // end. Only a voiced one (a filler as a caption would be noise), never the same one twice in a row.
  private filler(personaId: PersonaId | undefined, kind: "filler" | "thanks"): void {
    if (!personaId) return;
    const own = this.bundle.lines.filter((l) => l.persona_id === personaId && l.kind === kind && l.audio_url);
    const pick = own.filter((l) => l.id !== this.lastFiller);
    const line = pick[Math.floor(Math.random() * pick.length)] ?? own[0];
    if (!line) return;
    this.lastFiller = line.id;
    this.say(line, "filler");
  }

  // Queues a line voiced ahead of time, played by this client
  private say(line: VoicedLine, local: "time_nudge" | "time_up" | "filler" | "rescue"): void {
    const run = this.run;
    const reason = local === "filler" ? "Listening" : local === "rescue" ? "You went quiet" : "Keeping time";
    // The way-back-in question is a real question: what the presenter says next is its answer
    const kind: Reaction["kind"] = local === "filler" || (local === "rescue" && line.kind !== "rescue_question") ? "acknowledge" : local === "rescue" ? "question" : local;
    const reaction: Reaction = { persona_id: line.persona_id, kind, text: line.text, line_id: line.id, raise_hand: false, reason };
    const now = this.deps.now();
    const item: Queued = { reaction, mode: "segment", slide: this.slide, speechAtSend: this.speechClock, clip: line.audio_url ? undefined : "text", hand: null, local, queuedAt: now, turn: 0, sentAt: now };
    this.queue.push(item);
    if (line.audio_url)
      this.deps.load(line.audio_url).then(
        (clip) => {
          if (run === this.run) item.clip = clip ?? "text";
        },
        () => {
          if (run === this.run) item.clip = "text";
        },
      );
  }

  // 6.3 The queue: drop late reactions, raise hands, and let the next person speak when the presenter pauses
  private playQueue(speaking: boolean, slideNow: number, now: number): void {
    if (this.current) {
      const c = this.current;
      if (!c.handDown && now - c.start >= handDownS) {
        c.handDown = true;
        c.item.hand = null;
      }
      if (c.until != null && now >= c.until) this.finishSpeaking(now);
      return;
    }

    while (this.queue.length) {
      const first = this.queue[0];
      // One question waits for its answer at a time (0.34): one decided before the last question was asked is stale
      if (!this.isLate(first, slideNow, now) && !(isQuestion(first) && first.sentAt < this.lastQuestionAt)) break;
      this.queue.shift();
      this.afterDrop(first);
    }
    const first = this.queue[0];
    if (!first) return;

    if (first.reaction.raise_hand && !first.hand) first.hand = { since: now, speechAt: this.speechClock };
    if (first.clip === undefined) return;
    // A hand the presenter has talked past for a while cuts in at their next breath, as people do (0.34)
    const cutsIn = !!first.hand && this.speechClock - first.hand.speechAt >= cutInAfterS && this.ears.gapFor >= breathS;
    if ((speaking && !cutsIn) || now - this.lastVoiceEnd < gapS) return;
    if (first.hand && now - first.hand.since < minHandS) return;
    this.speak(first, now);
  }

  private isLate(q: Queued, slideNow: number, now: number): boolean {
    if (q.local === "filler") return q.clip === null || now - (q.queuedAt ?? now) > fillerLateS;
    if (q.local) return false;
    if (q.clip === null) return true;
    if (q.mode === "opening" && this.speechClock - q.speechAtSend > welcomeLateS) return true;
    if ((q.mode === "opening" || q.mode === "segment") && slideNow - q.slide >= 2) return true;
    if (q.hand && this.speechClock - q.hand.speechAt > handTimeoutS) return true;
    // The reaction to an answer during the pitch, once they've been back on the pitch for a while (0.34)
    if (q.mode === "answer" && this.stage === "pitch" && this.mode === "segment" && this.speechClock - q.speechAtSend > 4) return true;
    return false;
  }

  // A dropped reaction that was the last word on an answer during the pitch: the slide goes on
  private afterDrop(q: Queued): void {
    if (q.mode === "answer" && (!this.lastAnswer || this.lastAnswer.turn === q.turn) && !this.queue.some((x) => x.turn === q.turn)) this.backToPitch();
  }

  private speak(item: Queued, now: number): void {
    // A question mid-slide doesn't split the slide's transcript: what was said so far waits for the rest of the slide
    if (this.stage === "pitch" && this.mode === "segment") this.held.push(this.ears.takeRecording());
    this.queue.shift();
    this.ears.mute();
    // The panel is reacting to the last answer: carrying on from here is a new answer (0.34)
    if (item.local == null && this.lastAnswer && item.turn === this.lastAnswer.turn) this.lastAnswer = null;
    const { reaction } = item;
    // A filler is only heard, never captioned
    if (item.local !== "filler") this.caption = { persona_id: reaction.persona_id, text: reaction.text, until: Infinity };
    this.lastActivity = now;
    const speaking: Speaking = { item, start: now, until: null, stop: null, handDown: !item.hand };
    this.current = speaking;
    if (item.clip === "text" || !item.clip) {
      // No voice: the caption stands in for it, as long as it takes to read
      const words = reaction.text.split(/\s+/).filter(Boolean).length;
      speaking.until = now + Math.max(2, words / 2.5);
    } else {
      const run = this.run;
      speaking.stop = this.deps.play(item.clip, () => {
        if (this.run === run && this.current === speaking) this.finishSpeaking(this.deps.now());
      });
    }
  }

  private finishSpeaking(now: number): void {
    const c = this.current;
    if (!c) return;
    this.current = null;
    this.ears.unmuteAfter(muteTailS);
    this.lastVoiceEnd = now;
    this.lastActivity = now;
    if (this.caption) this.caption.until = now + captionTailS;
    const { kind, persona_id } = c.item.reaction;
    if (kind === "question" || kind === "follow_up") {
      this.mode = "answer";
      this.askedBy = persona_id;
      this.lastAnswer = null;
      this.lastQuestionAt = now;
      this.ears.beginRecording();
    } else if (c.item.mode === "answer" && !this.queue.some((x) => x.turn === c.item.turn)) {
      // During the pitch, once the asker has reacted to the answer (and handed back), the slide goes on
      this.backToPitch();
    }
    // The chair stopped the pitch for time: on to the questions, without n8n opening the floor again
    if (c.item.local === "time_up" && this.stage === "pitch") this.endPitch(this.deps.slide(), true);
    this.publish();
    this.maybeEnd(this.ears.speaking, now);
  }

  // 6.6 Rescue cues: silence during the pitch, with the panel idle, shows the slide's calm, keyword and bridge in turn. 0.34 The cues
  // still show while a turn is on its way (a pause check); the chair only speaks once nothing is (voicedRescue).
  private rescue(speaking: boolean, now: number): void {
    // Not while they think about an answer: only a freeze in the pitch itself
    const eligible = this.stage === "pitch" && this.mode === "segment" && !speaking && !this.current && !this.queue.length && this.wrap.countdownFrom == null;
    if (!eligible) {
      this.cueFrom = now;
      this.closeSilence(now);
      return;
    }
    // The silence clock is the mic's, but not from before cues were allowed (the panel spoke, a hand was up)
    const quiet = Math.min(this.ears.quietFor, now - this.cueFrom);
    const [calm, keyword, bridge] = this.bundle.rescue_after_s ?? [3, 6, 10];
    const level: 0 | 1 | 2 | 3 = quiet >= bridge ? 3 : quiet >= keyword ? 2 : quiet >= calm ? 1 : 0;
    if (level === 0) {
      this.closeSilence(now);
      return;
    }
    if (!this.silence) this.silence = { from: now - quiet, level };
    this.silence.level = Math.max(this.silence.level, level) as 1 | 2 | 3;
    this.voicedRescue(quiet, keyword, bridge, now);
    // The strongest cue the slide has, up to this level
    const r = this.bundle.slides[this.slide]?.rescue;
    const texts = r ? [r.calm, r.keyword, r.bridge] : [];
    const shown = ([3, 2, 1] as const).find((l) => l <= level && texts[l - 1]?.trim());
    this.cue = shown ? { level: shown, text: texts[shown - 1] } : null;
  }

  // 0.26 The room reacts to a freeze, from lines voiced ahead of time with nothing sent to n8n: the chair's "Take your time" at the
  // keyword cue, then a few seconds later that slide's way-back-in question (once per slide), whose answer goes to n8n as an answer.
  // 0.34 Never while a turn is on its way, at most once per slide and rescueCooldownS apart, never on the last slide once the presenter
  // has spoken there (the wrap-up takes over) and never past the pitch's time limit (the chair's time-keeping does)
  private voicedRescue(quiet: number, keyword: number, bridge: number, now: number): void {
    const chair = this.bundle.personas.find((p) => p.chair);
    if (!chair || this.inFlight > 0) return;
    if (this.atPitchEnd(this.slide) && this.speechClock - this.slideSpeechFrom > 1) return;
    if (this.bundle.time?.limit_s && this.deps.elapsed() >= this.bundle.time.limit_s) return;
    const soft = this.line(chair.id, "rescue_soft");
    const question = this.bundle.lines.find((l) => l.kind === "rescue_question" && l.persona_id === chair.id && l.slide_index === this.slide && l.audio_url);
    // A new rescue waits out the cooldown; the question that follows "Take your time" in the same freeze doesn't
    const fresh = now - this.lastRescueAt >= rescueCooldownS;
    if (!this.freeze.soft && fresh && quiet >= keyword && soft?.audio_url && !this.softSlides.has(this.slide)) {
      this.freeze.soft = true;
      this.softSlides.add(this.slide);
      this.lastRescueAt = now;
      this.say(soft, "rescue");
      this.silences.push({ t: round1(this.deps.elapsed()), type: "rescue", level: 2, line_id: soft.id });
      return;
    }
    // After "Take your time" the silence clock starts again, so the question comes sooner
    const askAt = this.freeze.soft ? Math.max(2, bridge - keyword) : bridge;
    if (!this.freeze.asked && question && !this.rescuedSlides.has(this.slide) && quiet >= askAt && (this.freeze.soft || fresh)) {
      this.freeze.asked = true;
      this.rescuedSlides.add(this.slide);
      this.lastRescueAt = now;
      this.say(question, "rescue");
      this.silences.push({ t: round1(this.deps.elapsed()), type: "rescue", level: 3, line_id: question.id });
    }
  }

  // A silence that reached a cue goes in the telemetry
  private closeSilence(now: number): void {
    this.cue = null;
    const s = this.silence;
    this.silence = null;
    if (!s || s.level === 0) return;
    const duration = now - s.from;
    const t = Math.max(0, this.deps.elapsed() - duration);
    this.silences.push({ t: round1(t), type: "silence", duration_s: round1(duration), rescue_level: s.level });
  }

  private maybeEnd(speaking: boolean, now: number): void {
    if (!this.active) return;
    const idle = this.inFlight === 0 && this.queue.length === 0 && !this.current;
    if (this.endWhenPlayed && idle) return this.finish("The chair closed the meeting.");
    const quietQuestions = (this.stage === "questions" || this.stage === "closing") && idle && !speaking && now - this.lastActivity >= questionsQuietEndS;
    if (quietQuestions) this.finish("Nobody spoke for a while after the questions.");
  }

  private finish(reason: string): void {
    this.stop();
    this.deps.ended(reason);
  }

  private panelBusy(): boolean {
    return this.current != null || this.queue.length > 0 || this.inFlight > 0;
  }

  private hands(): PersonaId[] {
    const up = this.queue.filter((q) => q.hand).map((q) => q.reaction.persona_id);
    if (this.current?.item.hand) up.unshift(this.current.item.reaction.persona_id);
    return [...new Set(up)];
  }

  // Whole seconds, so the view only changes once a second
  private pitchClock(): TurnView["time"] {
    const limit = this.bundle.time?.limit_s;
    if (!this.active || !limit || (this.stage !== "opening" && this.stage !== "pitch")) return null;
    const elapsed = Math.floor(this.deps.elapsed());
    return { elapsed, limit, tone: elapsed >= limit ? "over" : elapsed >= nearShare * limit ? "near" : "ok" };
  }

  private takeHeld(): Recording[] {
    const held = this.held;
    this.held = [];
    return held;
  }

  private send(mode: TurnMode, slide: number, parts: Recording[], askedBy?: PersonaId, flags: Pick<TurnRequest, "mid_slide" | "time_up" | "pause" | "floor_opened" | "replaces_t"> = {}): void {
    const run = this.run;
    const now = this.deps.now();
    const turn = ++this.turnSeq;
    const samples = trimSilence(concat(parts.map((p) => p.samples)), Math.max(minimumLevel * 0.5, Math.max(0, this.ears.background) * 2));
    const request: TurnRequest = {
      session_id: this.sessionId,
      mode,
      slide_index: slide,
      t: round1(this.deps.elapsed()),
      audio_wav_base64: toBase64(encodeWav(samples)),
      ...(askedBy ? { asked_by: askedBy } : {}),
      ...flags,
    };
    const speechAtSend = this.speechClock;
    if (mode === "answer" && askedBy) this.lastAnswer = { turn, t: request.t, samples, by: askedBy, carried: flags.replaces_t != null };
    // The filler once per answer, not again for the rest of it; no thanks when the chair has already opened the floor
    if (mode === "answer" && flags.replaces_t == null) this.filler(askedBy, "filler");
    if (mode === "pitch_end" && !flags.floor_opened) this.filler(this.bundle.personas.find((p) => p.chair)?.id, "thanks");
    this.inFlight++;
    this.lastActivity = now;
    const sent = { turn, at: now, pause: !!flags.pause };
    this.deps.send(request, mode === "pitch_end" ? pitchEndTimeoutS : turnTimeoutS).then(
      (reply) => this.receive(run, mode, slide, speechAtSend, reply, sent),
      () => this.receive(run, mode, slide, speechAtSend, null, sent),
    );
  }

  private receive(run: number, mode: TurnMode, slide: number, speechAtSend: number, reply: TurnResponse | null, sent: { turn: number; at: number; pause: boolean }): void {
    // Late answers for a run that ended or restarted are ignored
    if (run !== this.run || !this.active) return;
    this.inFlight--;
    this.lastActivity = this.deps.now();
    const isLastAnswer = mode === "answer" && this.lastAnswer?.turn === sent.turn;
    if (!reply) {
      console.warn(`[Turns] ${mode} on slide ${slide + 1} failed: nobody reacts`);
      if (isLastAnswer) this.backToPitch();
      if (mode === "pitch_end") this.finish("n8n didn't answer the end of the pitch.");
      else this.publish();
      return;
    }
    // The presenter carried on this answer before the panel reacted: the whole answer has gone again instead (0.34)
    if (this.replaced.has(sent.turn)) return this.publish();
    // A pause (0.34): only a finish matters, and not if they've talked on since. n8n heard one: the chair opens the floor, and the pitch
    // end goes for the first question.
    if (sent.pause) {
      if (reply.pitch_over && this.stage === "pitch" && this.speechClock - speechAtSend < 1.5) {
        const opened = this.enqueue(reply.reactions ?? [], "pitch_end", slide, speechAtSend, run, sent).some((q) => q.reaction.kind === "open_floor");
        this.endPitch(this.deps.slide(), false, opened);
      }
      return this.publish();
    }
    this.enqueue(reply.reactions ?? [], mode, slide, speechAtSend, run, sent);
    // An answer during the pitch that nobody reacts to: back to the slide
    if (isLastAnswer && !this.queue.some((q) => q.turn === sent.turn)) this.backToPitch();
    if (reply.end_session) {
      this.stage = "closing";
      this.endWhenPlayed = true;
    }
    this.publish();
    this.maybeEnd(this.ears.speaking, this.deps.now());
  }

  private enqueue(reactions: Reaction[], mode: TurnMode, slide: number, speechAtSend: number, run: number, sent: { turn: number; at: number }): Queued[] {
    const lines = new Map(this.bundle.lines.map((l) => [l.id, l.audio_url]));
    const items: Queued[] = [];
    for (const reaction of reactions) {
      const url = reaction.audio_url ?? (reaction.line_id ? lines.get(reaction.line_id) : undefined);
      const item: Queued = { reaction, mode, slide, speechAtSend, clip: url ? undefined : "text", hand: null, turn: sent.turn, sentAt: sent.at };
      items.push(item);
      this.queue.push(item);
      if (url)
        this.deps.load(url).then(
          (clip) => {
            // A voice that won't play is still shown as a caption
            if (run === this.run) item.clip = clip ?? "text";
          },
          () => {
            if (run === this.run) item.clip = "text";
          },
        );
    }
    return items;
  }

  private publish(): void {
    const now = this.deps.now();
    if (this.caption && now >= this.caption.until) this.caption = null;
    const hands = this.hands();
    const asker = this.ears.speaking && hands.length ? this.bundle.personas.find((p) => p.id === hands[0]) : undefined;
    const name = asker ? asker.display_name.split(" ")[0] || asker.role_short : null;
    const next: TurnView = {
      active: this.active,
      stage: this.stage,
      speaking: this.current?.item.reaction.persona_id ?? null,
      hands,
      caption: this.caption ? { persona_id: this.caption.persona_id, text: this.caption.text } : null,
      prompt: name ? `${name} has a question.` : null,
      cue: this.active ? this.cue : null,
      wrapUp: this.wrap.countdownFrom != null ? Math.max(0, Math.ceil(wrapUpCountdown - (now - this.wrap.countdownFrom))) : null,
      time: this.pitchClock(),
      inFlight: this.inFlight,
    };
    if (JSON.stringify(next) === JSON.stringify(this.view)) return;
    this.view = next;
    this.onView?.(next);
  }
}

function isQuestion(q: Queued): boolean {
  return q.reaction.kind === "question" || q.reaction.kind === "follow_up";
}

function sum(parts: Recording[]): number {
  return parts.reduce((n, p) => n + p.speech, 0);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
