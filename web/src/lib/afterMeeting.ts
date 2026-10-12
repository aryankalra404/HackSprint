import type { MeetingAfter } from "./contract";
import { N8N_URL, forgetMeetingReads, postToN8n } from "./api";
import { compressSpeech } from "./audio";
import { markTwinsStale } from "./twins";

// After a real meeting (contract 0.28): the presenter's voice note or notes go to n8n's DryRun after the meeting, which works out what
// each person raised, promised and decided, updates their twins, scores the last rehearsal's predictions and drafts the follow-up.
// The laptop only cuts the recording into pieces Sarvam takes (under 30 s), compresses each and forwards them. One execution.

// Sarvam's speech-to-text takes clips under 30 s; n8n reads at most 12 pieces (5.6 minutes)
const PIECE_S = 28;
export const MAX_PIECES = 12;
// A last piece shorter than this is silence at the end, not words
const MIN_PIECE_S = 1;

// A 16-bit PCM WAV (what the meeting page records: 16 kHz mono), cut into WAVs of at most PIECE_S seconds each, in order
export function cutWav(wav: Buffer, seconds = PIECE_S): Buffer[] {
  if (wav.length < 44 || wav.subarray(0, 4).toString("latin1") !== "RIFF" || wav.subarray(8, 12).toString("latin1") !== "WAVE") throw new Error("The recording isn't a WAV file");
  let at = 12;
  let fmt: Buffer | null = null;
  while (at + 8 <= wav.length) {
    const id = wav.subarray(at, at + 4).toString("latin1");
    const size = wav.readUInt32LE(at + 4);
    if (id === "fmt ") fmt = wav.subarray(at + 8, at + 8 + size);
    if (id === "data") {
      if (!fmt || fmt.readUInt16LE(14) !== 16) throw new Error("The recording isn't 16-bit PCM");
      const channels = fmt.readUInt16LE(2);
      const rate = fmt.readUInt32LE(4);
      const frame = channels * 2;
      const data = wav.subarray(at + 8, Math.min(wav.length, at + 8 + size));
      const step = seconds * rate * frame;
      const pieces: Buffer[] = [];
      for (let from = 0; from < data.length; ) {
        const to = data.length - from <= step ? data.length : quietestCut(data, from + step - LOOK_BACK_S * rate * frame, from + step, rate * frame);
        const part = data.subarray(from, to);
        if (part.length < MIN_PIECE_S * rate * frame && pieces.length > 0) break;
        pieces.push(withHeader(part, rate, channels));
        from = to;
      }
      return pieces;
    }
    at += 8 + size + (size & 1);
  }
  throw new Error("The recording has no sound in it");
}

// Each piece ends at the quietest moment of its last few seconds, so no word is cut in half between two pieces
const LOOK_BACK_S = 6;
const WINDOW_S = 0.05;

function quietestCut(data: Buffer, from: number, to: number, bytesPerSecond: number): number {
  const win = Math.round(bytesPerSecond * WINDOW_S) & ~1;
  let best = to;
  let quietest = Number.POSITIVE_INFINITY;
  for (let at = from; at + win <= to; at += win) {
    let sum = 0;
    for (let i = at; i < at + win; i += 2) sum += Math.abs(data.readInt16LE(i));
    if (sum < quietest) {
      quietest = sum;
      best = at + win / 2;
    }
  }
  return best & ~1;
}

function withHeader(pcm: Buffer, rate: number, channels: number): Buffer {
  const head = Buffer.alloc(44);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write("WAVEfmt ", 8, "latin1");
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(channels, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * channels * 2, 28);
  head.writeUInt16LE(channels * 2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36, "latin1");
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

export class AfterError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Sends the note to n8n and answers with what it found (it answers once the meeting and the twins are saved, before the follow-up is
// approved). The meeting and the attendees' twins are read again afterwards.
export async function sendAfterMeeting(input: { meeting_id: string; wav_base64?: string; notes?: string; attendees: string[] }): Promise<MeetingAfter> {
  if (!N8N_URL) throw new AfterError("n8n isn't set up on this laptop (DRYRUN_N8N_URL)", 503);
  const notes = (input.notes ?? "").trim().slice(0, 12_000);
  let pieces: Buffer[] = [];
  if (input.wav_base64) {
    try {
      pieces = cutWav(Buffer.from(input.wav_base64, "base64"));
    } catch (err) {
      throw new AfterError(err instanceof Error ? err.message : "The recording couldn't be read", 400);
    }
    if (pieces.length > MAX_PIECES) throw new AfterError(`The voice note is too long: n8n reads up to ${(MAX_PIECES * PIECE_S) / 60} minutes`, 400);
  }
  if (pieces.length === 0 && !notes) throw new AfterError("Record a voice note or type your notes", 400);
  const audio = await Promise.all(pieces.map((p) => compressSpeech(p.toString("base64")).then((c) => ({ base64: c.base64, format: c.format }))));
  const answer = await postToN8n<{ after?: MeetingAfter; message?: string }>("/after-meeting", {
    meeting_id: input.meeting_id,
    owner_email: process.env.DRYRUN_OWNER_EMAIL ?? "",
    notes,
    audio,
  });
  // The meeting now has its after, and the attendees' twins changed in n8n
  forgetMeetingReads();
  await markTwinsStale(input.attendees);
  if (!answer.after) throw new AfterError(answer.message ?? "n8n answered without what it found", 502);
  return answer.after;
}
