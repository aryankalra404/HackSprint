import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Know your side (contract 0.26): what the presenter offers, set once, and what they want from each meeting when they've confirmed or
// edited n8n's guess. Kept on the laptop: changing it doesn't rebuild the brief (that would cost an n8n execution); the next /prep
// uses it.
export interface Profile {
  offer: string;
  // By meeting id: the presenter's own goal for that meeting
  goals: Record<string, string>;
}

const FILE = path.join(process.cwd(), ".profile.json");

export async function getProfile(): Promise<Profile> {
  try {
    const p = JSON.parse(await readFile(FILE, "utf8")) as Partial<Profile>;
    return { offer: p.offer ?? "", goals: p.goals ?? {} };
  } catch {
    return { offer: "", goals: {} };
  }
}

export async function saveProfile(change: { offer?: string; goal?: { meetingId: string; text: string } }): Promise<Profile> {
  const p = await getProfile();
  if (change.offer !== undefined) p.offer = change.offer.trim().slice(0, 300);
  if (change.goal) {
    const text = change.goal.text.trim().slice(0, 200);
    if (text) p.goals[change.goal.meetingId] = text;
    else delete p.goals[change.goal.meetingId];
  }
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(p, null, 1));
  return p;
}
