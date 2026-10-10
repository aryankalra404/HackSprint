import { connection } from "next/server";
import { headsetConnected } from "@/lib/room";

// Whether the headset is following the room right now, for the Brief screen's status
export async function GET() {
  await connection();
  return Response.json({ connected: headsetConnected() }, { headers: { "Cache-Control": "no-store" } });
}
