import { N8N_URL, postToN8n } from "@/lib/api";

// The headset only talks to the laptop; this forwards /turn to n8n unchanged (contract: POST `/turn`)
export async function POST(request: Request) {
  if (!N8N_URL) return Response.json({ error: "n8n isn't connected (DRYRUN_N8N_URL is unset)" }, { status: 503 });
  try {
    return Response.json(await postToN8n("/turn", await request.json()));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "n8n failed" }, { status: 502 });
  }
}
