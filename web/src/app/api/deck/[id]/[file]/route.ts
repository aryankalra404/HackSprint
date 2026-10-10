import { readFile } from "node:fs/promises";
import path from "node:path";
import { deckDir, isDeckId } from "@/lib/deck";

// One slide image (contract: GET /api/deck/<id>/<n>.jpg). A deck's images never change, so they can be cached for good.
export async function GET(_request: Request, ctx: RouteContext<"/api/deck/[id]/[file]">) {
  const { id, file } = await ctx.params;
  if (!isDeckId(id) || !/^\d+\.jpg$/.test(file)) return new Response("Not found", { status: 404 });
  try {
    const image = await readFile(path.join(deckDir(id), file));
    return new Response(new Uint8Array(image), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
