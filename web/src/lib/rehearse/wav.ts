// The presenter's speech as /turn takes it: 16 kHz mono 16-bit PCM WAV, with the silence at both ends trimmed (contract: POST /turn).

export const SAMPLE_RATE = 16_000;

// Silence trimming: 50 ms windows, keeping half a second around the speech
const TRIM_WINDOW_S = 0.05;
const TRIM_KEEP_S = 0.5;

export function concat(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export function rms(samples: Float32Array, from = 0, to = samples.length): number {
  if (to <= from) return 0;
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (to - from));
}

// Drops quiet stretches at both ends, keeping TRIM_KEEP_S around the speech. Nothing above the threshold: sent as it is.
export function trimSilence(samples: Float32Array, threshold: number, rate = SAMPLE_RATE): Float32Array {
  const win = Math.round(rate * TRIM_WINDOW_S);
  let first = -1;
  let last = -1;
  for (let at = 0; at < samples.length; at += win) {
    if (rms(samples, at, Math.min(samples.length, at + win)) >= threshold) {
      if (first < 0) first = at;
      last = Math.min(samples.length, at + win);
    }
  }
  if (first < 0) return samples;
  const keep = Math.round(rate * TRIM_KEEP_S);
  return samples.subarray(Math.max(0, first - keep), Math.min(samples.length, last + keep));
}

export function encodeWav(samples: Float32Array, rate = SAMPLE_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}
