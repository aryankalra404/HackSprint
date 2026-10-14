import type { TurnRequest } from "@/lib/contract";
import { N8N_URL } from "@/lib/api";
import { FAKE_TURNS, TurnError, takeTurn } from "@/lib/turns";

// What the presenter just said, from the headset (contract: POST /turn). The laptop adds the context, n8n decides who reacts,
// and the answer carries each voice as a path on the laptop. With DRYRUN_FAKE_TURNS=1, stand-in turns answer instead of n8n.
export async function POST(request: Request) {
  // Stand-in turns need no n8n
  if (!N8N_URL && !FAKE_TURNS) return Response.json({ error: "n8n isn't connected (DRYRUN_N8N_URL is unset)" }, { status: 503 });
  try {
    return Response.json(await takeTurn((await request.json()) as TurnRequest, request.signal));
  } catch (err) {
    if (err instanceof TurnError) return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: err instanceof Error ? err.message : "The turn failed" }, { status: 500 });
  }
}
