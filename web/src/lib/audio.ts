import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Bundle } from "./contract";

// Voices n8n generates (contract: GET /api/audio/<id>.wav). n8n sends them as base64 (MP3 from Sarvam, or WAV); the laptop saves each one
// as WAV and gives the headset a path on itself, so the room it polls stays small and the headset never needs the internet.
// Audio goes through macOS's afconvert both ways: MP3 to WAV for the headset, and the presenter's WAV to AAC before it goes to n8n,
// so a turn moves about a seventh of the bytes over the internet.
export const AUDIO_DIR = path.join(process.cwd(), ".audio");

const run = promisify(execFile);

export function isAudioFile(file: string): boolean {
  return /^a[a-z0-9]+\.wav$/.test(file);
}

function isWav(data: Buffer): boolean {
  return data.subarray(0, 4).toString("latin1") === "RIFF";
}

// Saves one voice as WAV and returns its path on the laptop, or null if it couldn't be read
export async function saveAudio(base64: string, id = `a${Date.now().toString(36)}${randomBytes(3).toString("hex")}`): Promise<string | null> {
  const out = path.join(AUDIO_DIR, `${id}.wav`);
  const data = Buffer.from(base64, "base64");
  await mkdir(AUDIO_DIR, { recursive: true });
  if (isWav(data)) {
    await writeFile(out, data);
    return `/api/audio/${id}.wav`;
  }
  const work = await mkdtemp(path.join(os.tmpdir(), "dryrun-audio-"));
  try {
    const input = path.join(work, "voice.mp3");
    await writeFile(input, data);
    await run("afconvert", ["-f", "WAVE", "-d", "LEI16@22050", "-c", "1", input, out], { timeout: 10_000 });
    return `/api/audio/${id}.wav`;
  } catch {
    return null;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// The Quest's mic is quiet (11 Oct: background about 0.0001, speech peaking about 0.06), which Whisper hears as mumbling. The speech is
// raised so its loudest moment is about TARGET_PEAK, by at most MAX_GAIN so a near-silent clip isn't turned into loud noise.
const TARGET_PEAK = 0.7;
const MAX_GAIN = 20;

// 16-bit PCM WAV, louder; anything else (or a clip that's loud enough already) as it is
export function normaliseWav(wav: Buffer): Buffer {
  if (wav.length < 44 || wav.subarray(0, 4).toString("latin1") !== "RIFF" || wav.subarray(8, 12).toString("latin1") !== "WAVE") return wav;
  let at = 12;
  let bits = 0;
  while (at + 8 <= wav.length) {
    const id = wav.subarray(at, at + 4).toString("latin1");
    const size = wav.readUInt32LE(at + 4);
    if (id === "fmt ") bits = wav.readUInt16LE(at + 22);
    if (id === "data") {
      if (bits !== 16) return wav;
      const from = at + 8;
      const to = Math.min(wav.length, from + size) & ~1;
      let peak = 0;
      for (let i = from; i < to; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
      const gain = peak > 0 ? Math.min(MAX_GAIN, (TARGET_PEAK * 32767) / peak) : 1;
      if (gain < 1.2) return wav;
      const out = Buffer.from(wav);
      for (let i = from; i < to; i += 2) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(wav.readInt16LE(i) * gain))), i);
      return out;
    }
    at += 8 + size + (size & 1);
  }
  return wav;
}

// The presenter's speech, smaller for the trip to n8n: louder (above), then AAC (m4a), which Whisper reads. Falls back to the WAV.
export async function compressSpeech(wavBase64: string): Promise<{ base64: string; format: "m4a" | "wav" }> {
  if (!wavBase64) return { base64: "", format: "wav" };
  const work = await mkdtemp(path.join(os.tmpdir(), "dryrun-speech-"));
  try {
    const input = path.join(work, "speech.wav");
    const output = path.join(work, "speech.m4a");
    await writeFile(input, normaliseWav(Buffer.from(wavBase64, "base64")));
    await run("afconvert", ["-f", "m4af", "-d", "aac", "-b", "32000", input, output], { timeout: 10_000 });
    return { base64: (await readFile(output)).toString("base64"), format: "m4a" };
  } catch {
    return { base64: wavBase64, format: "wav" };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// Generic lines (contract 0.26) say nothing about the meeting, so each is kept by its voice and text and reused by every later
// rehearsal: n8n only voices the ones this index doesn't list (/prep's cached_voices).
const VOICES_INDEX = path.join(AUDIO_DIR, "voices.json");

function genericId(voice: string, text: string): string {
  return `ag${createHash("sha1").update(`${voice}\n${text}`).digest("hex").slice(0, 16)}`;
}

export async function cachedVoices(): Promise<Record<string, string[]>> {
  try {
    return JSON.parse(await readFile(VOICES_INDEX, "utf8")) as Record<string, string[]>;
  } catch {
    return {};
  }
}

// The bundle as the room keeps it: each line voiced in /prep becomes an audio_url instead of base64, and a generic line n8n left
// unvoiced gets the laptop's copy
export async function saveBundleAudio(bundle: Bundle): Promise<Bundle> {
  const voiceOf = new Map(bundle.personas.map((p) => [p.id, p.voice]));
  const index = await cachedVoices();
  const lines = await Promise.all(
    bundle.lines.map(async ({ audio_base64, ...line }) => {
      const voice = line.voice ?? voiceOf.get(line.persona_id);
      if (!line.generic || !voice) {
        const url = audio_base64 ? await saveAudio(audio_base64) : null;
        return url ? { ...line, audio_url: url } : line;
      }
      const id = genericId(voice, line.text);
      if (audio_base64) {
        const url = await saveAudio(audio_base64, id);
        if (url) index[voice] = [...new Set([...(index[voice] ?? []), line.text])];
        return url ? { ...line, audio_url: url } : line;
      }
      const cached = (index[voice] ?? []).includes(line.text) && (await exists(path.join(AUDIO_DIR, `${id}.wav`)));
      return cached ? { ...line, audio_url: `/api/audio/${id}.wav` } : line;
    }),
  );
  await mkdir(AUDIO_DIR, { recursive: true });
  await writeFile(VOICES_INDEX, JSON.stringify(index, null, 1));
  return { ...bundle, lines };
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}
