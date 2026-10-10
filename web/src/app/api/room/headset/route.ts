import { connection } from "next/server";
import { headsetStatus } from "@/lib/room";

// Whether the headset is following the room right now, for the Brief screen's status
export async function GET() {
  await connection();
  return Response.json(headsetStatus(), { headers: { "Cache-Control": "no-store" } });
}
