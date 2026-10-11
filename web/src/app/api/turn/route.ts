import type { TurnRequest } from "@/lib/contract";
import { N8N_URL } from "@/lib/api";
import { SCRIPTED } from "@/lib/scripted";
import { TurnError, takeTurn } from "@/lib/turns";

// What the presenter just said, from the headset (contract: POST /turn). The laptop adds the context, n8n decides who reacts,
// and the answer carries each voice as a path on the laptop.
export async function POST(request: Request) {
  // TEMPORARY TEST: the scripted run needs no n8n
  if (!N8N_URL && !SCRIPTED) return Response.json({ error: "n8n isn't connected (DRYRUN_N8N_URL is unset)" }, { status: 503 });
  try {
    return Response.json(await takeTurn((await request.json()) as TurnRequest));
  } catch (err) {
    if (err instanceof TurnError) return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: err instanceof Error ? err.message : "The turn failed" }, { status: 500 });
  }
}
