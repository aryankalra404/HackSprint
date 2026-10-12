import { connection } from "next/server";
import type { TwinChange } from "@/lib/contract";
import { getTwin, updateTwin } from "@/lib/twins";

// The laptop's copy of one twin (contract 0.27). Reads n8n only when the laptop has no copy.
export async function GET(req: Request) {
  await connection();
  const email = new URL(req.url).searchParams.get("email") ?? "";
  if (!email.includes("@")) return Response.json({ error: "Say whose twin: ?email=<address>" }, { status: 400 });
  const stored = await getTwin(email);
  return stored ? Response.json(stored, { headers: { "Cache-Control": "no-store" } }) : Response.json({ twin: null }, { status: 404 });
}

// The twin page's queued changes, as one batch (POST /twin/update: one n8n execution). Also sent with navigator.sendBeacon when the
// presenter leaves the page with changes unsaved, which arrives as text.
export async function POST(req: Request) {
  let body: { email?: string; changes?: TwinChange[] };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return Response.json({ error: "Send { email, changes }" }, { status: 400 });
  }
  if (!body.email || !Array.isArray(body.changes) || body.changes.length === 0) return Response.json({ error: "Send { email, changes }" }, { status: 400 });
  try {
    const twin = await updateTwin(body.email, body.changes.slice(0, 100));
    return Response.json(twin ? { twin } : { forgotten: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "n8n didn't take the changes" }, { status: 502 });
  }
}
