import { startDebrief } from "@/lib/debrief";
import { getRoom } from "@/lib/room";

// Tries the debrief of the run that just ended again, after it failed (the dashboard's "Try again")
export async function POST() {
  startDebrief(true);
  return Response.json(getRoom());
}
