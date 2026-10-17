import type { PrepStep } from "./contract";

// What n8n's rehearsal prep is doing right now, for the practice page (GET /api/prep/progress). Laptop only, not in the room.
// n8n streams a chunk after each stage (contract 0.24, POST /prep); without them the run shows one step until the bundle arrives.
export interface PrepRun {
  id: string;
  started_at: number;
  state: "running" | "done" | "failed";
  steps: PrepStep[];
  error: string | null;
  // The run in n8n's editor, once n8n says which execution it is
  n8n_url: string | null;
}

// One of n8n's progress chunks: which stage it finished, in its own words
export interface N8nProgress {
  id: "gather" | "fallback" | "plan" | "voices";
  detail: string;
}

// On globalThis so dev-mode reloads keep one store, as the room does
const g = globalThis as { __dryrunPrep?: PrepRun | null };

export function getPrepRun(id: string): PrepRun | null {
  return g.__dryrunPrep?.id === id ? g.__dryrunPrep : null;
}

function set(run: PrepRun) {
  g.__dryrunPrep = run;
}

function current(id: string | undefined): PrepRun | null {
  return id && g.__dryrunPrep?.id === id ? g.__dryrunPrep : null;
}

function patchStep(run: PrepRun, id: string, patch: Partial<PrepStep>): PrepStep[] {
  return run.steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

// The laptop has read the deck and is sending everything to n8n
export function prepStarted(id: string | undefined, deckSlides: number | null, panel: number, minutes: number | null) {
  if (!id) return;
  const steps: PrepStep[] = [];
  if (deckSlides != null) steps.push({ id: "deck", label: "Read your deck", state: "done", detail: `The text of ${deckSlides} slide${deckSlides === 1 ? "" : "s"}, for n8n` });
  steps.push({
    id: "n8n",
    label: "n8n is planning the rehearsal",
    state: "running",
    detail: `For ${panel} ${panel === 1 ? "person" : "people"} and ${minutes ? `a ${minutes} min pitch` : "no time limit"}. Usually about 30 seconds.`,
  });
  set({ id, started_at: Date.now(), state: "running", steps, error: null, n8n_url: null });
}

// n8n finished a stage. The first chunk swaps the one "n8n is planning" step for n8n's own stages.
export function prepProgress(id: string | undefined, p: N8nProgress, n8nUrl: string | null) {
  const run = current(id);
  if (!run) return;
  let steps = run.steps;
  if (steps.some((s) => s.id === "n8n")) {
    steps = steps.filter((s) => s.id !== "n8n").concat([
      { id: "gather", label: "Gathered what it knows about the meeting", state: "running" },
      { id: "plan", label: "Plan the slides, the panel's questions and who chairs", state: "pending" },
      { id: "voices", label: "Voice the panel's lines with Sarvam", state: "pending" },
      { id: "save", label: "Save the voices and seat the panel", state: "pending" },
    ]);
  }
  const next = { ...run, steps, n8n_url: run.n8n_url ?? n8nUrl };
  if (p.id === "gather") {
    next.steps = patchStep(next, "gather", { state: "done", detail: p.detail });
    next.steps = patchStep(next, "plan", { state: "running", label: "Planning the slides, the panel's questions and who chairs, with Gemini" });
  } else if (p.id === "fallback") {
    const at = next.steps.findIndex((s) => s.id === "plan");
    next.steps = [...next.steps.slice(0, at), { id: "fallback", label: "Switched to Groq", state: "done", detail: p.detail }, ...next.steps.slice(at)];
    next.steps = patchStep(next, "plan", { label: "Planning the slides, the panel's questions and who chairs, with Groq" });
  } else if (p.id === "plan") {
    next.steps = patchStep(next, "plan", { state: "done", label: "Planned the slides, the panel's questions and who chairs", detail: p.detail });
    next.steps = patchStep(next, "voices", { state: "running", label: "Voicing the panel's lines with Sarvam" });
  } else if (p.id === "voices") {
    next.steps = patchStep(next, "voices", { state: "done", label: "Voiced the panel's lines with Sarvam", detail: p.detail });
    next.steps = patchStep(next, "save", { state: "running", label: "Saving the voices and seating the panel" });
  }
  set(next);
}

// The bundle is in the room. Without n8n's chunks, `fallback` (what the bundle shows n8n did) replaces the one n8n step.
export function prepDone(id: string | undefined, fallback: PrepStep[]) {
  const run = current(id);
  if (!run) return;
  const streamed = !run.steps.some((s) => s.id === "n8n");
  const steps = streamed
    ? run.steps.map((s) => (s.state === "done" ? s : { ...s, state: "done" as const, label: s.id === "save" ? "Saved the voices and seated the panel" : s.label }))
    : run.steps.filter((s) => s.id !== "n8n").concat(fallback);
  set({ ...run, state: "done", steps });
}

// Nothing changed since n8n last prepared this rehearsal (prepCache.ts): the laptop reused it, with no n8n call. `steps` are what n8n did then.
export function prepReused(id: string | undefined, at: string, steps: PrepStep[]) {
  if (!id) return;
  const when = new Date(at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  const reused: PrepStep = {
    id: "reused",
    label: "Reused the rehearsal n8n prepared earlier",
    state: "done",
    detail: `Same panel, deck, pitch length and goal as on ${when}, and nothing debriefed since, so n8n wasn't asked again`,
  };
  set({ id, started_at: Date.now(), state: "done", steps: [reused, ...steps], error: null, n8n_url: null });
}

export function prepFailed(id: string | undefined, error: string) {
  const run = current(id);
  if (!run) return;
  set({ ...run, state: "failed", error, steps: run.steps.map((s) => (s.state === "running" ? { ...s, state: "error" as const } : s)) });
}
