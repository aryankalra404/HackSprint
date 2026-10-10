import type { Bundle, BriefInput, DraftMember, PanelProposal, SessionRecord } from "./contract";
import { demoProposal } from "./mock/panel";
import { demoPrepSession, demoSession } from "./mock/session";

const MOCKS: Record<string, SessionRecord> = { demo: demoSession, "demo-prep": demoPrepSession };

// Server-side calls to n8n. With DRYRUN_N8N_URL unset, the sample session is served instead,
// so the UI can be built before the workflows exist.
const N8N_URL = process.env.DRYRUN_N8N_URL;

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  if (!N8N_URL) return MOCKS[sessionId] ?? null;

  const res = await fetch(`${N8N_URL}/session?session_id=${encodeURIComponent(sessionId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`n8n /session failed: ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
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
  return post("/panel", input);
}

// n8n briefs the confirmed panel and returns the bundle
export async function prepSession(input: BriefInput & { draft_id: string; panel: DraftMember[] }): Promise<Bundle> {
  if (!N8N_URL) return demoPrepSession.bundle;
  return post("/prep", input);
}
