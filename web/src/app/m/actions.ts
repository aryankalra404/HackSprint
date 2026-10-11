"use server";

import { redirect } from "next/navigation";
import type { BriefInput, DraftMember, RehearseIn } from "@/lib/contract";
import { deckText } from "@/lib/deck";
import { addMeeting, getMeeting, prepSession, prepSteps } from "@/lib/api";
import { prepDone, prepFailed, prepProgress, prepStarted } from "@/lib/prepProgress";
import { getBrief, getRoom, panelProblem, setDeck, updateRoom } from "@/lib/room";
import { SAMPLE_ID, sampleDeck } from "@/lib/mock/sample";
import { briefSample } from "@/lib/sample";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// Seats this meeting's practice panel in the room (the headset follows it), then opens the practice table
export async function practiseAction(meetingId: string): Promise<Result<never>> {
  const detail = await getMeeting(meetingId);
  if (!detail?.proposal) return { ok: false, error: "This meeting's brief isn't ready yet." };
  const { meeting, proposal } = detail;
  const panel: DraftMember[] = proposal.members.map((m) => ({ ...m, difficulty: 2 }));
  const input: BriefInput = {
    presenter: { name: process.env.DRYRUN_PRESENTER_NAME ?? "", email: process.env.DRYRUN_OWNER_EMAIL ?? "" },
    deck: null,
    prospect: { company: meeting.company, website: "", context: meeting.title },
  };
  // A deck belongs to its meeting: seating another meeting's panel takes it off the screens
  if (getBrief()?.draft_id !== meeting.id) setDeck(meeting.id === SAMPLE_ID ? sampleDeck : null);
  // The pitch length starts at n8n's suggestion for this meeting; the presenter can change it on the practice page
  updateRoom(
    { phase: "drafting", prospect: { company: meeting.company }, panel, bundle: null, session_id: null, pitch_minutes: proposal.pitch?.minutes ?? 5 },
    { input, draft_id: meeting.id, suggestions: proposal.suggestions, pitch: proposal.pitch },
  );
  redirect(`/m/${encodeURIComponent(meeting.id)}/practise`);
}

// Runs n8n's preparation for a meeting whose run failed, or that n8n skipped and the presenter wants anyway, under the same id so
// its page carries on. Meetings sent this way are always prepared.
export async function retryMeetingAction(meetingId: string): Promise<Result<null>> {
  const detail = await getMeeting(meetingId);
  if (!detail) return { ok: false, error: "That meeting isn't in n8n's table any more." };
  const m = detail.meeting;
  try {
    await addMeeting({
      id: m.id,
      title: m.title,
      start: m.start,
      // A skipped meeting's company may just be its title, and its "why" is the reason it was skipped: neither helps the research
      company: m.company === m.title ? "" : m.company,
      website: "",
      context: m.status === "skipped" ? "" : m.why,
      attendees: m.attendees,
      owner_email: process.env.DRYRUN_OWNER_EMAIL ?? "",
    });
  } catch {
    return { ok: false, error: "n8n didn't take it. Check that the DryRun prep workflow is active." };
  }
  return { ok: true, value: null };
}

// Where a briefed panel is rehearsed: the browser's rehearsal page, or the dashboard while the headset rehearses
function rehearsalPath(sessionId: string, rehearseIn: RehearseIn): string {
  return rehearseIn === "browser" ? `/s/${sessionId}/rehearse` : `/s/${sessionId}`;
}

// Runs n8n's /prep for the panel and puts the bundle in the room, briefed. Returns the session id, or throws.
// With a `runId`, the practice page follows n8n's progress (GET /api/prep/progress).
async function prepare(input: BriefInput, draftId: string, panel: DraftMember[], rehearseIn: RehearseIn, runId?: string): Promise<string> {
  // n8n gets each slide's text (it can't reach the laptop's files) and the pitch length set on the practice page
  const room = getRoom();
  const deck = room.deck ? await deckText(room.deck) : null;
  prepStarted(runId, deck ? deck.slides.length : null, panel.length, room.pitch_minutes);
  let bundle;
  try {
    bundle = await prepSession({ ...input, deck, draft_id: draftId, pitch_minutes: room.pitch_minutes, panel }, room.deck, (p, url) => prepProgress(runId, p, url));
  } catch (err) {
    prepFailed(runId, "n8n couldn't plan the rehearsal. Try again in a moment.");
    throw err;
  }
  updateRoom({
    phase: "briefed",
    bundle,
    session_id: bundle.session_id,
    live: null,
    debrief: null,
    rehearse_in: rehearseIn,
    // A real brief ends the sample's scripted run
    scripted: false,
    panel: bundle.personas.map(({ id, seat, color, role, role_short, display_name, avatar, difficulty }) => ({ id, seat, color, role, role_short, display_name, avatar, difficulty })),
  });
  prepDone(runId, prepSteps(bundle));
  return bundle.session_id;
}

// Briefs the practice panel and puts the bundle in the room. Answers with where to rehearse: the browser's rehearsal page, or the dashboard (for VR).
// The sample redirects straight away.
export async function briefPanelAction(
  input: BriefInput,
  draftId: string,
  panel: DraftMember[],
  rehearseIn: RehearseIn = "vr",
  runId?: string,
): Promise<Result<string>> {
  const problem = panel.length === 0 ? "The panel needs at least one person." : panelProblem(panel);
  if (problem) return { ok: false, error: problem };
  const roleless = panel.filter((m) => !m.role.trim()).map((m) => m.display_name || "someone");
  if (roleless.length) return { ok: false, error: `Add a role for ${roleless.join(" and ")}: what they do shapes what they push on.` };
  // The sample is briefed on the laptop, with its own panel: no n8n call
  if (draftId === SAMPLE_ID) redirect(`/s/${briefSample()}`);

  let sessionId: string;
  try {
    sessionId = await prepare(input, draftId, panel, rehearseIn, runId);
  } catch {
    return { ok: false, error: "Couldn't brief the panel. Try again in a moment." };
  }
  // The practice page shows n8n's finished steps for a moment, then opens the rehearsal
  return { ok: true, value: rehearsalPath(sessionId, rehearseIn) };
}

// "Run it again, harder": briefs the same panel again through n8n's /prep, which reads the last debrief and presses on the weak spots.
// Then back to where the presenter rehearses. Only returns if something is wrong.
export async function rebriefAction(): Promise<Result<never>> {
  const room = getRoom();
  const brief = getBrief();
  if (!brief || room.panel.length === 0) return { ok: false, error: "There's no panel in the room to brief again." };
  if (room.phase === "live") return { ok: false, error: "End the run before briefing the panel again." };
  // The sample's script is fixed: briefing it again just reseats it, with no n8n call
  if (room.scripted) redirect(`/s/${briefSample()}`);
  let sessionId: string;
  try {
    sessionId = await prepare(brief.input, brief.draft_id, room.panel, room.rehearse_in);
  } catch {
    return { ok: false, error: "Couldn't brief the panel again. Try again in a moment." };
  }
  redirect(rehearsalPath(sessionId, room.rehearse_in));
}
