import type { Bundle, LiveSession, PersonaId, Reaction, TelemetryEvent, TurnMode, TurnRequest, TurnResponse } from "../contract";
import type { Recording } from "./voice-activity";
import { minimumLevel } from "./voice-activity";
import { concat, encodeWav, toBase64, trimSilence } from "./wav";

// How the browser takes turns with the panel: a port of the headset's TurnTaker.cs and SessionController.WrapUp (tuned there; keep
// the numbers and their names), plus the Rescue Agent's cues. n8n decides who reacts and what they say; this only decides when to send
// what the presenter said, when someone may speak, and which reactions are too late to play. Everything it touches is injected, so it
// runs without a browser.

// Seconds
export const turnTimeoutS = 15;
export const pitchEndTimeoutS = 20;
export const minSpeechS = 1.5;
export const preRollS = 1;
export const answerPauseS = 1.2;
export const maxTurnS = 90;
export const defaultSlideS = 60;
export const minHandS = 1.2;
export const handTimeoutS = 15;
export const welcomeLateS = 3;
export const muteTailS = 0.4;
export const gapS = 0.4;
export const questionsQuietEndS = 25;
export const wrapUpSilence = 4;
export const wrapUpCountdown = 3;
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
  beginRecording(preRoll?: number): void;
  takeRecording(): Recording;
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
}

interface Speaking {
  item: Queued;
  start: number;
  // For a caption with no voice
  until: number | null;
  stop: (() => void) | null;
  handDown: boolean;
}

