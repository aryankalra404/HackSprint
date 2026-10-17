import { convertDeck, DeckError, MAX_DECK_BYTES } from "@/lib/deck";
import { getBrief, getRoom, setDeck } from "@/lib/room";
import { startDeckResearch } from "@/lib/deckResearch";

// The presenter uploads their deck from the web (contract: POST /api/room/deck). The laptop turns the upload into slide images,
// puts it in the room, and the headset loads it on its next poll.
export async function POST(request: Request) {
  if (getRoom().phase === "live") return Response.json({ error: "The deck cannot change during a live rehearsal." }, { status: 409 });

  // formData() buffers the request, so reject oversized or unbounded uploads before reading the body.
  // Leave room for multipart headers around a file at the 100 MB file limit.
  const contentLength = request.headers.get("content-length");
  const requestBytes = contentLength && /^\d+$/.test(contentLength) ? Number(contentLength) : NaN;
  if (!Number.isSafeInteger(requestBytes) || requestBytes < 0) {
    return Response.json({ error: "Send a deck upload with a valid Content-Length header." }, { status: 411 });
  }
  if (requestBytes > MAX_DECK_BYTES + 1024 * 1024) {
    return Response.json({ error: "That upload is over 100 MB." }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Send the deck as multipart form data, in a field called file." }, { status: 400 });
  try {
    const deck = await convertDeck(file.name, Buffer.from(await file.arrayBuffer()));
    const room = setDeck(deck);
    // n8n researches the deck's claims in the news (0.30), in the background
    const brief = getBrief();
    if (brief) startDeckResearch(brief.draft_id, deck, brief.goal?.text);
    return Response.json(room);
  } catch (e) {
    if (e instanceof DeckError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[deck] conversion failed", e);
    return Response.json({ error: "Couldn't turn that file into slides." }, { status: 500 });
  }
}

export function DELETE() {
  if (getRoom().phase === "live") return Response.json({ error: "The deck cannot change during a live rehearsal." }, { status: 409 });
  return Response.json(setDeck(null));
}
