import type { Telemetry } from "@/lib/contract";
import { keepHeadsetTelemetry } from "@/lib/debrief";

// What only the headset knows (contract: POST /debrief, headset to laptop), posted before it ends the session. The laptop answers at
// once and sends it to n8n with the turns and slide changes when the session ends.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<Telemetry> | null;
  if (!body || !Array.isArray(body.events)) return Response.json({ error: "Send the headset's telemetry: { session_id, client, duration_s, events, ... }" }, { status: 400 });
  keepHeadsetTelemetry({ client: body.client ?? "vr", duration_s: Number(body.duration_s) || 0, events: body.events, gaze_dwell_s: body.gaze_dwell_s, facing_slides_s: body.facing_slides_s });
  return Response.json({ accepted: true });
}
