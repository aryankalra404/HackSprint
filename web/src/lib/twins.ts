import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AvatarId, ColorIndex, Twin, TwinChange, TwinFact, TwinListItem, TwinLogStep, TwinMeeting, TwinReading, TwinSource } from "./contract";
import { N8N_URL, forgetMeetingReads, jsonObjects, n8nRunUrl, parseOrNull, postToN8n, readOnce } from "./api";
import { SAMPLE_TWIN_EMAIL, sampleTwin } from "./mock/twin";
import { applyChanges, summarize } from "./twinView";

// Twins of the people you meet (contract 0.27). n8n builds and keeps them (DryRun twin, DryRun twin update, the DryRun people table);
// the laptop keeps a copy of every twin it has seen in .twins/, refreshed from each build's and update's answer, so viewing a twin or
// the people list costs no n8n execution. It reads GET /twin or GET /twins only when it has no copy.

// The face and colour a person sits as at the practice table, for the twin page's portrait (kept with the laptop's copy)
export interface Look {
  avatar?: AvatarId;
  color?: ColorIndex;
}

interface Stored {
  twin: Twin;
  look?: Look;
}

const DIR = path.join(process.cwd(), ".twins");
const file = (email: string) => path.join(DIR, `${email.replace(/[^\w.@-]/g, "_")}.json`);
export const norm = (email: string) => email.trim().toLowerCase();
export const isSampleTwin = (email: string) => norm(email) === SAMPLE_TWIN_EMAIL;

async function readStored(email: string): Promise<Stored | null> {
  try {
    return JSON.parse(await readFile(file(norm(email)), "utf8")) as Stored;
  } catch {
    return null;
  }
}

async function writeStored(email: string, stored: Stored): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(file(norm(email)), JSON.stringify(stored));
}

// One twin: the laptop's copy, the sample, or (once) n8n's
export async function getTwin(email: string): Promise<Stored | null> {
  const e = norm(email);
  const local = await readStored(e);
  if (local) return local;
  if (isSampleTwin(e)) return { twin: sampleTwin(), look: { avatar: "business_male_01", color: 1 } };
  if (!N8N_URL) return null;
  try {
    const twin = await readOnce(`twin:${e}`, () => 30_000, async () => {
      const res = await fetch(`${N8N_URL}/twin?email=${encodeURIComponent(e)}`, { cache: "no-store" });
      if (!res.ok) return null;
      return ((await res.json()) as { twin?: Twin | null }).twin ?? null;
    });
    if (!twin) return null;
    await writeStored(e, { twin });
    return { twin };
  } catch {
    return null;
  }
}

// Remember how this person looks at the table (from the meeting the presenter came from), for the portrait
export async function rememberLook(email: string, look: Look): Promise<void> {
  const stored = await readStored(email);
  if (!stored || (stored.look?.avatar === look.avatar && stored.look?.color === look.color)) return;
  await writeStored(email, { ...stored, look: { ...stored.look, ...look } });
}

