import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Deck, DeckReview } from "./contract";
import { N8N_URL, postToN8n } from "./api";
import { deckText } from "./deck";
import { getProfile } from "./profile";

// n8n's review of an uploaded deck (contract 0.26: POST /deck-review), one per upload, in the background. n8n keeps it on the meeting
// for the next /prep; the laptop keeps a copy per meeting, so the brief and practice pages show it without an n8n read.
export interface StoredReview {
  deck_id: string;
  deck_name: string;
  state: "running" | "done" | "failed";
  review: DeckReview | null;
  error?: string;
  // The slides' text, hashed: the same deck uploaded again keeps its review instead of asking n8n again
  fingerprint?: string;
}

const DIR = path.join(process.cwd(), ".deck-reviews");
const file = (meetingId: string) => path.join(DIR, `${meetingId.replace(/[^\w-]/g, "_")}.json`);

export async function getDeckReview(meetingId: string): Promise<StoredReview | null> {
  try {
    return JSON.parse(await readFile(file(meetingId), "utf8")) as StoredReview;
  } catch {
    return null;
  }
}

async function save(meetingId: string, stored: StoredReview): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(file(meetingId), JSON.stringify(stored));
}

// Starts n8n's review of this deck for this meeting; never throws (the upload has already succeeded)
export function startDeckReview(meetingId: string, deck: Deck, goal?: string): void {
  if (!N8N_URL) return;
  void (async () => {
    let base: Pick<StoredReview, "deck_id" | "deck_name" | "fingerprint"> = { deck_id: deck.id, deck_name: deck.name };
    try {
      const [text, profile, before] = await Promise.all([deckText(deck), getProfile(), getDeckReview(meetingId)]);
      base = { ...base, fingerprint: createHash("sha1").update(JSON.stringify(text.slides)).digest("hex") };
      if (before?.state === "done" && before.fingerprint === base.fingerprint) {
        await save(meetingId, { ...before, ...base });
        return;
      }
      await save(meetingId, { ...base, state: "running", review: null });
      if (!text.slides.some((s) => s.text)) {
        await save(meetingId, { ...base, state: "failed", review: null, error: "The slides have no text n8n can read." });
        return;
      }
      const review = await postToN8n<DeckReview>("/deck-review", {
        meeting_id: meetingId,
        deck: text,
        presenter: { offer: profile.offer },
        goal: profile.goals[meetingId] ?? goal ?? "",
      });
      // A newer upload replaced this deck while n8n worked: keep that one's review
      if ((await getDeckReview(meetingId))?.deck_id !== deck.id) return;
      await save(meetingId, { ...base, state: "done", review });
    } catch (err) {
      await save(meetingId, { ...base, state: "failed", review: null, error: err instanceof Error ? err.message : "n8n didn't answer" }).catch(() => {});
    }
  })();
}
