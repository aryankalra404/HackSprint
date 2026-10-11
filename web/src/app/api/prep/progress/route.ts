import { connection } from "next/server";
import { getPrepRun } from "@/lib/prepProgress";

// What n8n's rehearsal prep is doing for this run, for the practice page while it waits (laptop only; never calls n8n)
export async function GET(req: Request) {
  await connection();
  const run = new URL(req.url).searchParams.get("run") ?? "";
  return Response.json(getPrepRun(run), { headers: { "Cache-Control": "no-store" } });
}
