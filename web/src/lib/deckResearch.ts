import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Deck, DeckResearch } from "./contract";
import { N8N_URL, postToN8n } from "./api";
import { deckText } from "./deck";
import { getProfile } from "./profile";

// n8n's research of an uploaded deck (contract 0.31: POST /deck-research), one per upload, in the background: who else already does
// what the deck pitches, from the news. n8n keeps it on the meeting, and /prep briefs the panel to ask how this is different. It
// isn't shown on a page; the laptop keeps a copy per meeting, to skip a deck already researched and to name them in the agent feed.
export interface StoredResearch {
  deck_id: string;
  deck_name: string;
  state: "running" | "done" | "failed";
  research: DeckResearch | null;
  error?: string;
  // The slides' text, hashed: the same deck uploaded again keeps its research instead of asking n8n again
  fingerprint?: string;
}

const DIR = path.join(process.cwd(), ".deck-research");
const file = (meetingId: string) => path.join(DIR, `${meetingId.replace(/[^\w-]/g, "_")}.json`);

async function getDeckResearch(meetingId: string): Promise<StoredResearch | null> {
  try {
    return JSON.parse(await readFile(file(meetingId), "utf8")) as StoredResearch;
  } catch {
    return null;
  }
}

// Who n8n found already doing what the deck pitches, by name (empty until the research is done)
export async function othersDoingThis(meetingId: string): Promise<string[]> {
  const stored = await getDeckResearch(meetingId);
  return stored?.state === "done" ? (stored.research?.others ?? []).map((o) => o.name) : [];
}

async function save(meetingId: string, stored: StoredResearch): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(file(meetingId), JSON.stringify(stored));
}

// Starts n8n's research of this deck for this meeting; never throws (the upload has already succeeded)
export function startDeckResearch(meetingId: string, deck: Deck, goal?: string): void {
  if (!N8N_URL) return;
  void (async () => {
    let base: Pick<StoredResearch, "deck_id" | "deck_name" | "fingerprint"> = { deck_id: deck.id, deck_name: deck.name };
    try {
      const [text, profile, before] = await Promise.all([deckText(deck), getProfile(), getDeckResearch(meetingId)]);
      base = { ...base, fingerprint: createHash("sha1").update(JSON.stringify(text.slides)).digest("hex") };
      // (research from before 0.31 has no "others": that deck is researched again)
      if (before?.state === "done" && before.research?.others && before.fingerprint === base.fingerprint) {
        await save(meetingId, { ...before, ...base });
        return;
      }
      await save(meetingId, { ...base, state: "running", research: null });
      if (!text.slides.some((s) => s.text)) {
        await save(meetingId, { ...base, state: "failed", research: null, error: "The slides have no text n8n can read." });
        return;
      }
      const research = await postToN8n<DeckResearch>("/deck-research", {
        meeting_id: meetingId,
        deck: text,
        presenter: { offer: profile.offer },
        goal: profile.goals[meetingId] ?? goal ?? "",
      });
      // A newer upload replaced this deck while n8n worked: keep that one's research
      if ((await getDeckResearch(meetingId))?.deck_id !== deck.id) return;
      await save(meetingId, { ...base, state: "done", research });
    } catch (err) {
      await save(meetingId, { ...base, state: "failed", research: null, error: err instanceof Error ? err.message : "n8n didn't answer" }).catch(() => {});
    }
  })();
}
