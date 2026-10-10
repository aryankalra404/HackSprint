import type { Room } from "@/lib/contract";
import { updateRoom } from "@/lib/room";

// Room settings from the web (contract: PUT /api/room/settings); the headset sees them on its next poll.
// Send either setting or both.
export async function PUT(request: Request) {
  const body = (await request.json()) as { name_cards?: unknown; height_offset?: unknown };
  const patch: Partial<Pick<Room, "name_cards" | "height_offset">> = {};
  if (body.name_cards !== undefined) {
    if (typeof body.name_cards !== "boolean") return Response.json({ error: "name_cards must be true or false" }, { status: 400 });
    patch.name_cards = body.name_cards;
  }
  if (body.height_offset !== undefined) {
    if (typeof body.height_offset !== "number" || !Number.isFinite(body.height_offset)) return Response.json({ error: "height_offset must be a number of metres" }, { status: 400 });
    // To the centimetre, within half a metre either way
    patch.height_offset = Math.round(Math.max(-0.5, Math.min(0.5, body.height_offset)) * 100) / 100;
  }
  if (Object.keys(patch).length === 0) return Response.json({ error: "Send name_cards or height_offset" }, { status: 400 });
  return Response.json(updateRoom(patch));
}
