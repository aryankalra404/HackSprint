"use server";

import { redirect } from "next/navigation";
import type { BriefInput, DraftMember, PanelProposal } from "@/lib/contract";
import { prepSession, proposePanel } from "@/lib/api";
import { panelProblem, updateRoom } from "@/lib/room";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// n8n proposes the panel, and it goes straight into the room so the headset seats them
export async function proposePanelAction(input: BriefInput): Promise<Result<PanelProposal>> {
  if (!input.prospect.company.trim()) return { ok: false, error: "Name the company you're pitching to." };
  let proposal: PanelProposal;
  try {
    proposal = await proposePanel(input);
  } catch {
    return { ok: false, error: "n8n couldn't propose a panel. Try again in a moment." };
  }
  updateRoom(
    {
      phase: "drafting",
      prospect: { company: input.prospect.company },
      panel: proposal.members.map((m) => ({ ...m, difficulty: 2 })),
      bundle: null,
      session_id: null,
    },
    { input, draft_id: proposal.draft_id, suggestions: proposal.suggestions },
  );
  return { ok: true, value: proposal };
}

// Briefs the confirmed panel, puts the bundle in the room, then goes to the dashboard. Only returns if something is wrong.
export async function briefPanelAction(input: BriefInput, draftId: string, panel: DraftMember[]): Promise<Result<never>> {
  const problem = panel.length === 0 ? "The panel needs at least one person." : panelProblem(panel);
  if (problem) return { ok: false, error: problem };
  if (panel.some((m) => !m.role.trim())) return { ok: false, error: "Everyone needs a role." };

  let sessionId: string;
  try {
    const bundle = await prepSession({ ...input, draft_id: draftId, panel });
    sessionId = bundle.session_id;
    updateRoom({ phase: "briefed", bundle, session_id: sessionId, panel: bundle.personas.map(({ id, seat, color, role, role_short, display_name, avatar, difficulty }) => ({ id, seat, color, role, role_short, display_name, avatar, difficulty })) });
  } catch {
    return { ok: false, error: "n8n couldn't brief the panel. Try again in a moment." };
  }
  redirect(`/s/${sessionId}`);
}
