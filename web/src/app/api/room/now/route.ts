import type { SessionActor } from "@/lib/contract";
import { getRoom, setNow } from "@/lib/room";

const ACTORS: SessionActor[] = ["headset", "web"];

// Who on the panel is speaking and who has a hand up, from the client that's rehearsing (contract: POST /api/room/now).
// The dashboard's room plan follows it live.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { speaking?: unknown; hands?: unknown; by?: unknown };
  const usage = 'Send { "speaking": "p2" | null, "hands": ["p3"], "by": "web" | "headset" }';
  if (!ACTORS.some((a) => a === body.by) || !Array.isArray(body.hands) || (body.speaking !== null && typeof body.speaking !== "string")) {
    return Response.json({ error: usage }, { status: 400 });
  }
  const ids = new Set(getRoom().panel.map((m) => m.id));
  const hands = [...new Set(body.hands)];
  if (hands.some((h) => typeof h !== "string" || !ids.has(h)) || (body.speaking !== null && !ids.has(body.speaking))) {
    return Response.json({ error: "Someone in speaking or hands isn't on the panel." }, { status: 400 });
  }
  const result = setNow({ speaking: body.speaking, hands: hands as string[] });
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.error }, { status: 409 });
}
