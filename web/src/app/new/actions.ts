"use server";

import { redirect } from "next/navigation";
import type { BriefInput, DraftMember, PanelProposal } from "@/lib/contract";
import { prepSession, proposePanel } from "@/lib/api";
import { ALL_SEATS } from "@/lib/personas";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export async function proposePanelAction(input: BriefInput): Promise<Result<PanelProposal>> {
  if (!input.prospect.company.trim()) return { ok: false, error: "Name the company you're pitching to." };
  try {
    return { ok: true, value: await proposePanel(input) };
  } catch {
    return { ok: false, error: "n8n couldn't propose a panel. Try again in a moment." };
  }
}

// Briefs the confirmed panel, then goes to its dashboard. Only returns if something is wrong.
export async function briefPanelAction(input: BriefInput, draftId: string, panel: DraftMember[]): Promise<Result<never>> {
  const seats = panel.map((m) => m.seat);
  if (panel.length === 0 || panel.length > ALL_SEATS.length) return { ok: false, error: "The panel needs 1 to 6 people." };
  if (new Set(seats).size !== seats.length || seats.some((s) => !ALL_SEATS.includes(s))) return { ok: false, error: "Each person needs their own seat." };
  if (panel.some((m) => !m.role.trim())) return { ok: false, error: "Everyone needs a role." };

  let sessionId: string;
  try {
    sessionId = (await prepSession({ ...input, draft_id: draftId, panel })).session_id;
  } catch {
    return { ok: false, error: "n8n couldn't brief the panel. Try again in a moment." };
  }
  redirect(`/s/${sessionId}`);
}
