import { SAMPLE_RATE, concat, rms } from "./wav";

// When the presenter is speaking, from the mic's level (a port of the headset's VoiceActivity.cs, tuned there; keep the numbers).
// Pure: fed 16 kHz samples, its clock is the samples themselves (one window is windowSeconds). No browser APIs, so it can be tested.

export const windowSeconds = 0.1;
export const loudnessRatio = 3;
export const minimumLevel = 0.02;
export const speechHoldSeconds = 0.6;
export const silenceHoldSeconds = 0.8;
export const backgroundAdaptRate = 0.3;
// Recent audio kept for the pre-roll, so the first word isn't cut
const RING_SECONDS = 10;

export interface Recording {
  samples: Float32Array;
  // Seconds of speech in it
  speech: number;
}

export class VoiceActivity {
  // RMS of the last window, the learned background and the threshold from it
  level = 0;
  background = -1;
  speaking = false;
  // Seconds since speaking ended (0 while speaking)
  quietFor = 0;
  // While the panel speaks: nothing is speech, nothing is recorded, the background isn't learned
  muted = false;
  onSpeakingChange?: (speaking: boolean) => void;

  private pending: Float32Array[] = [];
  private pendingLength = 0;
  private loudFor = 0;
  private softFor = 0;
  private unmuteIn = -1;
  private ring = new Float32Array(RING_SECONDS * SAMPLE_RATE);
  private ringAt = 0;
  private ringFull = false;
  private chunks: Float32Array[] = [];
  private recordedSamples = 0;
  private speech = 0;

  constructor(private readonly rate = SAMPLE_RATE) {}

  get threshold(): number {
    return Math.max(minimumLevel, Math.max(0, this.background) * loudnessRatio);
  }

  // Seconds of audio and of speech in the current recording
  get recordedSeconds(): number {
    return this.recordedSamples / this.rate;
  }
  get recordedSpeech(): number {
    return this.speech;
  }
  // Seconds the level has been below the threshold: a breath between words while still speaking (0 while muted)
  get gapFor(): number {
    return this.muted ? 0 : this.softFor;
  }

  push(samples: Float32Array): void {
    const win = Math.round(this.rate * windowSeconds);
    this.pending.push(samples);
    this.pendingLength += samples.length;
    if (this.pendingLength < win) return;
    const all = concat(this.pending);
    let at = 0;
    for (; at + win <= all.length; at += win) this.window(all.subarray(at, at + win));
    const rest = all.slice(at);
    this.pending = rest.length ? [rest] : [];
    this.pendingLength = rest.length;
  }

  mute(): void {
    this.muted = true;
    this.unmuteIn = -1;
  }

  // Unmutes after `seconds` more of audio
  unmuteAfter(seconds: number): void {
    if (seconds <= 0) this.muted = false;
    else this.unmuteIn = seconds;
  }

  // Starts a new recording, with the last `preRoll` seconds of audio in front
  beginRecording(preRoll = 0): void {
    const n = Math.min(Math.round(preRoll * this.rate), this.ringFull ? this.ring.length : this.ringAt);
    this.chunks = n > 0 ? [this.fromRing(n)] : [];
    this.recordedSamples = n;
    this.speech = 0;
  }

  // The recording so far, left in place (a pause check sends a copy, contract 0.34)
  peekRecording(): Recording {
    return { samples: concat(this.chunks), speech: this.speech };
  }

  // The recording so far, and starts a new one
  takeRecording(): Recording {
    const out = { samples: concat(this.chunks), speech: this.speech };
    this.chunks = [];
    this.recordedSamples = 0;
    this.speech = 0;
    return out;
  }

  private window(samples: Float32Array): void {
    const dt = windowSeconds;
    this.level = rms(samples);
    if (this.background < 0) this.background = this.level;

    if (this.unmuteIn >= 0) {
      this.unmuteIn -= dt;
      if (this.unmuteIn <= 0) {
        this.muted = false;
        this.unmuteIn = -1;
      }
    }
    if (this.muted) {
      // Nothing counts while the panel speaks; the silence clock keeps going
      this.loudFor = 0;
      this.softFor = 0;
      if (this.speaking) this.setSpeaking(false);
      this.quietFor += dt;
      this.toRing(samples);
      return;
    }

    this.toRing(samples);
    this.chunks.push(samples.slice());
    this.recordedSamples += samples.length;

    if (this.level >= this.threshold) {
      this.loudFor += dt;
      this.softFor = 0;
    } else {
      this.softFor += dt;
      this.loudFor = 0;
    }

    if (!this.speaking && this.loudFor >= speechHoldSeconds) {
      // The hold was speech too
      this.speech += speechHoldSeconds;
      this.setSpeaking(true);
    } else if (this.speaking && this.softFor >= silenceHoldSeconds) {
      this.setSpeaking(false);
    } else if (this.speaking) {
      this.speech += dt;
    }

    if (this.speaking) this.quietFor = 0;
    else {
      this.quietFor += dt;
      // Only quiet windows teach the background: learning from the loud ones before speech is confirmed (the hold) pushed the
      // threshold above normal speech within a few sentences when tested with recorded speech
      if (this.loudFor === 0) this.background += (this.level - this.background) * (1 - Math.exp(-backgroundAdaptRate * dt));
    }
  }

  private setSpeaking(on: boolean): void {
    this.speaking = on;
    if (on) this.quietFor = 0;
    this.onSpeakingChange?.(on);
  }

  private toRing(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      this.ring[this.ringAt++] = samples[i];
      if (this.ringAt === this.ring.length) {
        this.ringAt = 0;
        this.ringFull = true;
      }
    }
  }

  private fromRing(n: number): Float32Array {
    const out = new Float32Array(n);
    const start = (this.ringAt - n + this.ring.length) % this.ring.length;
    for (let i = 0; i < n; i++) out[i] = this.ring[(start + i) % this.ring.length];
    return out;
  }
}
