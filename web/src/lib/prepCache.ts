import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Bundle, PrepRequest, PrepStep } from "./contract";
import { AUDIO_DIR } from "./audio";
import { twinStamp } from "./twins";

// The last rehearsal n8n prepared for each meeting, kept on the laptop. Rehearsing again with the same panel, deck, pitch length and
// goal, with no debrief, deck research or twin change since, gets the same answer from /prep: the laptop reuses it instead of spending
// an n8n execution and the Gemini and Sarvam calls. A debrief sent to n8n forgets it, so the next prep presses on the weak spots.
interface Stored {
  key: string;
  at: string;
  bundle: Bundle;
  steps: PrepStep[];
}

const DIR = path.join(process.cwd(), ".prep-cache");
const file = (meetingId: string) => path.join(DIR, `${meetingId.replace(/[^\w-]/g, "_")}.json`);

// What n8n's prep depends on, hashed. The voices the laptop already has (cached_voices) only save n8n work, so they're left out.
export async function prepKey(request: PrepRequest, others: string[]): Promise<string> {
  const rest: PrepRequest = { ...request };
  delete rest.cached_voices;
  const emails = request.panel.flatMap((m) => (m.twin_email ? [m.twin_email] : [])).sort();
  const twins = await Promise.all(emails.map(async (e) => [e, await twinStamp(e)]));
  return createHash("sha1").update(JSON.stringify({ rest, others, twins })).digest("hex");
}

// The kept prep, if it was made for exactly this and its voices are still on the laptop
export async function reusablePrep(meetingId: string, key: string): Promise<Stored | null> {
  let stored: Stored;
  try {
    stored = JSON.parse(await readFile(file(meetingId), "utf8")) as Stored;
  } catch {
    return null;
  }
  if (stored.key !== key) return null;
  const audio = stored.bundle.lines.flatMap((l) => (l.audio_url ? [path.join(AUDIO_DIR, path.basename(l.audio_url))] : []));
  try {
    await Promise.all(audio.map((f) => access(f)));
  } catch {
    return null;
  }
  return stored;
}

export async function keepPrep(meetingId: string, key: string, bundle: Bundle, steps: PrepStep[]): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(file(meetingId), JSON.stringify({ key, at: new Date().toISOString(), bundle, steps } satisfies Stored));
}

export async function forgetPrep(meetingId: string): Promise<void> {
  await rm(file(meetingId), { force: true });
}
