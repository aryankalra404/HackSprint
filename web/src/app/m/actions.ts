"use server";

import { redirect } from "next/navigation";
import type { BriefInput, DraftMember, PrepRequest, RehearseIn } from "@/lib/contract";
import { deckText } from "@/lib/deck";
import { N8N_URL, addMeeting, getMeeting, prepSession, prepSteps } from "@/lib/api";
import { othersDoingThis } from "@/lib/deckResearch";
import { prepDone, prepFailed, prepProgress, prepReused, prepStarted } from "@/lib/prepProgress";
import { forgetPrep, keepPrep, prepKey, reusablePrep } from "@/lib/prepCache";
import { getBrief, getRoom, panelProblem, setDeck, updateRoom } from "@/lib/room";
import { getProfile, saveProfile } from "@/lib/profile";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// Seating or briefing a panel replaces the room's run: never while one is live (it would be lost, without a debrief)
const LIVE_RUN = "A rehearsal is running. End it on the dashboard first, so it gets its debrief.";

// Seats this meeting's practice panel in the room (the headset follows it), then opens the practice table
export async function practiseAction(meetingId: string): Promise<Result<never>> {
  if (getRoom().phase === "live") return { ok: false, error: LIVE_RUN };
  const detail = await getMeeting(meetingId);
  if (!detail?.proposal) return { ok: false, error: "This meeting's brief isn't ready yet." };
  const { meeting, proposal } = detail;
  // A real attendee's address (0.27), so /prep can seat them from their twin: from the brief's attendees, by name
  const emailOf = (name: string) => detail.brief?.attendees.find((a) => a.email.includes("@") && a.name.trim().toLowerCase() === name.trim().toLowerCase())?.email;
  const panel: DraftMember[] = proposal.members.map((m) => {
    const email = m.source === "email" ? emailOf(m.display_name) : undefined;
    return { ...m, difficulty: 2, ...(email ? { twin_email: email.toLowerCase() } : {}) };
  });
  const input: BriefInput = {
    presenter: { name: process.env.DRYRUN_PRESENTER_NAME ?? "", email: process.env.DRYRUN_OWNER_EMAIL ?? "" },
    deck: null,
    prospect: { company: meeting.company, website: "", context: meeting.title },
  };
  // A deck belongs to its meeting: seating another meeting's panel takes it off the screens
  if (getBrief()?.draft_id !== meeting.id) setDeck(null);
  // The pitch length starts at n8n's suggestion for this meeting; the presenter can change it on the practice page
  updateRoom(
    { phase: "drafting", prospect: { company: meeting.company }, panel, bundle: null, session_id: null, pitch_minutes: proposal.pitch?.minutes ?? 5 },
    { input, draft_id: meeting.id, suggestions: proposal.suggestions, pitch: proposal.pitch, goal: proposal.goal },
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
      offer: (await getProfile()).offer || undefined,
    });
  } catch {
    return { ok: false, error: "n8n didn't take it. Check that the DryRun prep workflow is active." };
  }
  // A new brief changes what /prep plans from
  await forgetPrep(meetingId);
  return { ok: true, value: null };
}

// Know your side (0.26): what the presenter offers (once, for every meeting) and what they want from this one. Saved on the laptop only.
export async function saveSideAction(meetingId: string, side: { offer: string; goal: string }): Promise<Result<null>> {
  await saveProfile({ offer: side.offer, goal: { meetingId, text: side.goal } });
  return { ok: true, value: null };
}

// Where a briefed panel is rehearsed: the browser's rehearsal page, or the dashboard while the headset rehearses
function rehearsalPath(sessionId: string, rehearseIn: RehearseIn): string {
  return rehearseIn === "browser" ? `/s/${sessionId}/rehearse` : `/s/${sessionId}`;
}

// What /prep gets for this panel: each slide's text (n8n can't reach the laptop's files), the pitch length set on the practice page,
// and what the presenter offers and wants from this meeting (0.26: their own words, else n8n's guess)
async function prepRequest(input: BriefInput, draftId: string, panel: DraftMember[]): Promise<PrepRequest> {
  const room = getRoom();
  const deck = room.deck ? await deckText(room.deck) : null;
  const profile = await getProfile();
  const own = profile.goals[draftId];
  const guess = getBrief()?.draft_id === draftId ? getBrief()?.goal?.text : undefined;
  const goal = own ? { text: own, source: "presenter" as const } : guess ? { text: guess, source: "n8n" as const } : null;
  input = { ...input, presenter: { ...input.presenter, ...(profile.offer ? { offer: profile.offer } : {}) } };
  return { ...input, deck, draft_id: draftId, pitch_minutes: room.pitch_minutes, panel, goal };
}

