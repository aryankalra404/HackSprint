import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
export async function saveAudio(base64: string): Promise<string | null> {
  const id = `a${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
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

// The presenter's speech, smaller for the trip to n8n: AAC (m4a), which Whisper reads. Falls back to the WAV as it is.
export async function compressSpeech(wavBase64: string): Promise<{ base64: string; format: "m4a" | "wav" }> {
  if (!wavBase64) return { base64: "", format: "wav" };
  const work = await mkdtemp(path.join(os.tmpdir(), "dryrun-speech-"));
  try {
    const input = path.join(work, "speech.wav");
    const output = path.join(work, "speech.m4a");
    await writeFile(input, Buffer.from(wavBase64, "base64"));
    await run("afconvert", ["-f", "m4af", "-d", "aac", "-b", "32000", input, output], { timeout: 10_000 });
    return { base64: (await readFile(output)).toString("base64"), format: "m4a" };
  } catch {
    return { base64: wavBase64, format: "wav" };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// The bundle as the room keeps it: each line voiced in /prep becomes an audio_url instead of base64
export async function saveBundleAudio(bundle: Bundle): Promise<Bundle> {
  const lines = await Promise.all(
    bundle.lines.map(async ({ audio_base64, ...line }) => {
      const url = audio_base64 ? await saveAudio(audio_base64) : null;
      return url ? { ...line, audio_url: url } : line;
    }),
  );
  return { ...bundle, lines };
}
