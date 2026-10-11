import type { SessionAction, SessionActor } from "@/lib/contract";
import { startDebrief } from "@/lib/debrief";
import { changeSession, getRoom } from "@/lib/room";
import { SCRIPTED } from "@/lib/scripted";

const ACTIONS: SessionAction[] = ["start", "end", "restart"];
const ACTORS: SessionActor[] = ["headset", "web"];

// Starts, ends or restarts the rehearsal, from the headset or the dashboard (contract: POST /api/room/session)
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: unknown; by?: unknown };
  const action = ACTIONS.find((a) => a === body.action);
  const by = ACTORS.find((a) => a === body.by);
  if (!action || !by) return Response.json({ error: 'Send { "action": "start" | "end" | "restart", "by": "headset" | "web" }' }, { status: 400 });
  const result = changeSession(action, by);
  // Whoever ends it, the run goes to n8n for its debrief; the room shows the progress
  // TEMPORARY TEST: a scripted run isn't debriefed (it would spend an n8n execution on made-up speech)
  if (result.ok && action === "end" && !(SCRIPTED && result.room.scripted)) startDebrief();
  return result.ok ? Response.json(getRoom()) : Response.json({ error: result.error, room: result.room }, { status: 409 });
}
