import type { DraftMember } from "@/lib/contract";
import { getRoom, panelProblem, updateRoom } from "@/lib/room";

// The Brief screen saves the presenter's edits here while drafting; the headset sees them on its next poll
export async function PUT(request: Request) {
  const { panel } = (await request.json()) as { panel: DraftMember[] };
  const problem = panelProblem(panel);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  const room = getRoom();
  return Response.json(updateRoom({ panel, phase: room.phase === "empty" ? "drafting" : room.phase }));
}
