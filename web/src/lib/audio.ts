import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Bundle } from "./contract";

// Voices n8n generates (contract: GET /api/audio/<id>.wav). n8n sends them as base64 WAV; the laptop saves each one and gives the
// headset a path on itself, so the room it polls stays small and the headset never needs the internet.
export const AUDIO_DIR = path.join(process.cwd(), ".audio");

export function isAudioFile(file: string): boolean {
  return /^a[a-z0-9]+\.wav$/.test(file);
}

// Saves one voice and returns its path on the laptop
export async function saveAudio(base64: string): Promise<string> {
  const id = `a${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  await mkdir(AUDIO_DIR, { recursive: true });
  await writeFile(path.join(AUDIO_DIR, `${id}.wav`), Buffer.from(base64, "base64"));
  return `/api/audio/${id}.wav`;
}

// The bundle as the room keeps it: each line voiced in /prep becomes an audio_url instead of base64
export async function saveBundleAudio(bundle: Bundle): Promise<Bundle> {
  const lines = await Promise.all(
    bundle.lines.map(async ({ audio_wav_base64, ...line }) => (audio_wav_base64 ? { ...line, audio_url: await saveAudio(audio_wav_base64) } : line)),
  );
  return { ...bundle, lines };
}
