import { connection } from "next/server";
import type { TwinBuildRequest } from "@/lib/contract";
import { getTwinRun, startTwinBuild } from "@/lib/twins";

// Starts building a twin (POST /twin, streamed from n8n: one execution). The sample's build replays on the laptop.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<TwinBuildRequest>;
  if (!body.email?.includes("@")) return Response.json({ error: "Say whose twin to build: { email }" }, { status: 400 });
  // Notes on someone n8n has no twin of yet (0.37), read in this build
  const notes = (Array.isArray(body.notes) ? body.notes : []).filter((n) => typeof n?.text === "string" && n.text.trim()).slice(0, 5);
  return Response.json(startTwinBuild({ email: body.email, name: body.name, company: body.company, domain: body.domain, ...(notes.length ? { notes } : {}) }));
}

// How the build is going, for the twin page while it waits (laptop only; never calls n8n)
export async function GET(req: Request) {
  await connection();
  const email = new URL(req.url).searchParams.get("email") ?? "";
  return Response.json(getTwinRun(email), { headers: { "Cache-Control": "no-store" } });
}
