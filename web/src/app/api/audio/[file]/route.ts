import { readFile } from "node:fs/promises";
import path from "node:path";
import { AUDIO_DIR, isAudioFile } from "@/lib/audio";

// One voice line n8n generated (contract: GET /api/audio/<id>.wav). It never changes for an id, so it can be cached for good.
export async function GET(_request: Request, ctx: RouteContext<"/api/audio/[file]">) {
  const { file } = await ctx.params;
  if (!isAudioFile(file)) return new Response("Not found", { status: 404 });
  try {
    const audio = await readFile(path.join(AUDIO_DIR, file));
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/wav", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
