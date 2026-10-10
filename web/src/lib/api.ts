import type { SessionRecord } from "./contract";
import { demoSession } from "./mock/session";

// Server-side calls to n8n. With DRYRUN_N8N_URL unset, the sample session is served instead,
// so the UI can be built before the workflows exist.
const N8N_URL = process.env.DRYRUN_N8N_URL;

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  if (!N8N_URL) return sessionId === "demo" ? demoSession : null;

  const res = await fetch(`${N8N_URL}/session?session_id=${encodeURIComponent(sessionId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`n8n /session failed: ${res.status}`);
  return res.json();
}
