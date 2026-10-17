import type { DraftMember } from "@/lib/contract";
import { getRoom, panelProblem, updateRoom } from "@/lib/room";

// The Brief screen saves the presenter's edits here while drafting; the headset sees them on its next poll
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null) as { panel?: unknown } | null;
  if (!body) return Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
  const panel = body.panel as DraftMember[] | undefined;
  const problem = panelProblem(panel);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  const room = getRoom();
  return Response.json(updateRoom({ panel, phase: room.phase === "empty" ? "drafting" : room.phase }));
}
