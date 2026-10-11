import { connection } from "next/server";
import type { Bundle, Deck, Meeting, MeetingDetail, NewMeeting, PrepRequest, PrepStep, SessionRecord } from "./contract";
import { demoMeeting, demoMeetingDetail, demoSkippedMeeting } from "./mock/meetings";
import { SAMPLE_ID, sampleBundle, sampleDetail } from "./mock/sample";
import { mockPrep } from "./mock/prep";
import { demoPrepSession, demoSession } from "./mock/session";
import { getRoom } from "./room";
import { cachedVoices, saveBundleAudio } from "./audio";
import { cachedSession } from "./sessions";
import type { N8nProgress } from "./prepProgress";

const MOCKS: Record<string, SessionRecord> = { demo: demoSession, "demo-prep": demoPrepSession };

// Server-side calls to n8n. With DRYRUN_N8N_URL unset, sample data is served instead,
// so the UI can be built before the workflows exist.
export const N8N_URL = process.env.DRYRUN_N8N_URL;

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  // The sample sessions
  if (MOCKS[sessionId]) return MOCKS[sessionId];
  // The sample meeting's, and its runs (never debriefed): from the laptop, so they never reach n8n
  if (sessionId === SAMPLE_ID || sessionId.startsWith(`${SAMPLE_ID}-`))
    return { bundle: sampleBundle, status: { done: true, steps: prepSteps(sampleBundle) }, telemetry: null, debrief_status: null, debrief: null, history: [] };
  // A run debriefed on this laptop: its copy, so opening a report costs no n8n call
  const cached = await cachedSession(sessionId);
  if (cached) return cached;
  // The session in the room right now, before it has been rehearsed
  const room = getRoom();
  if (room.session_id === sessionId && room.bundle) {
    return { bundle: room.bundle, status: { done: true, steps: prepSteps(room.bundle) }, telemetry: null, debrief_status: null, debrief: null, history: [] };
  }
  if (!N8N_URL) return null;
  // Any other session from n8n's sessions table (contract: GET /session), e.g. from another laptop
  return readOnce(`session:${sessionId}`, () => SETTLED_MS, async () => {
    const res = await fetch(`${N8N_URL}/session?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`n8n /session failed: ${res.status}`);
    return (await res.json()) as SessionRecord;
  });
}

// What n8n's rehearsal prep did, read from its bundle, so the dashboard's feed shows this panel's real prep
export function prepSteps(bundle: Bundle): PrepStep[] {
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
  // From the last rehearsal of this meeting (0.20): harder where it was weak, with that run's talk track
  const pressing = bundle.personas.flatMap((p) => p.objections.filter((o) => o.source === "history").map((o) => `${p.display_name.split(" ")[0]}: ${o.text}`));
  if (pressing.length > 0) steps.push({ id: "history", label: "Briefed the panel on last time's weak spots", state: "done", detail: pressing.slice(0, 3).join("; ") });
  const tracks = bundle.slides.filter((s) => s.notes).length;
  if (tracks > 0) steps.push({ id: "notes", label: "Kept last time's talk track", state: "done", detail: `${tracks} slide${tracks === 1 ? "" : "s"}` });
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

// Upcoming meetings n8n has picked up (contract: GET /meetings). The sample meeting isn't one: the home page shows it on its own.
export async function listMeetings(): Promise<Meeting[]> {
  if (!N8N_URL) return [demoSkippedMeeting];
  return readOnce("meetings", (ms: Meeting[]) => (ms.some((m) => m.status === "researching") ? FRESH_MS : SETTLED_MS), async () => {
    const res = await fetch(`${N8N_URL}/meetings`, { cache: "no-store" });
    if (!res.ok) throw new Error(`n8n /meetings failed: ${res.status}`);
    return ((await res.json()) as { meetings: Meeting[] }).meetings ?? [];
  });
}

// One meeting with its brief and practice panel (contract: GET /meeting)
export async function getMeeting(id: string): Promise<MeetingDetail | null> {
  if (id === SAMPLE_ID) {
    // Read at request time like n8n's meetings: its page says how far off it is
    await connection();
    return sampleDetail;
  }
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

async function readOnce<T>(key: string, keepFor: (value: T) => number, load: () => Promise<T>): Promise<T> {
  // n8n's answer can change at any time, so it's read at request time, never while prerendering (the clock below needs it too)
  await connection();
  const hit = reads.get(key);
  if (hit && Date.now() < hit.until) return hit.value as Promise<T>;
  const value = load();
  // In flight: everyone asking now shares this request
  reads.set(key, { until: Number.POSITIVE_INFINITY, value });
  value.then(
    (v) => reads.set(key, { until: Date.now() + keepFor(v), value }),
    // A failure is kept for a few seconds too, so pages that can't reach n8n don't retry it in a tight loop
    () => reads.set(key, { until: Date.now() + FAILED_MS, value }),
  );
  return value;
}

const FAILED_MS = 5_000;

// Why n8n couldn't be reached, in words the presenter can act on
export function n8nProblem(err: unknown): string {
  const code = (err as { cause?: { code?: string } })?.cause?.code ?? "";
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code))
    return "This network is intercepting secure connections, usually a Wi-Fi login page. Sign in to the Wi-Fi (open http://neverssl.com in the browser) or use a phone hotspot, then reload.";
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR/.test(code)) return "The laptop has no connection to n8n. Check the internet connection, then reload.";
  return "Check that the DryRun workflows are active in n8n, then reload.";
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
export async function prepSession(input: PrepRequest, deck: Deck | null, onProgress?: (p: N8nProgress, n8nUrl: string | null) => void): Promise<Bundle> {
  if (!N8N_URL) return mockPrep(input.panel, input.pitch_minutes);
  // DRYRUN_VOICES=off skips voicing the lines (testing without spending TTS credits)
  const bundle = await saveBundleAudio(await streamPrep({ ...input, voices: process.env.DRYRUN_VOICES !== "off", cached_voices: await cachedVoices() }, onProgress));
  const images = new Map((deck?.slides ?? []).map((s) => [s.index, s.image_url]));
  return { ...bundle, slides: bundle.slides.map((s) => ({ ...s, image_url: images.get(s.index) ?? "" })) };
}

// POST /prep (contract 0.24). n8n streams its answer: a chunk after each stage ({ progress, execution_id, workflow_id }), then the bundle.
// Each chunk is n8n's { type: "begin" | "item" | "end" | "error", content } object; a plain JSON bundle (before streaming) works too.
async function streamPrep(body: unknown, onProgress?: (p: N8nProgress, n8nUrl: string | null) => void): Promise<Bundle> {
  const res = await fetch(`${N8N_URL}/prep`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error(`n8n /prep failed: ${res.status}`);
  let bundle: Bundle | null = null;
  let failed: string | null = null;
  const take = (value: unknown) => {
    const v = typeof value === "string" ? parseOrNull(value) : value;
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (o.type === "error") failed = typeof o.content === "string" ? o.content : "n8n stopped with an error";
    else if (typeof o.type === "string" && "content" in o) take(o.content);
    else if (o.progress) {
      const run = typeof o.execution_id === "string" && typeof o.workflow_id === "string" ? { execution_id: o.execution_id, workflow_id: o.workflow_id } : null;
      onProgress?.(o.progress as N8nProgress, n8nRunUrl(run));
    } else if (typeof o.session_id === "string") bundle = o as unknown as Bundle;
  };
  const split = jsonObjects();
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const text of split(value)) take(parseOrNull(text));
  }
  if (failed) throw new Error(`n8n /prep failed: ${failed}`);
  if (!bundle) throw new Error("n8n /prep answered without a bundle");
  return bundle;
}

function parseOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Splits a stream of JSON objects (one per line or run together) into each object's text, however the chunks are cut
function jsonObjects() {
  let buf = "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  return (chunk: string): string[] => {
    const out: string[] = [];
    const from = buf.length;
    buf += chunk;
    for (let i = from; i < buf.length; i++) {
      const c = buf[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === "{") {
        if (depth++ === 0) start = i;
      } else if (c === "}" && depth > 0 && --depth === 0) {
        out.push(buf.slice(start, i + 1));
        start = -1;
      }
    }
    // Keep only the object still being read
    if (depth === 0) buf = "";
    else if (start > 0) {
      buf = buf.slice(start);
      start = 0;
    }
    return out;
  };
}
