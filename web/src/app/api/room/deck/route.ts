import { convertDeck, DeckError } from "@/lib/deck";
import { getBrief, setDeck } from "@/lib/room";
import { startDeckReview } from "@/lib/deckReview";
import { SAMPLE_ID } from "@/lib/mock/sample";

// The presenter uploads their deck from the web (contract: POST /api/room/deck). The laptop turns it into slide images,
// puts it in the room, and the headset loads it on its next poll.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Send the deck as multipart form data, in a field called file." }, { status: 400 });
  try {
    const deck = await convertDeck(file.name, Buffer.from(await file.arrayBuffer()));
    const room = setDeck(deck);
    // n8n checks the deck against the meeting's brief (0.26), in the background
    const brief = getBrief();
    if (brief && brief.draft_id !== SAMPLE_ID) startDeckReview(brief.draft_id, deck, brief.goal?.text);
    return Response.json(room);
  } catch (e) {
    if (e instanceof DeckError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[deck] conversion failed", e);
    return Response.json({ error: "Couldn't turn that file into slides." }, { status: 500 });
  }
}

export function DELETE() {
  return Response.json(setDeck(null));
}
