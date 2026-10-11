import type { Telemetry } from "@/lib/contract";
import { keepClientTelemetry } from "@/lib/debrief";

// What only the rehearsing client knows (contract: POST /debrief, headset or browser to laptop), posted before it ends the session. The laptop answers at
// once and sends it to n8n with the turns and slide changes when the session ends.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<Telemetry> | null;
  if (!body || !Array.isArray(body.events)) return Response.json({ error: "Send the client's telemetry: { session_id, client, duration_s, events, ... }" }, { status: 400 });
  keepClientTelemetry({ client: body.client === "web" ? "web" : "vr", duration_s: Number(body.duration_s) || 0, events: body.events, gaze_dwell_s: body.gaze_dwell_s, facing_slides_s: body.facing_slides_s });
  return Response.json({ accepted: true });
}
