import type { Bundle, Deck, Meeting, MeetingDetail, NewMeeting, PrepRequest, PrepStep, SessionRecord } from "./contract";
import { demoMeeting, demoMeetingDetail, demoSkippedMeeting } from "./mock/meetings";
import { mockPrep } from "./mock/prep";
import { demoPrepSession, demoSession } from "./mock/session";
import { getRoom } from "./room";
import { saveBundleAudio } from "./audio";

const MOCKS: Record<string, SessionRecord> = { demo: demoSession, "demo-prep": demoPrepSession };

// Server-side calls to n8n. With DRYRUN_N8N_URL unset, sample data is served instead,
// so the UI can be built before the workflows exist.
export const N8N_URL = process.env.DRYRUN_N8N_URL;

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  // The sample sessions, and the session in the room right now, until n8n stores sessions
  if (MOCKS[sessionId]) return MOCKS[sessionId];
  const room = getRoom();
  if (room.session_id === sessionId && room.bundle) {
    return { bundle: room.bundle, status: { done: true, steps: prepSteps(room.bundle) }, telemetry: null, debrief_status: null, debrief: null, history: [] };
  }
  if (!N8N_URL) return MOCKS[sessionId] ?? null;

  const res = await fetch(`${N8N_URL}/session?session_id=${encodeURIComponent(sessionId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`n8n /session failed: ${res.status}`);
  return res.json();
}

// What n8n's rehearsal prep did, read from its bundle, so the dashboard's feed shows this panel's real prep
function prepSteps(bundle: Bundle): PrepStep[] {
  const objections = bundle.personas.reduce((n, p) => n + p.objections.length, 0);
  const chair = bundle.personas.find((p) => p.chair);
  const interrupts = bundle.personas.filter((p) => p.manner === "interrupts").map((p) => p.display_name.split(" ")[0]);
  const cues = bundle.slides.filter((s) => s.rescue).length * 3;
  const voiced = bundle.lines.filter((l) => l.audio_url).length;
  const steps: PrepStep[] = [];
  if (bundle.slides.length > 0)
    steps.push({ id: "deck", label: "Read the deck", state: "done", detail: `${bundle.slides.length} slides, key points and a target time for each` });
  steps.push({
    id: "personas",
    label: "Briefed the panel",
    state: "done",
    detail: `${bundle.personas.length} people, ${objections} objections${chair ? `; ${chair.display_name.split(" ")[0]} chairs` : ""}${interrupts.length ? `; ${interrupts.join(", ")} may interrupt` : ""}`,
  });
  steps.push({
    id: "plan",
    label: `Planned ${bundle.plan.during_pitch} questions during the pitch and ${bundle.plan.after_pitch} after`,
    state: "done",
    detail: bundle.plan.why,
  });
  if (voiced > 0) steps.push({ id: "lines", label: `Voiced ${voiced} lines ahead of time`, state: "done", detail: "The welcome, opening the floor and acknowledgements, so they play at once" });
  if (cues > 0) steps.push({ id: "rescue", label: "Prepared rescue cues", state: "done", detail: `${cues} cues across ${bundle.slides.length} slides` });
  return steps;
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
  if (!N8N_URL) return [demoSkippedMeeting, demoMeeting].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return readOnce("meetings", (ms: Meeting[]) => (ms.some((m) => m.status === "researching") ? FRESH_MS : SETTLED_MS), async () => {
    const res = await fetch(`${N8N_URL}/meetings`, { cache: "no-store" });
    if (!res.ok) throw new Error(`n8n /meetings failed: ${res.status}`);
    return ((await res.json()) as { meetings: Meeting[] }).meetings ?? [];
  });
}

// One meeting with its brief and practice panel (contract: GET /meeting)
export async function getMeeting(id: string): Promise<MeetingDetail | null> {
  if (!N8N_URL) return id === demoMeeting.id ? demoMeetingDetail : id === demoSkippedMeeting.id ? { meeting: demoSkippedMeeting, brief: null, proposal: null } : null;
  return readOnce(`meeting:${id}`, (d: MeetingDetail | null) => (d?.meeting.status === "researching" ? FRESH_MS : SETTLED_MS), async () => {
    const res = await fetch(`${N8N_URL}/meeting?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`n8n /meeting failed: ${res.status}`);
    const detail = (await res.json()) as MeetingDetail & { error?: string };
    return detail.error ? null : detail;
  });
}

// Every read of n8n's meetings is an n8n execution, and the plan allows only so many (a page reloading in a loop once used up a
// month's in an hour). So reads are shared: callers within a short time get the same answer, and one request is in flight per key.
// A meeting n8n is still preparing is re-read after 2.5 s, in time for the 3 s refresh; anything else is kept for 30 s.
const FRESH_MS = 2_500;
const SETTLED_MS = 30_000;
const reads = ((globalThis as { __dryrunReads?: Map<string, { until: number; value: Promise<unknown> }> }).__dryrunReads ??= new Map());

function readOnce<T>(key: string, keepFor: (value: T) => number, load: () => Promise<T>): Promise<T> {
  const hit = reads.get(key);
  if (hit && Date.now() < hit.until) return hit.value as Promise<T>;
  const value = load();
  // In flight: everyone asking now shares this request
  reads.set(key, { until: Number.POSITIVE_INFINITY, value });
  value.then(
    (v) => reads.set(key, { until: Date.now() + keepFor(v), value }),
    () => reads.delete(key),
  );
  return value;
}

// After a change (a meeting added or retried), the next read goes to n8n
export function forgetMeetingReads(): void {
  reads.clear();
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
  forgetMeetingReads();
}

// Builds the rehearsal bundle for a practice panel (contract: POST /prep): n8n plans the slides, the panel, the questions and the
// lines, and voices the lines. Each slide's image is the laptop's own (n8n leaves image_url empty), and the voices are saved on it. Without n8n, the sample bundle stands in.
export async function prepSession(input: PrepRequest, deck: Deck | null): Promise<Bundle> {
  if (!N8N_URL) return mockPrep(input.panel, input.pitch_minutes);
  // DRYRUN_VOICES=off skips voicing the lines (testing without spending TTS credits)
  const bundle = await saveBundleAudio(await postToN8n<Bundle>("/prep", { ...input, voices: process.env.DRYRUN_VOICES !== "off" }));
  const images = new Map((deck?.slides ?? []).map((s) => [s.index, s.image_url]));
  return { ...bundle, slides: bundle.slides.map((s) => ({ ...s, image_url: images.get(s.index) ?? "" })) };
}
