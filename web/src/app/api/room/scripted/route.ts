import { getRoom, updateRoom } from "@/lib/room";
import { SCRIPTED, loadScenario } from "@/lib/scripted";

// TEMPORARY TEST: POST seats the scripted panel and briefs the room (web/src/lib/scripted.ts); DELETE takes the flag off again
export async function POST() {
  if (!SCRIPTED) return Response.json({ error: "Set DRYRUN_SCRIPTED=1 in .env.local first" }, { status: 404 });
  return Response.json(await loadScenario());
}

export async function DELETE() {
  if (!getRoom().scripted) return Response.json(getRoom());
  return Response.json(updateRoom({ scripted: false }));
}