const EMPTY_VIEW: TurnView = { active: false, stage: "opening", speaking: null, hands: [], caption: null, prompt: null, cue: null, wrapUp: null, inFlight: 0 };

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
  private slideSince = 0;
  private speechClock = 0;
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
    this.slideSince = now;
    this.speechClock = 0;
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
    }
    const slideNow = this.deps.slide();

    if (this.stage === "opening" && this.mode === "opening") this.opening(paused, slideNow, now);
    else if (this.mode === "answer" && this.askedBy) this.answering(speaking, slideNow, now);
    else if (this.stage === "pitch" && this.mode === "segment") this.pitching(paused, slideNow, now);

    if (this.active) this.wrapUp(speaking, slideNow, now);
    if (this.active) this.playQueue(speaking, slideNow, now);
    if (this.active) this.rescue(speaking, now);
    if (this.active) this.maybeEnd(speaking, now);
    this.publish();
  }

  // 6.2 Opening: the first pause (or a slide change) sends what was said, then the pitch starts
  private opening(paused: boolean, slideNow: number, now: number): void {
    if (!((paused && this.ears.recordedSpeech > openingMinS) || slideNow !== this.slide)) return;
    const rec = this.ears.takeRecording();
    if (rec.speech > openingMinS) this.send("opening", this.slide, [rec]);
    this.stage = "pitch";
    this.mode = "segment";
    this.slide = slideNow;
    this.slideSince = now;
  }

  // An answer is done at a pause; during the pitch a slide change or a long answer cuts it off
  private answering(speaking: boolean, slideNow: number, now: number): void {
    const moved = this.stage === "pitch" && slideNow !== this.slide;
    const done = !speaking && this.ears.quietFor >= answerPauseS && this.ears.recordedSpeech > answerMinS;
    if (!done && !moved && this.ears.recordedSeconds <= maxTurnS) return;
    const rec = this.ears.takeRecording();
    if (rec.speech > answerMinS) this.send("answer", this.slide, [rec], this.askedBy ?? undefined);
    // In the questions everything is an answer, until someone else asks
    if (this.stage === "pitch" && (rec.speech > answerMinS || moved)) {
      this.mode = "segment";
      this.askedBy = null;
    }
    if (moved) {
      const held = this.takeHeld();
      if (sum(held) >= minSpeechS) this.send("segment", this.slide, held);
      this.slide = slideNow;
      this.slideSince = now;
    }
  }

  private pitching(paused: boolean, slideNow: number, now: number): void {
    if (slideNow !== this.slide) {
      const rec = [...this.takeHeld(), this.ears.takeRecording()];
      if (sum(rec) >= minSpeechS) this.send("segment", this.slide, rec);
      this.slide = slideNow;
      this.slideSince = now;
      return;
    }
    // A long slide goes in parts, at a pause, so n8n hears it in time to react
    const target = this.bundle.slides[this.slide]?.target_seconds ?? defaultSlideS;
    const long = now - this.slideSince > target || this.ears.recordedSeconds > maxTurnS;
    if (long && paused && !this.onLastSlide(slideNow)) {
      const rec = [...this.takeHeld(), this.ears.takeRecording()];
      if (sum(rec) >= minSpeechS) this.send("segment", this.slide, rec);
      this.slideSince = now;
    }
  }

  private onLastSlide(slideNow: number): boolean {
    const count = this.deps.slideCount();
    return count != null && slideNow >= count - 1;
  }

  // 6.5 At the pitch end, quiet after speaking there, with the panel idle: count down, then the questions
  private wrapUp(speaking: boolean, slideNow: number, now: number): void {
    if (this.stage !== "opening" && this.stage !== "pitch") return;
    const count = this.deps.slideCount();
    const atEnd = count != null ? slideNow >= count - 1 : this.deps.elapsed() >= noDeckPitchShare * (this.bundle.pitch_seconds || fallbackPitchS);
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
    // The pitch is over: the last slide goes with the pitch end
    this.wrap = { spoke: false, countdownFrom: null };
    const rec = [...this.takeHeld(), this.ears.takeRecording()];
    this.send("pitch_end", slideNow, rec);
    this.stage = "questions";
    this.mode = "answer";
    this.askedBy = null;
    this.slide = slideNow;
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
      if (!this.isLate(first, slideNow)) break;
      this.queue.shift();
    }
    const first = this.queue[0];
    if (!first) return;

    if (first.reaction.raise_hand && !first.hand) first.hand = { since: now, speechAt: this.speechClock };
    if (first.clip === undefined) return;
    if (speaking || now - this.lastVoiceEnd < gapS) return;
    if (first.hand && now - first.hand.since < minHandS) return;
    this.speak(first, now);
  }

  private isLate(q: Queued, slideNow: number): boolean {
    if (q.clip === null) return true;
    if (q.mode === "opening" && this.speechClock - q.speechAtSend > welcomeLateS) return true;
    if ((q.mode === "opening" || q.mode === "segment") && slideNow - q.slide >= 2) return true;
    if (q.hand && this.speechClock - q.hand.speechAt > handTimeoutS) return true;
    return false;
  }

  private speak(item: Queued, now: number): void {
    // A question mid-slide doesn't split the slide's transcript: what was said so far waits for the rest of the slide
    if (this.stage === "pitch" && this.mode === "segment") this.held.push(this.ears.takeRecording());
    this.queue.shift();
    this.ears.mute();
    const { reaction } = item;
    this.caption = { persona_id: reaction.persona_id, text: reaction.text, until: Infinity };
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
      this.ears.beginRecording();
    }
    this.publish();
    this.maybeEnd(this.ears.speaking, now);
  }

  // 6.6 Rescue cues: silence during the pitch, with the panel idle, shows the slide's calm, keyword and bridge in turn
  private rescue(speaking: boolean, now: number): void {
    const eligible = this.stage === "pitch" && !speaking && !this.panelBusy() && this.hands().length === 0 && this.wrap.countdownFrom == null;
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
    // The strongest cue the slide has, up to this level
    const r = this.bundle.slides[this.slide]?.rescue;
    const texts = r ? [r.calm, r.keyword, r.bridge] : [];
    const shown = ([3, 2, 1] as const).find((l) => l <= level && texts[l - 1]?.trim());
    this.cue = shown ? { level: shown, text: texts[shown - 1] } : null;
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

  private takeHeld(): Recording[] {
    const held = this.held;
    this.held = [];
    return held;
  }

  private send(mode: TurnMode, slide: number, parts: Recording[], askedBy?: PersonaId): void {
    const run = this.run;
    const now = this.deps.now();
    const samples = trimSilence(concat(parts.map((p) => p.samples)), Math.max(minimumLevel * 0.5, Math.max(0, this.ears.background) * 2));
    const request: TurnRequest = {
      session_id: this.sessionId,
      mode,
      slide_index: slide,
      t: round1(this.deps.elapsed()),
      audio_wav_base64: toBase64(encodeWav(samples)),
      ...(askedBy ? { asked_by: askedBy } : {}),
    };
    const speechAtSend = this.speechClock;
    this.inFlight++;
    this.lastActivity = now;
    this.deps.send(request, mode === "pitch_end" ? pitchEndTimeoutS : turnTimeoutS).then(
      (reply) => this.receive(run, mode, slide, speechAtSend, reply),
      () => this.receive(run, mode, slide, speechAtSend, null),
    );
  }

  private receive(run: number, mode: TurnMode, slide: number, speechAtSend: number, reply: TurnResponse | null): void {
    // Late answers for a run that ended or restarted are ignored
    if (run !== this.run || !this.active) return;
    this.inFlight--;
    this.lastActivity = this.deps.now();
    if (!reply) {
      console.warn(`[Turns] ${mode} on slide ${slide + 1} failed: nobody reacts`);
      if (mode === "pitch_end") this.finish("n8n didn't answer the end of the pitch.");
      else this.publish();
      return;
    }
    const lines = new Map(this.bundle.lines.map((l) => [l.id, l.audio_url]));
    for (const reaction of reply.reactions ?? []) {
      const url = reaction.audio_url ?? (reaction.line_id ? lines.get(reaction.line_id) : undefined);
      const item: Queued = { reaction, mode, slide, speechAtSend, clip: url ? undefined : "text", hand: null };
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
    if (reply.end_session) {
      this.stage = "closing";
      this.endWhenPlayed = true;
    }
    this.publish();
    this.maybeEnd(this.ears.speaking, this.deps.now());
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
      inFlight: this.inFlight,
    };
    if (JSON.stringify(next) === JSON.stringify(this.view)) return;
    this.view = next;
    this.onView?.(next);
  }
}

function sum(parts: Recording[]): number {
  return parts.reduce((n, p) => n + p.speech, 0);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
