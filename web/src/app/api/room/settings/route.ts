import type { Room } from "@/lib/contract";
import { getRoom, updateRoom } from "@/lib/room";

// Room settings from the web (contract: PUT /api/room/settings); the headset sees them on its next poll.
// Send any of them. The pitch length only changes before the panel is briefed (it goes to /prep).
export async function PUT(request: Request) {
  const body = (await request.json()) as { name_cards?: unknown; height_offset?: unknown; pitch_minutes?: unknown };
  const patch: Partial<Pick<Room, "name_cards" | "height_offset" | "pitch_minutes">> = {};
  if (body.name_cards !== undefined) {
    if (typeof body.name_cards !== "boolean") return Response.json({ error: "name_cards must be true or false" }, { status: 400 });
    patch.name_cards = body.name_cards;
  }
  if (body.height_offset !== undefined) {
    if (typeof body.height_offset !== "number" || !Number.isFinite(body.height_offset)) return Response.json({ error: "height_offset must be a number of metres" }, { status: 400 });
    // To the centimetre, within half a metre either way
    patch.height_offset = Math.round(Math.max(-0.5, Math.min(0.5, body.height_offset)) * 100) / 100;
  }
  if (body.pitch_minutes !== undefined) {
    const m = body.pitch_minutes;
    if (typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > 60) return Response.json({ error: "pitch_minutes must be a whole number from 1 to 60" }, { status: 400 });
    const { phase } = getRoom();
    if (phase !== "empty" && phase !== "drafting") return Response.json({ error: "The panel is already briefed for this pitch length. Go back to the practice page to change it." }, { status: 409 });
    patch.pitch_minutes = m;
  }
  if (Object.keys(patch).length === 0) return Response.json({ error: "Send name_cards, height_offset or pitch_minutes" }, { status: 400 });
  return Response.json(updateRoom(patch));
}
