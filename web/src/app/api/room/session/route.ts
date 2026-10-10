import type { SessionActor } from "@/lib/contract";
import { changeSession } from "@/lib/room";

const ACTIONS = ["start", "end"] as const;
const ACTORS: SessionActor[] = ["headset", "web"];

// Starts or ends the rehearsal, from the headset or the dashboard (contract: POST /api/room/session)
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: unknown; by?: unknown };
  const action = ACTIONS.find((a) => a === body.action);
  const by = ACTORS.find((a) => a === body.by);
  if (!action || !by) return Response.json({ error: 'Send { "action": "start" | "end", "by": "headset" | "web" }' }, { status: 400 });
  const result = changeSession(action, by);
  return result.ok ? Response.json(result.room) : Response.json({ error: result.error, room: result.room }, { status: 409 });
}
