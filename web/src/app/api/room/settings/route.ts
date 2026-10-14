import type { RehearseIn, Room } from "@/lib/contract";
import { getRoom, updateRoom } from "@/lib/room";

// Room settings from the web (contract: PUT /api/room/settings); the headset sees them on its next poll.
// Send any of them. The pitch length only changes before the panel is briefed (it goes to /prep).
export async function PUT(request: Request) {
  const body = (await request.json()) as { name_cards?: unknown; height_offset?: unknown; pitch_minutes?: unknown; rehearse_in?: unknown };
  const patch: Partial<Pick<Room, "name_cards" | "height_offset" | "pitch_minutes" | "rehearse_in">> = {};
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
    // null: no time limit (0.25)
    if (m !== null && (typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > 60)) return Response.json({ error: "pitch_minutes must be a whole number from 1 to 60, or null for no limit" }, { status: 400 });
    const { phase } = getRoom();
    if (phase !== "empty" && phase !== "drafting") return Response.json({ error: "The panel is already briefed for this pitch length. Go back to the practice page to change it." }, { status: 409 });
    patch.pitch_minutes = m;
  }
  if (body.rehearse_in !== undefined) {
    const where = (["vr", "browser"] as RehearseIn[]).find((w) => w === body.rehearse_in);
    if (!where) return Response.json({ error: 'rehearse_in must be "vr" or "browser"' }, { status: 400 });
    // Not mid-run: the client taking turns can't change under the presenter
    const { phase } = getRoom();
    if (phase !== "briefed" && phase !== "done") return Response.json({ error: `Where to rehearse can only change while the panel is briefed or the run is done, not ${phase}.` }, { status: 409 });
    patch.rehearse_in = where;
  }
  if (Object.keys(patch).length === 0) return Response.json({ error: "Send name_cards, height_offset, pitch_minutes or rehearse_in" }, { status: 400 });
  return Response.json(updateRoom(patch));
}
