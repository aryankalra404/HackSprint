import type { Bundle, PrepStep, RoomDebrief, SessionRecord, Telemetry, TelemetryEvent } from "./contract";
import { N8N_URL, forgetMeetingReads } from "./api";
import { getBrief, getRoom, slideLog, updateRoom } from "./room";
import { cacheSession } from "./sessions";
import { failedTurns } from "./turns";

// The laptop's side of a debrief (contract: POST /debrief). When a run ends, whoever ended it, the laptop sends n8n what happened
// (every turn with its transcript, the slide changes it saw, and the rehearsing client's telemetry if it came first), and shows n8n's
// progress in the room as it goes: n8n saves each step to its sessions table, and the laptop reads it every few seconds while it
// waits for the result. The finished session is kept on the laptop for the report.

const POLL_MS = 4_000;
const MAX_POLLS = 30;
const TIMEOUT_MS = 180_000;

type ClientTelemetry = Pick<Telemetry, "client" | "duration_s" | "events" | "gaze_dwell_s" | "facing_slides_s">;

const g = globalThis as { __dryrunClientTelemetry?: { at: number; telemetry: ClientTelemetry } };

// A run's own session id: the bundle's, plus when the run started, so each run of the same panel gets its own report
export function runId(sessionId: string, startedAt: string): string {
  return `${sessionId}-${Date.parse(startedAt).toString(36)}`;
}

// What the rehearsing client knows (the headset's gaze, silences), posted before it ends the session (contract: POST /api/debrief)
export function keepClientTelemetry(telemetry: ClientTelemetry): void {
  g.__dryrunClientTelemetry = { at: Date.now(), telemetry };
}

// The bundle without audio, as n8n gets it
function withoutAudio(bundle: Bundle): Bundle {
  return { ...bundle, lines: bundle.lines.map(({ audio_base64: _a, audio_url: _u, ...l }) => l) };
}

function setDebrief(id: string, patch: Partial<RoomDebrief>): void {
  const room = getRoom();
  // Only while the room still shows this run's debrief (a new run clears it)
  if (room.debrief?.run_id !== id) return;
  updateRoom({ debrief: { ...room.debrief, ...patch } });
}

// Starts the debrief of the run that just ended. Safe to call more than once: a run is debriefed once, unless `again` (after a failure).
export function startDebrief(again = false): void {
  const room = getRoom();
  if (room.phase !== "done" || !room.live || !room.bundle || !room.session_id) return;
  const id = runId(room.session_id, room.live.started_at);
  if (room.debrief?.run_id === id && !(again && room.debrief.state === "failed")) return;
  const feed = room.live.feed ?? [];
  // The sample's run is scripted, so there's nothing of the presenter's to score (and it costs no n8n execution)
  if (room.scripted) {
    updateRoom({ debrief: { run_id: id, state: "skipped", steps: [], error: "The sample isn't scored: its run is scripted." } });
    return;
  }
  if (!N8N_URL || feed.length === 0) {
    updateRoom({ debrief: { run_id: id, state: "skipped", steps: [], error: N8N_URL ? "Nothing was said, so there's nothing to debrief." : "n8n isn't connected." } });
    return;
  }
  const first: PrepStep = { id: "read", label: "Sent the session to n8n", state: "running", detail: `${feed.length} turn${feed.length === 1 ? "" : "s"} and the slide changes` };
  updateRoom({ debrief: { run_id: id, state: "running", steps: [first], error: null } });

  const started = Date.parse(room.live.started_at);
  const ended = room.live.ended_at ? Date.parse(room.live.ended_at) : Date.now();
  const telemetry = g.__dryrunClientTelemetry && g.__dryrunClientTelemetry.at >= started ? g.__dryrunClientTelemetry.telemetry : null;
  const turns: TelemetryEvent[] = feed.map((t) => ({ type: "turn", ...t }));
  const events = [...slideLog(room.live.started_at), ...turns, ...failedTurns(room.live.started_at), ...(telemetry?.events.filter((e) => e.type !== "turn" && e.type !== "slide") ?? [])].sort((a, b) => a.t - b.t);
  const body = {
    session_id: id,
    meeting_id: getBrief()?.draft_id ?? "",
    client: telemetry?.client ?? (room.rehearse_in === "browser" ? "web" : "vr"),
    duration_s: Math.round((ended - started) / 100) / 10,
    owner_email: process.env.DRYRUN_OWNER_EMAIL ?? "",
    presenter: { name: process.env.DRYRUN_PRESENTER_NAME ?? "", email: process.env.DRYRUN_OWNER_EMAIL ?? "" },
    events,
    ...(telemetry?.gaze_dwell_s ? { gaze_dwell_s: telemetry.gaze_dwell_s } : {}),
    ...(telemetry?.facing_slides_s != null ? { facing_slides_s: telemetry.facing_slides_s } : {}),
    bundle: withoutAudio(room.bundle),
  };
  void run(id, body);
}

async function run(id: string, body: unknown): Promise<void> {
  let done = false;
  const follow = followProgress(id, () => done);
  try {
    const res = await fetch(`${N8N_URL}/debrief`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`n8n /debrief failed: ${res.status}`);
    const record = (await res.json()) as SessionRecord;
    if (!record.debrief) throw new Error("n8n sent no debrief");
    done = true;
    await cacheSession(id, record);
    // The meeting is now practised, with a new score
    forgetMeetingReads();
    setDebrief(id, { state: "done", steps: record.debrief_status?.steps ?? [], error: null, overall: record.debrief.overall, headline: record.debrief.headline });
  } catch (err) {
    done = true;
    const message = err instanceof Error && err.name === "TimeoutError" ? "n8n took too long" : err instanceof Error ? err.message : "The debrief failed";
    setDebrief(id, { state: "failed", error: message });
  }
  await follow;
}

// n8n's steps while it works, read from GET /session (each read is an execution, so only while waiting, every few seconds)
async function followProgress(id: string, finished: () => boolean): Promise<void> {
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (finished() || getRoom().debrief?.run_id !== id) return;
    try {
      const res = await fetch(`${N8N_URL}/session?session_id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) continue;
      const record = (await res.json()) as SessionRecord;
      const steps = record.debrief_status?.steps;
      if (steps?.length && !finished()) setDebrief(id, { steps });
    } catch {
      // The result will come with the debrief's answer anyway
    }
  }
}
