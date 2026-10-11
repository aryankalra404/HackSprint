import { getDeckReview } from "@/lib/deckReview";

// n8n's review of the meeting's deck, as the laptop keeps it (laptop only, not in the room; costs no n8n execution)
export async function GET(request: Request) {
  const meeting = new URL(request.url).searchParams.get("meeting");
  if (!meeting) return Response.json({ error: "Say which meeting: ?meeting=<id>" }, { status: 400 });
  return Response.json(await getDeckReview(meeting));
}
