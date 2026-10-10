import type { SessionActor } from "@/lib/contract";
import { setSlide } from "@/lib/room";

const ACTORS: SessionActor[] = ["headset", "web"];

// Changes the slide on screen, from the headset's triggers or the web (contract: POST /api/room/slide)
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { index?: unknown; by?: unknown };
  if (typeof body.index !== "number" || !Number.isFinite(body.index) || !ACTORS.some((a) => a === body.by)) {
    return Response.json({ error: 'Send { "index": 0, "by": "headset" | "web" }' }, { status: 400 });
  }
  const result = setSlide(body.index);
  return result.ok ? Response.json(result.room) : Response.json({ error: result.error, room: result.room }, { status: 409 });
}