// When n8n last prepared exactly this rehearsal (same panel, deck, pitch length and goal, nothing debriefed since), or null.
// The practice page's Rehearse dialog says so, and offers to ask n8n again anyway.
export async function reusablePrepAction(input: BriefInput, draftId: string, panel: DraftMember[]): Promise<string | null> {
  if (!N8N_URL || panel.length === 0) return null;
  const request = await prepRequest(input, draftId, panel);
  return (await reusablePrep(draftId, await prepKey(request, await othersDoingThis(draftId))))?.at ?? null;
}

// Runs n8n's /prep for the panel and puts the bundle in the room, briefed. Returns the session id, or throws.
// With a `runId`, the practice page follows n8n's progress (GET /api/prep/progress). Unless `fresh`, the same rehearsal prepared
// before is reused from the laptop (prepCache.ts) and n8n isn't called.
async function prepare(input: BriefInput, draftId: string, panel: DraftMember[], rehearseIn: RehearseIn, runId?: string, fresh = false): Promise<string> {
  const room = getRoom();
  const request = await prepRequest(input, draftId, panel);
  const others = await othersDoingThis(draftId);
  const key = N8N_URL ? await prepKey(request, others) : null;
  const kept = key && !fresh ? await reusablePrep(draftId, key) : null;
  let bundle;
  if (kept) {
    // The same deck uploaded again has new slide images: the bundle shows this one's
    const images = new Map((room.deck?.slides ?? []).map((s) => [s.index, s.image_url]));
    bundle = { ...kept.bundle, slides: kept.bundle.slides.map((s) => ({ ...s, image_url: images.get(s.index) ?? s.image_url })) };
  } else {
    prepStarted(runId, request.deck ? request.deck.slides.length : null, panel.length, room.pitch_minutes);
    try {
      bundle = await prepSession(request, room.deck, (p, url) => prepProgress(runId, p, url));
    } catch (err) {
      prepFailed(runId, "n8n couldn't plan the rehearsal. Try again in a moment.");
      throw err;
    }
  }
  updateRoom({
    phase: "briefed",
    bundle,
    session_id: bundle.session_id,
    live: null,
    debrief: null,
    rehearse_in: rehearseIn,
    panel: bundle.personas.map(({ id, seat, color, role, role_short, display_name, avatar, difficulty, twin_email }) => ({ id, seat, color, role, role_short, display_name, avatar, difficulty, ...(twin_email ? { twin_email } : {}) })),
  });
  if (kept) {
    prepReused(runId, kept.at, kept.steps);
    return bundle.session_id;
  }
  const steps = prepSteps(bundle, others);
  prepDone(runId, steps);
  if (key) await keepPrep(draftId, key, bundle, steps).catch(() => {});
  return bundle.session_id;
}

// Briefs the practice panel and puts the bundle in the room. Answers with where to rehearse: the browser's rehearsal page, or the dashboard (for VR).
export async function briefPanelAction(
  input: BriefInput,
  draftId: string,
  panel: DraftMember[],
  rehearseIn: RehearseIn = "vr",
  runId?: string,
  fresh = false,
): Promise<Result<string>> {
  const problem = panel.length === 0 ? "The panel needs at least one person." : panelProblem(panel);
  if (problem) return { ok: false, error: problem };
  const roleless = panel.filter((m) => !m.role.trim()).map((m) => m.display_name || "someone");
  if (roleless.length) return { ok: false, error: `Add a role for ${roleless.join(" and ")}: what they do shapes what they push on.` };
  if (getRoom().phase === "live") return { ok: false, error: LIVE_RUN };
  let sessionId: string;
  try {
    sessionId = await prepare(input, draftId, panel, rehearseIn, runId, fresh);
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
  if (room.phase === "live") return { ok: false, error: LIVE_RUN };
  let sessionId: string;
  try {
    sessionId = await prepare(brief.input, brief.draft_id, room.panel, room.rehearse_in);
  } catch {
    return { ok: false, error: "Couldn't brief the panel again. Try again in a moment." };
  }
  redirect(rehearsalPath(sessionId, room.rehearse_in));
}
