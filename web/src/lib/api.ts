import type { Bundle, BriefInput, DraftMember, PanelProposal, SessionRecord } from "./contract";
import { demoProposal } from "./mock/panel";
import { mockPrep } from "./mock/prep";
import { demoPrepSession, demoSession } from "./mock/session";
import { getRoom } from "./room";

const MOCKS: Record<string, SessionRecord> = { demo: demoSession, "demo-prep": demoPrepSession };

// Server-side calls to n8n. With DRYRUN_N8N_URL unset, sample data is served instead,
// so the UI can be built before the workflows exist.
export const N8N_URL = process.env.DRYRUN_N8N_URL;

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  // The session in the room right now, until n8n has stored it
  const room = getRoom();
  if (room.session_id === sessionId && room.bundle && !N8N_URL) {
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

// n8n proposes who will be in the room
export async function proposePanel(input: BriefInput): Promise<PanelProposal> {
  if (!N8N_URL) {
    await new Promise((r) => setTimeout(r, 1500));
    return demoProposal;
  }
  return postToN8n("/panel", input);
}

// n8n briefs the confirmed panel and returns the bundle
export async function prepSession(input: BriefInput & { draft_id: string; panel: DraftMember[] }): Promise<Bundle> {
  if (!N8N_URL) return mockPrep(input.panel);
  return postToN8n("/prep", input);
}
