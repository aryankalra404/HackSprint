"use server";

import { redirect } from "next/navigation";
import type { BriefInput, DraftMember } from "@/lib/contract";
import { addMeeting, getMeeting, prepSession } from "@/lib/api";
import { getBrief, panelProblem, setDeck, updateRoom } from "@/lib/room";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// Seats this meeting's practice panel in the room (the headset follows it), then opens the practice table
export async function practiseAction(meetingId: string): Promise<Result<never>> {
  const detail = await getMeeting(meetingId);
  if (!detail?.proposal) return { ok: false, error: "This meeting's brief isn't ready yet." };
  const { meeting, proposal } = detail;
  const panel: DraftMember[] = proposal.members.map((m) => ({ ...m, difficulty: 2 }));
  const input: BriefInput = {
    presenter: { name: "", email: "" },
    deck: { pdf_url: "", slide_image_urls: [] },
    prospect: { company: meeting.company, website: "", context: meeting.title },
  };
  // A deck belongs to its meeting: seating another meeting's panel takes it off the screens
  if (getBrief()?.draft_id !== meeting.id) setDeck(null);
  updateRoom(
    { phase: "drafting", prospect: { company: meeting.company }, panel, bundle: null, session_id: null },
    { input, draft_id: meeting.id, suggestions: proposal.suggestions },
  );
  redirect(`/m/${encodeURIComponent(meeting.id)}/practise`);
}

// Runs n8n's preparation again for a meeting whose run failed, under the same id so its page carries on
export async function retryMeetingAction(meetingId: string): Promise<Result<null>> {
  const detail = await getMeeting(meetingId);
  if (!detail) return { ok: false, error: "That meeting isn't in n8n's table any more." };
  const m = detail.meeting;
  try {
    await addMeeting({
      id: m.id,
      title: m.title,
      start: m.start,
      company: m.company,
      website: "",
      context: m.why,
      attendees: m.attendees,
      owner_email: process.env.DRYRUN_OWNER_EMAIL ?? "",
    });
  } catch {
    return { ok: false, error: "n8n didn't take it. Check that the DryRun prep workflow is active." };
  }
  return { ok: true, value: null };
}

// Briefs the practice panel, puts the bundle in the room, then goes to the dashboard. Only returns if something is wrong.
export async function briefPanelAction(input: BriefInput, draftId: string, panel: DraftMember[]): Promise<Result<never>> {
  const problem = panel.length === 0 ? "The panel needs at least one person." : panelProblem(panel);
  if (problem) return { ok: false, error: problem };
  if (panel.some((m) => !m.role.trim())) return { ok: false, error: "Everyone needs a role." };

  let sessionId: string;
  try {
    const bundle = await prepSession({ ...input, draft_id: draftId, panel });
    sessionId = bundle.session_id;
    updateRoom({
      phase: "briefed",
      bundle,
      session_id: sessionId,
      live: null,
      panel: bundle.personas.map(({ id, seat, color, role, role_short, display_name, avatar, difficulty }) => ({ id, seat, color, role, role_short, display_name, avatar, difficulty })),
    });
  } catch {
    return { ok: false, error: "Couldn't brief the panel. Try again in a moment." };
  }
  redirect(`/s/${sessionId}`);
}