// Everyone DryRun knows: the laptop's copies, the sample, and n8n's list (read once per laptop run)
export async function listTwins(): Promise<TwinListItem[]> {
  const items = new Map<string, TwinListItem>();
  const add = (t: Twin) => items.set(t.email, { email: t.email, name: t.name, company: t.company, role: t.role?.text ?? "", updated: t.updated, ...summarize(t) });
  add(sampleTwin());
  if (N8N_URL) {
    try {
      const remote = await readOnce("twins", () => Number.POSITIVE_INFINITY, async () => {
        const res = await fetch(`${N8N_URL}/twins`, { cache: "no-store" });
        if (!res.ok) return [] as TwinListItem[];
        return ((await res.json()) as { twins?: TwinListItem[] }).twins ?? [];
      });
      remote.forEach((x) => items.set(x.email, x));
    } catch {
      // n8n unreachable: the laptop's copies still show
    }
  }
  let names: string[] = [];
  try {
    names = (await readdir(DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    // No copies yet
  }
  for (const n of names) {
    try {
      add((JSON.parse(await readFile(path.join(DIR, n), "utf8")) as Stored).twin);
    } catch {
      // A half-written copy: skip it
    }
  }
  return [...items.values()].sort((a, b) => (a.updated < b.updated ? 1 : -1));
}

// ---------------------------------------------------------------- Building a twin (POST /twin, streamed)

// What the twin page polls while a build runs (GET /api/twin/build?email=). Laptop only.
export interface TwinRun {
  email: string;
  state: "running" | "done" | "failed";
  started: number;
  // Each step as it arrived (t: ms since the build started), with the ids it added
  steps: TwinLogStep[];
  // Everything the steps added so far, whole, so the page can draw it before the twin arrives
  partial: { sources: TwinSource[]; facts: TwinFact[]; readings: TwinReading[]; meetings: TwinMeeting[] };
  twin: Twin | null;
  error: string | null;
  n8n_url: string | null;
}

const runs = ((globalThis as { __dryrunTwinRuns?: Map<string, TwinRun> }).__dryrunTwinRuns ??= new Map());

export function getTwinRun(email: string): TwinRun | null {
  return runs.get(norm(email)) ?? null;
}

type StreamedStep = { step: TwinLogStep["step"]; text: string; adds?: { sources?: TwinSource[]; facts?: TwinFact[]; readings?: TwinReading[]; meetings?: TwinMeeting[] } };

function addStep(run: TwinRun, s: StreamedStep) {
  const upsert = <T extends { id: string }>(list: T[], add: T[] = []) => {
    const byId = new Map(list.map((x) => [x.id, x]));
    add.forEach((x) => byId.set(x.id, x));
    return [...byId.values()];
  };
  const a = s.adds ?? {};
  run.partial = {
    sources: upsert(run.partial.sources, a.sources),
    facts: upsert(run.partial.facts, a.facts),
    readings: upsert(run.partial.readings, a.readings),
    meetings: upsert(run.partial.meetings, a.meetings),
  };
  run.steps = [
    ...run.steps,
    {
      step: s.step,
      text: s.text,
      t: Date.now() - run.started,
      adds: { sources: (a.sources ?? []).map((x) => x.id), facts: (a.facts ?? []).map((x) => x.id), readings: (a.readings ?? []).map((x) => x.id), meetings: (a.meetings ?? []).map((x) => x.id) },
    },
  ];
}

// Starts building a twin; one build per person at a time. Each real build is one n8n execution and one model call.
export function startTwinBuild(input: { email: string; name?: string; company?: string; domain?: string }): TwinRun {
  const email = norm(input.email);
  const running = runs.get(email);
  if (running?.state === "running") return running;
  const run: TwinRun = { email, state: "running", started: Date.now(), steps: [], partial: { sources: [], facts: [], readings: [], meetings: [] }, twin: null, error: null, n8n_url: null };
  runs.set(email, run);
  if (isSampleTwin(email)) replaySample(run);
  else if (!N8N_URL) {
    run.state = "failed";
    run.error = "n8n isn't set up on this laptop (DRYRUN_N8N_URL), so only the sample twin can be built.";
  } else void streamBuild(run, { ...input, email });
  return run;
}

// The sample's build: its recorded steps at their recorded times, with no n8n call
function replaySample(run: TwinRun) {
  const twin = sampleTwin();
  const byId = <T extends { id: string }>(list: T[], ids: string[] = []) => list.filter((x) => ids.includes(x.id));
  twin.build_log.forEach((s, i) =>
    setTimeout(() => {
      addStep(run, {
        step: s.step,
        text: s.text,
        adds: { sources: byId(twin.sources, s.adds.sources), facts: byId(twin.facts, s.adds.facts), readings: byId(twin.readings, s.adds.readings), meetings: byId(twin.meetings, s.adds.meetings) },
      });
      if (i === twin.build_log.length - 1) {
        run.twin = twin;
        run.state = "done";
        void writeStored(run.email, { twin, look: { avatar: "business_male_01", color: 1 } });
      }
    }, s.t),
  );
}

async function streamBuild(run: TwinRun, body: { email: string; name?: string; company?: string; domain?: string }) {
  try {
    const res = await fetch(`${N8N_URL}/twin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok || !res.body) throw new Error(`n8n /twin failed: ${res.status}`);
    const take = (value: unknown): void => {
      const v = typeof value === "string" ? parseOrNull(value) : value;
      if (!v || typeof v !== "object") return;
      const o = v as Record<string, unknown>;
      if (o.type === "error") run.error = typeof o.content === "string" ? o.content : "n8n stopped with an error";
      else if (typeof o.type === "string" && "content" in o) take(o.content);
      else if (o.step && typeof o.step === "object") {
        if (typeof o.execution_id === "string" && typeof o.workflow_id === "string") run.n8n_url = n8nRunUrl({ execution_id: o.execution_id, workflow_id: o.workflow_id });
        addStep(run, o.step as StreamedStep);
      } else if (o.twin && typeof o.twin === "object") run.twin = o.twin as Twin;
    };
    const split = jsonObjects();
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const text of split(value)) take(parseOrNull(text));
    }
    if (!run.twin) throw new Error(run.error ?? "n8n answered without the twin");
    const before = await readStored(run.email);
    await writeStored(run.email, { twin: run.twin, look: before?.look });
    // The brief's twin buttons and the people list read again after a build
    forgetMeetingReads();
    run.state = "done";
  } catch (err) {
    run.state = "failed";
    run.error = err instanceof Error ? err.message : "n8n didn't answer";
  }
}

//---------------------------------------------------------------- The presenter's changes (POST /twin/update, one batch)

export async function updateTwin(email: string, changes: TwinChange[]): Promise<Twin | null> {
  const e = norm(email);
  const stored = await getTwin(e);
  if (!stored) throw new Error("DryRun has no twin of that address");
  if (stored.twin.sample) {
    // The sample never reaches n8n: its changes are applied here, the same way DryRun twin update applies them
    const next = applyChanges(stored.twin, changes);
    if (next) await writeStored(e, { ...stored, twin: next });
    else await rm(file(e), { force: true });
    return next ?? null;
  }
  if (!N8N_URL) throw new Error("n8n isn't set up on this laptop");
  const answer = await postToN8n<{ twin?: Twin | null; forgotten?: boolean; error?: string }>("/twin/update", { email: stored.twin.email, changes });
  forgetMeetingReads();
  if (answer.forgotten) {
    await rm(file(e), { force: true });
    return null;
  }
  if (!answer.twin) throw new Error(answer.error ?? "n8n didn't send the twin back");
  await writeStored(e, { ...stored, twin: answer.twin });
  return answer.twin;
}