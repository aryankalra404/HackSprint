import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionRecord } from "./contract";

// Debriefed sessions kept on the laptop, so a report opened again (from the dashboard, a meeting or the email) costs no n8n call.
// n8n's DryRun sessions table stays the source of truth; this is a copy of what it sent back.
const DIR = path.join(process.cwd(), ".sessions");

const file = (id: string) => path.join(DIR, `${id.replace(/[^\w-]/g, "_")}.json`);

export async function cachedSession(id: string): Promise<SessionRecord | null> {
  try {
    return JSON.parse(await readFile(file(id), "utf8")) as SessionRecord;
  } catch {
    return null;
  }
}

export async function cacheSession(id: string, record: SessionRecord): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(file(id), JSON.stringify(record));
}
