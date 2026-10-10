import type { Bundle, BriefInput, DraftMember, Meeting, MeetingDetail, NewMeeting, SessionRecord } from "./contract";
import { demoMeeting, demoMeetingDetail } from "./mock/meetings";
import { mockPrep } from "./mock/prep";
import { demoPrepSession, demoSession } from "./mock/session";
import { getRoom } from "./room";

const MOCKS: Record<string, SessionRecord> = { demo: demoSession, "demo-prep": demoPrepSession };

// Server-side calls to n8n. With DRYRUN_N8N_URL unset, sample data is served instead,
// so the UI can be built before the workflows exist.
export const N8N_URL = process.env.DRYRUN_N8N_URL;

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  // The sample sessions, and the session in the room right now, until n8n stores sessions
  if (MOCKS[sessionId]) return MOCKS[sessionId];
  const room = getRoom();
  if (room.session_id === sessionId && room.bundle) {
    const n = room.bundle.personas.length;
    const steps = demoPrepSession.status.steps.map((s) =>
      s.id === "personas" ? { ...s, detail: `${n} stakeholders, ${room.bundle!.personas.reduce((a, p) => a + p.objections.length, 0)} objections` } : s,
    );
    return { bundle: room.bundle, status: { done: true, steps }, telemetry: null, debrief: null, history: [] };
  }
  if (!N8N_URL) return MOCKS[sessionId] ?? null;

  const res = await fetch(`${N8N_URL}/session?session_id=${encodeURIComponent(sessionId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`n8n /session failed: ${res.status}`);
  return res.json();
}

export async function postToN8n<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${N8N_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`n8n ${path} failed: ${res.status}`);
  return res.json();
}

// Upcoming meetings n8n has picked up (contract: GET /meetings)
export async function listMeetings(): Promise<Meeting[]> {
  if (!N8N_URL) return [demoMeeting];
  const res = await fetch(`${N8N_URL}/meetings`, { cache: "no-store" });
  if (!res.ok) throw new Error(`n8n /meetings failed: ${res.status}`);
  return ((await res.json()) as { meetings: Meeting[] }).meetings ?? [];
}

// One meeting with its brief and practice panel (contract: GET /meeting)
export async function getMeeting(id: string): Promise<MeetingDetail | null> {
  if (!N8N_URL) return id === demoMeeting.id ? demoMeetingDetail : null;
  const res = await fetch(`${N8N_URL}/meeting?id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`n8n /meeting failed: ${res.status}`);
  const detail = (await res.json()) as MeetingDetail & { error?: string };
  return detail.error ? null : detail;
}

// The n8n editor page for a run, so the progress view can link to the real execution
export function n8nRunUrl(run: Meeting["run"]): string | null {
  if (!N8N_URL || !run) return null;
  return `${new URL(N8N_URL).origin}/workflow/${run.workflow_id}/executions/${run.execution_id}`;
}

// Hands a meeting to n8n to research and brief; it shows up in /meetings straight away as "researching"
export async function addMeeting(meeting: NewMeeting): Promise<void> {
  if (!N8N_URL) return;
  await postToN8n("/add-meeting", meeting);
}

// Builds the rehearsal bundle for a practice panel. n8n's /prep workflow isn't built yet, so this uses the sample deck and
// the panel's own focus (from the brief) as their objections.
export async function prepSession(input: BriefInput & { draft_id: string; panel: DraftMember[] }): Promise<Bundle> {
  return mockPrep(input.panel);
}
