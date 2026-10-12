"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AvatarId, ColorIndex, Twin, TwinChange, TwinFact, TwinFactKind, TwinLogStep, TwinMeeting, TwinReading, TwinSource } from "@/lib/contract";
import type { TwinRun } from "@/lib/twins";
import { colorOf, portraitOf } from "@/lib/personas";
import { KIND_LABEL, type MeetingHits, applyChanges, fullness, hitRate, overdue, playableSteps, plural, shortDate, sourceLabel, summarize } from "@/lib/twinView";
import { StatusIcon } from "../ui";
import { Halftone } from "./Halftone";
import { type Leaf, TwinTree, toLeaves } from "./TwinTree";
import { TwinTimeline } from "./TwinTimeline";

interface Props {
  initial: Twin;
  look: { avatar?: AvatarId; color?: ColorIndex };
  // n8n is set up on this laptop (DRYRUN_N8N_URL); without it only the sample can be built
  n8n: boolean;
  // What the meeting the presenter came from says about them, for a first build
  ask: { name: string; company: string; domain: string };
  run: TwinRun | null;
}

type Pool = Pick<Twin, "sources" | "facts" | "readings" | "meetings">;
type Play = { mode: "idle" | "replay" | "live"; steps: TwinLogStep[]; upto: number; clock0: number };
const TYPES: { id: string; label: string; types: TwinSource["type"][] }[] = [
  { id: "email", label: "Emails", types: ["email"] },
  { id: "web", label: "Web and news", types: ["web", "news"] },
  { id: "notes", label: "Your notes", types: ["manual", "meeting_note"] },
];

// The twin page (contract 0.27): the person drawn as a halftone that fills in as n8n connects facts, a tree from them to every fact
// and source, a footnoted file, and a timeline to rewind. One renderer plays three things: n8n's live build, the saved build (Replay,
// no n8n call), and the timeline (only what was known by a date). Changes are queued and sent to n8n as one batch.
export function TwinPage({ initial, look, n8n, ask, run: initialRun }: Props) {
  const [twin, setTwin] = useState(initial);
  const [queue, setQueue] = useState<TwinChange[]>([]);
  const [run, setRun] = useState<TwinRun | null>(initialRun?.state === "running" ? initialRun : null);
  const [play, setPlay] = useState<Play>({ mode: initialRun?.state === "running" ? "live" : "idle", steps: initialRun?.steps ?? [], upto: initialRun?.steps.length ?? 0, clock0: initialRun?.started ?? 0 });
  const [cutoff, setCutoff] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<Leaf | null>(null);
  const [view, setView] = useState<"tree" | "list">("tree");
  const [treeOpen, setTreeOpen] = useState(false);
  const [since, setSince] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<"note" | "alias" | "forget" | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [forgotten, setForgotten] = useState(false);
  const timers = useRef<number[]>([]);

  const shown = useMemo(() => (queue.length ? applyChanges(twin, queue) ?? twin : twin), [twin, queue]);
  const pending = useMemo(() => Object.fromEntries(queue.flatMap((c) => (c.op === "confirm" || c.op === "reject" ? [[c.source_id, c.op]] : []))) as Record<string, "confirm" | "reject">, [queue]);

  // ---------------------------------------------------------------- What's on the page right now
  const pool: Pool = useMemo(() => {
    if (play.mode !== "live" || !run) return shown;
    const merge = <T extends { id: string }>(a: T[], b: T[]) => [...new Map([...a, ...b].map((x) => [x.id, x])).values()];
    return { sources: merge(shown.sources, run.partial.sources), facts: merge(shown.facts, run.partial.facts), readings: run.partial.readings.length ? run.partial.readings : shown.readings, meetings: merge(shown.meetings, run.partial.meetings) };
  }, [play.mode, run, shown]);

  const view$ = useMemo(() => {
    const added = play.mode === "idle" ? null : new Set(play.steps.slice(0, play.upto).flatMap((s) => [...s.adds.sources, ...s.adds.facts, ...s.adds.readings, ...(s.adds.meetings ?? [])]));
    const on = (id: string) => !added || added.has(id);
    const dateOk = (d?: string) => !cutoff || !d || d.slice(0, 10) <= cutoff;
    const typeOk = (t: TwinSource["type"]) => !TYPES.some((x) => hidden.has(x.id) && x.types.includes(t));
    const sources = pool.sources.filter((s) => on(s.id) && dateOk(s.date) && (s.status !== "rejected" || pending[s.id] === "reject"));
    const visibleSources = sources.filter((s) => typeOk(s.type));
    const ids = new Set(visibleSources.filter((s) => s.status !== "rejected").map((s) => s.id));
    const facts = pool.facts.filter((f) => on(f.id) && ids.has(f.source_id) && f.status !== "rejected");
    const connected = new Set(facts.filter((f) => f.status === "connected").map((f) => f.id));
    const readings = pool.readings.filter((r) => on(r.id) && r.evidence.filter((id) => connected.has(id)).length >= 2);
    const meetings = pool.meetings.filter((m) => on(m.id) && dateOk(m.date));
    return { sources: visibleSources, facts, readings, meetings };
  }, [play, pool, cutoff, hidden, pending]);

  // Footnotes: one number per source, in the order the file cites them
  const footnote = useMemo(() => {
    const order: string[] = [];
    const cite = (id?: string) => id && !order.includes(id) && order.push(id);
    cite(shown.role?.source_id);
    view$.facts.filter((f) => f.status === "connected").forEach((f) => cite(f.source_id));
    view$.facts.forEach((f) => cite(f.source_id));
    view$.sources.forEach((s) => cite(s.id));
    return Object.fromEntries(order.map((id, i) => [id, i + 1]));
  }, [view$, shown.role]);

  const summary = summarize(shown);
  const full = fullness({ ...shown, ...view$, facts: view$.facts });
  const lastMet = summary.last_met;
  const emphasis = since && lastMet ? new Set(view$.facts.filter((f) => (shown.sources.find((s) => s.id === f.source_id)?.date ?? "") > lastMet).map((f) => f.id)) : null;
  const color = look.color != null ? colorOf(look.color) : "#0b0b0b";
  const portrait = look.avatar ? portraitOf(look.avatar) : undefined;
  const who = shown.name || shown.email;
  const first = who.split(" ")[0];
  const building = run?.state === "running";

  // ---------------------------------------------------------------- Playing a build: live from n8n, or the saved one again
  const stopTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => stopTimers, []);

  const replay = useCallback(() => {
    stopTimers();
    const steps = playableSteps(shown);
    const total = Math.max(1, steps.at(-1)?.t ?? 1);
    // About 10 s whatever the real build took, with every step given time to land
    const at = steps.map((s, i) => Math.max(i * 900, (s.t / total) * 9000));
    const built = Date.parse(shown.updated) || Date.now();
    setSelected(null);
    setCutoff(null);
    setPlay({ mode: "replay", steps, upto: 0, clock0: built - total });
    steps.forEach((_, i) => timers.current.push(window.setTimeout(() => setPlay((p) => ({ ...p, upto: i + 1 })), at[i] + 300)));
    timers.current.push(window.setTimeout(() => setPlay((p) => ({ ...p, mode: "idle" })), (at.at(-1) ?? 0) + 2500));
  }, [shown]);

  const build = async () => {
    stopTimers();
    setProblem(null);
    setCutoff(null);
    const res = await fetch("/api/twin/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: twin.email, ...ask, name: twin.name || ask.name, company: twin.company || ask.company }) });
    const r = (await res.json()) as TwinRun & { error?: string };
    if (!res.ok || r.state === "failed") {
      setProblem(r.error ?? "Couldn't start the build.");
      return;
    }
    setRun(r);
    setPlay({ mode: "live", steps: r.steps, upto: r.steps.length, clock0: r.started });
  };

  // While n8n builds: read the laptop's copy of its progress (the laptop holds the one stream from n8n)
  useEffect(() => {
    if (!building) return;
    const id = window.setInterval(async () => {
      const r = (await fetch(`/api/twin/build?email=${encodeURIComponent(twin.email)}`, { cache: "no-store" }).then((x) => x.json())) as TwinRun | null;
      if (!r) return;
      setRun(r);
      setPlay((p) => ({ ...p, steps: r.steps, upto: r.steps.length, clock0: r.started }));
      if (r.state === "done" && r.twin) {
        setTwin(r.twin);
        timers.current.push(window.setTimeout(() => setPlay((p) => ({ ...p, mode: "idle" })), 2500));
      }
      if (r.state === "failed") setProblem(r.error ?? "The build stopped.");
    }, 400);
    return () => window.clearInterval(id);
  }, [building, twin.email]);

  // ---------------------------------------------------------------- Changes, queued and sent as one batch
  const decide = (sourceId: string, op: "confirm" | "reject") =>
    setQueue((q) => {
      const had = q.find((c) => (c.op === "confirm" || c.op === "reject") && c.source_id === sourceId);
      const rest = q.filter((c) => c !== had);
      return had?.op === op ? rest : [...rest, { op, source_id: sourceId }];
    });
  const queueChange = (c: TwinChange) => setQueue((q) => [...q, c]);

  const save = async (changes = queue) => {
    if (!changes.length) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await fetch("/api/twin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: twin.email, changes }) });
      const answer = (await res.json()) as { twin?: Twin; forgotten?: boolean; error?: string };
      if (!res.ok) throw new Error(answer.error);
      if (answer.forgotten) setForgotten(true);
      else if (answer.twin) setTwin(answer.twin);
      setQueue([]);
    } catch (err) {
      setProblem(err instanceof Error && err.message ? err.message : "n8n didn't take the changes. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  };

  // Leaving with changes unsaved sends them anyway (one batch)
  const unsaved = useRef(queue);
  useEffect(() => {
    unsaved.current = queue;
  }, [queue]);
  useEffect(() => {
    const flush = () => {
      if (unsaved.current.length) navigator.sendBeacon("/api/twin", JSON.stringify({ email: twin.email, changes: unsaved.current }));
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [twin.email]);

  if (forgotten)
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-16 sm:px-8">
        <h1 className="font-display text-3xl">DryRun has forgotten {who}</h1>
        <p className="text-ink-2">Their twin and every fact in it are deleted from n8n&apos;s people table.</p>
        <Link href="/people" className="text-ink-2 underline decoration-line hover:text-ink">← Everyone DryRun knows</Link>
      </div>
    );

  const step = play.mode !== "idle" ? play.steps[play.upto - 1] : shown.build_log.at(-1);
  const stamp = step ? clockAt(play.mode === "idle" ? (Date.parse(shown.updated) || 0) - ((shown.build_log.at(-1)?.t ?? 0) - step.t) : play.clock0 + step.t) : "";
  const leaves = toLeaves(view$.facts, view$.sources);

  const tree = (
    <div className="flex flex-col gap-3">
      <TwinTree
        leaves={leaves}
        sources={view$.sources}
        readings={view$.readings}
        footnote={footnote}
        hover={hover}
        onHover={setHover}
        onSelect={setSelected}
        emphasis={emphasis}
        pending={pending}
        centre={
          <div className="flex flex-col items-center gap-1">
            <Halftone portrait={portrait} color={color} fill={full.fill} size={200} label={`${who}, drawn from ${plural(view$.facts.filter((f) => f.status === "connected").length, "connected fact")}`} />
            <span className="rounded-sm border border-ink bg-surface px-2 py-0.5 font-display text-sm whitespace-nowrap" style={{ boxShadow: `inset 0 -3px 0 ${color}` }}>
              {who}
            </span>
          </div>
        }
      />
      {/* The build, line by line, as n8n reported it */}
      <p className="min-h-6 text-sm text-ink-2 tabular-nums" aria-live="polite">
        {step ? (
          <>
            <span className="mr-3 text-muted">{stamp}</span>
            {step.text}
            {building && <span className="animate-pulse">…</span>}
          </>
        ) : (
          // A twin started from your notes after a real meeting (0.28) has facts but no build yet
          shown.meetings.length && shown.sources.some((x) => x.type === "meeting_note")
            ? "Started from your notes after a real meeting. Build it to add your emails with them."
            : "Not built yet."
        )}
        {run?.n8n_url && (
          <a href={run.n8n_url} target="_blank" rel="noreferrer" className="ml-3 underline decoration-line hover:text-ink">
            Open this run in n8n ↗
          </a>
        )}
      </p>
      {selected && (
        <LeafCard
          leaf={selected}
          n={footnote[selected.source.id]}
          sample={shown.sample}
          pending={pending[selected.source.id]}
          decide={(op) => decide(selected.source.id, op)}
          onClose={() => setSelected(null)}
          onDelete={(id) => {
            queueChange({ op: "delete", fact_id: id });
            setSelected(null);
          }}
        />
      )}
    </div>
  );

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-8 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-baseline gap-4">
          <Link href="/" className="font-display text-2xl">DryRun</Link>
          <Link href="/people" className="text-sm text-ink-2 hover:text-ink">People</Link>
          <span className="text-sm text-muted">/ {who}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Toggle on={view === "tree"} onClick={() => setView("tree")}>Tree</Toggle>
          <Toggle on={view === "list"} onClick={() => setView("list")}>List</Toggle>
          <button type="button" onClick={() => window.print()} className="rounded-full border border-line px-3 py-1 hover:border-ink">Print file</button>
        </div>
      </header>

      {shown.sample && (
        <p className="rounded-xl border border-line bg-surface px-4 py-2 text-sm text-ink-2 print:hidden">
          Sample twin: Rajiv Menon and Kaveri Freight are made up, and nothing here reaches n8n. Building it replays a recorded build on this laptop.
        </p>
      )}

      {queue.length > 0 && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink bg-surface px-4 py-2 text-sm shadow-sm print:hidden" role="status">
          <span>{plural(queue.length, "change")} to save. They go to n8n together, as one run.</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setQueue([])} className="rounded-full border border-line px-3 py-1 hover:border-ink">Undo</button>
            <button type="button" onClick={() => save()} disabled={saving} className="rounded-full bg-ink px-3 py-1 font-medium text-surface disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
            </button>
          </span>
        </div>
      )}
      {problem && (
        <p role="alert" className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm text-bad-ink">
          <StatusIcon tone="bad" className="size-4" /> {problem}
        </p>
      )}

      <div className={`grid gap-8 ${view === "tree" ? "lg:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
        {view === "tree" && (
          <section aria-label="The tree" className={treeOpen ? "fixed inset-0 z-40 overflow-auto bg-paper p-4" : "hidden lg:block print:block"}>
            {treeOpen && (
              <button type="button" onClick={() => setTreeOpen(false)} className="mb-3 rounded-full border border-line px-3 py-1 text-sm hover:border-ink">Close the tree</button>
            )}
            {tree}
          </section>
        )}

        <File
          twin={shown}
          facts={view$.facts}
          readings={view$.readings}
          sources={view$.sources}
          meetings={view$.meetings}
          footnote={footnote}
          hover={hover}
          onHover={setHover}
          pending={pending}
          decide={decide}
          onDelete={(id) => queueChange({ op: "delete", fact_id: id })}
          summary={summary}
          full={full}
          portrait={
            <div className="flex items-center gap-3 lg:hidden print:hidden">
              <Halftone portrait={portrait} color={color} fill={full.fill} size={96} label={who} />
              {view === "tree" && (
                <button type="button" onClick={() => setTreeOpen(true)} className="rounded-full border border-line px-3 py-1 text-sm hover:border-ink">Show the tree</button>
              )}
            </div>
          }
        />
      </div>

      <section className="flex flex-col gap-4 border-t border-line pt-4 print:hidden">
        <TwinTimeline sources={view$.sources} meetings={view$.meetings} predictions={shown.predictions} cutoff={cutoff} onCutoff={setCutoff} />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-2">Show:</span>
          {TYPES.map((t) => (
            <Toggle key={t.id} on={!hidden.has(t.id)} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}>
              {t.label}
            </Toggle>
          ))}
          <Toggle on={since} onClick={() => setSince((s) => !s)} disabled={!lastMet}>
            {lastMet ? `Since last time (${shortDate(lastMet)})` : "Since last time: no real meeting yet"}
          </Toggle>
        </div>
      </section>

      <footer className="flex flex-col gap-3 print:hidden">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={build} disabled={building || (!n8n && !shown.sample)} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-surface disabled:opacity-50">
            {building ? "n8n is building…" : shown.sources.length ? "Build again" : "Build twin"}
          </button>
          <button type="button" onClick={() => setPanel(panel === "note" ? null : "note")} className="rounded-full border border-line px-4 py-2 text-sm hover:border-ink">Add a note</button>
          <button type="button" onClick={() => setPanel(panel === "alias" ? null : "alias")} className="rounded-full border border-line px-4 py-2 text-sm hover:border-ink">Link another email</button>
          <button type="button" onClick={replay} disabled={building || !shown.sources.length} className="rounded-full border border-line px-4 py-2 text-sm hover:border-ink disabled:opacity-50">Replay how it was built</button>
          <button type="button" onClick={() => setPanel(panel === "forget" ? null : "forget")} className="ml-auto rounded-full px-4 py-2 text-sm text-ink-2 hover:text-bad-ink">Forget this person</button>
        </div>
        <p className="text-xs text-muted">
          {shown.sample
            ? "Building the sample costs nothing: it replays on this laptop."
            : n8n
              ? "A build is one n8n run: your emails with their address, the meetings they were invited to, then their name elsewhere (each of those only a suggestion for you to check). Replay costs nothing."
              : "n8n isn't set up on this laptop (DRYRUN_N8N_URL), so this twin can't be built here."}
        </p>
        {panel === "note" && <NoteForm first={first} onAdd={(text, kind) => { queueChange({ op: "note", text, kind }); setPanel(null); }} />}
        {panel === "alias" && <AliasForm first={first} onAdd={(email) => { queueChange({ op: "alias", email }); setPanel(null); }} />}
        {panel === "forget" && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
            <span>Delete {who}&apos;s twin and every fact in it from n8n? This can&apos;t be undone.</span>
            <button type="button" onClick={() => { setPanel(null); void save([{ op: "forget" }]); }} className="rounded-full bg-bad px-3 py-1 font-medium text-surface">Forget {first}</button>
            <button type="button" onClick={() => setPanel(null)} className="rounded-full border border-line px-3 py-1 hover:border-ink">Keep</button>
          </div>
        )}
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------- The file: typeset like a printed briefing, every fact footnoted

function File(p: {
  twin: Twin;
  facts: TwinFact[];
  readings: TwinReading[];
  sources: TwinSource[];
  meetings: TwinMeeting[];
  footnote: Record<string, number>;
  hover: string | null;
  onHover: (id: string | null) => void;
  pending: Record<string, "confirm" | "reject">;
  decide: (id: string, op: "confirm" | "reject") => void;
  onDelete: (factId: string) => void;
  summary: ReturnType<typeof summarize>;
  full: ReturnType<typeof fullness>;
  portrait: React.ReactNode;
}) {
  const { twin, facts, readings, sources, footnote, summary, full } = p;
  const connected = facts.filter((f) => f.status === "connected");
  const known = connected.filter((f) => f.kind !== "promised");
  const promised = connected.filter((f) => f.kind === "promised");
  const toCheck = sources.filter((s) => s.status === "suggested" || p.pending[s.id] === "reject");
  const cited = sources.filter((s) => footnote[s.id] && s.status !== "rejected").sort((a, b) => footnote[a.id] - footnote[b.id]);
  const factById = new Map(facts.map((f) => [f.id, f]));
  const roleSource = twin.role ? sources.find((s) => s.id === twin.role!.source_id) : undefined;
  // How well rehearsals predicted them (0.28), for the meetings on the page now (the timeline can rewind past them)
  const hits = hitRate({ ...twin, meetings: p.meetings, predictions: twin.predictions.filter((x) => p.meetings.some((m) => m.id === x.meeting_id)) });

  const Fact = ({ f }: { f: TwinFact }) => (
    <li
      className={`group flex items-start gap-2 rounded px-1 ${p.hover === f.id ? "bg-paper" : ""}`}
      onMouseEnter={() => p.onHover(f.id)}
      onMouseLeave={() => p.onHover(null)}
    >
      <span className="flex-1">
        {f.text}
        {footnote[f.source_id] && (
          <button type="button" onFocus={() => p.onHover(f.id)} onBlur={() => p.onHover(null)} className="ml-0.5 align-super text-[10px] text-ink-2 hover:text-ink" aria-label={`Source ${footnote[f.source_id]}`}>
            {footnote[f.source_id]}
          </button>
        )}
        {overdue(f) && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs text-warn-ink">
            <StatusIcon tone="warn" className="size-3.5" /> overdue
          </span>
        )}
      </span>
      <button type="button" onClick={() => p.onDelete(f.id)} className="text-xs text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-bad-ink print:hidden" aria-label={`Delete: ${f.text}`}>
        Delete
      </button>
    </li>
  );

  return (
    <article className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 print:border-0 print:p-0">
      {p.portrait}
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-4xl leading-tight">{twin.name || twin.email}</h1>
        <p className="text-ink-2">
          {[twin.role?.text, twin.company].filter(Boolean).join(", ") || "Role not stated in any source yet"}
          {roleSource && footnote[roleSource.id] && <sup className="ml-0.5 text-[10px]">{footnote[roleSource.id]}</sup>}
        </p>
        <p className="text-xs text-muted">{[twin.email, ...twin.aliases].join(", ")}</p>
      </header>

      <dl className="grid grid-cols-4 gap-2 border-y border-line py-3">
        <Num n={summary.meetings} label={summary.meetings === 1 ? "meeting" : "meetings"} />
        <Num n={summary.facts} label="facts" />
        <Num n={summary.to_check} label="to check" />
        <Num
          n={hits.meetings.length ? `${hits.predicted}/${hits.asked}` : null}
          label="predicted"
          note={hits.meetings.length > 1 ? `over ${hits.meetings.length} meetings` : hits.meetings.length ? hits.meetings[0].meeting.title : "After a real meeting"}
        />
      </dl>

      <p className="text-sm">
        <span className="font-semibold">{full.label}.</span> <span className="text-ink-2">{full.text}</span>
      </p>

      <Section title="Known">
        {known.length ? <ul className="flex flex-col gap-1.5 text-sm">{known.map((f) => <Fact key={f.id} f={f} />)}</ul> : <Empty>Nothing connected yet.</Empty>}
      </Section>

      {readings.length > 0 && (
        <Section title="n8n's reading" note="An interpretation, not a fact, each from at least two facts. Never in the brief.">
          <ul className="flex flex-col gap-1.5 text-sm">
            {readings.map((r) => (
              <li key={r.id}>
                {r.text} <span className="text-ink-2">({plural(r.evidence.length, "piece")} of evidence</span>
                {[...new Set(r.evidence.map((id) => footnote[factById.get(id)?.source_id ?? ""]).filter(Boolean))].map((n) => (
                  <sup key={n} className="ml-0.5 text-[10px] text-ink-2">{n}</sup>
                ))}
                <span className="text-ink-2">)</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="You promised">
        {promised.length ? <ul className="flex flex-col gap-1.5 text-sm">{promised.map((f) => <Fact key={f.id} f={f} />)}</ul> : <Empty>No promises found in your emails or notes.</Empty>}
      </Section>

      {hits.meetings.length > 0 && (
        <Section title="What rehearsal predicted" note="After each real meeting, n8n compares what they raised with what their practice seat asked in your last rehearsal. Only the count is kept, never the practice lines.">
          <ul className="flex flex-col gap-4 text-sm">
            {hits.meetings.map((m) => (
              <Hits key={m.meeting.id} hits={m} first={twin.name.split(" ")[0] || "they"} link={!twin.sample} footnote={footnote} />
            ))}
          </ul>
        </Section>
      )}

      {toCheck.length > 0 && (
        <Section title="To check" note="Found by name only. n8n connects them only if you say it's the same person.">
          <ul className="flex flex-col gap-3 text-sm">
            {toCheck.map((s) => {
              const would = facts.filter((f) => f.source_id === s.id);
              const rejecting = p.pending[s.id] === "reject";
              return (
                <li key={s.id} className={`flex flex-col gap-1.5 ${rejecting ? "opacity-50" : ""}`}>
                  <span className={rejecting ? "line-through" : ""}>{s.why ?? s.title}</span>
                  {would.length > 0 && <span className="text-xs text-ink-2">Would add: {would.map((f) => f.text).join("; ")}</span>}
                  <span className="flex gap-2">
                    <Choice active={p.pending[s.id] === "confirm"} onClick={() => p.decide(s.id, "confirm")}>Same person ✓</Choice>
                    <Choice active={rejecting} onClick={() => p.decide(s.id, "reject")}>Not them ✗</Choice>
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {cited.length > 0 && (
        <Section title="Sources">
          <ol className="flex flex-col gap-2 text-xs text-ink-2">
            {cited.map((s) => {
              const quotes = facts.filter((f) => f.source_id === s.id && f.quote && s.type !== "manual").slice(0, 2);
              return (
                <li key={s.id} className="flex gap-2">
                  <span className="w-4 shrink-0 text-right text-ink">{footnote[s.id]}</span>
                  <span className="flex flex-col gap-0.5">
                    <span className={s.status === "suggested" ? "text-muted" : "text-ink"}>
                      {sourceLabel(s)}
                      {s.status === "suggested" ? " (to check)" : ""}
                    </span>
                    {quotes.map((f) => <span key={f.id}>“{f.quote}”</span>)}
                    {s.type === "manual" && s.text && <span>“{s.text.length > 200 ? `${s.text.slice(0, 200)}…` : s.text}”</span>}
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="w-fit underline decoration-line hover:text-ink print:hidden">
                        {s.type === "email" ? "Open the email ↗" : "Open the page ↗"}
                      </a>
                    ) : twin.sample && s.type !== "manual" ? (
                      <span className="text-muted">Sample: no real {s.type === "email" ? "email" : "page"} behind it</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </Section>
      )}
    </article>
  );
}

// One real meeting's hit rate: what the rehearsal asked of what they raised, and what it missed
function Hits({ hits: h, first, link, footnote }: { hits: MeetingHits; first: string; link: boolean; footnote: Record<string, number> }) {
  return (
    <li className="flex flex-col gap-1.5">
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-xl leading-none tabular-nums">
          {h.predicted}/{h.asked}
        </span>
        {link ? (
          <Link href={`/m/${encodeURIComponent(h.meeting.id)}`} className="font-medium hover:underline">{h.meeting.title}</Link>
        ) : (
          <span className="font-medium">{h.meeting.title}</span>
        )}
        <span className="text-xs text-ink-2">{shortDate(h.meeting.date)}</span>
      </span>
      <span className="text-ink-2">
        Your rehearsal asked {h.predicted} of the {h.asked} {h.asked === 1 ? "thing" : "things"} {first} raised.
      </span>
      {(h.matched.length > 0 || h.missed.length > 0) && (
        <ul className="flex flex-col gap-1">
          {h.matched.map((f) => (
            <li key={f.id} className="flex gap-2">
              <span className="w-24 shrink-0 text-xs text-ink-2">✓ Predicted</span>
              <span>
                {f.text}
                {footnote[f.source_id] && <sup className="ml-0.5 text-[10px] text-ink-2">{footnote[f.source_id]}</sup>}
              </span>
            </li>
          ))}
          {h.missed.map((f) => (
            <li key={f.id} className="flex gap-2">
              <span className="w-24 shrink-0 text-xs text-ink-2">○ Not asked</span>
              <span>
                {f.text}
                {footnote[f.source_id] && <sup className="ml-0.5 text-[10px] text-ink-2">{footnote[f.source_id]}</sup>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function LeafCard(p: {
  leaf: Leaf;
  n?: number;
  sample: boolean;
  pending?: "confirm" | "reject";
  decide: (op: "confirm" | "reject") => void;
  onClose: () => void;
  onDelete: (factId: string) => void;
}) {
  const { leaf, n, sample, onClose, onDelete } = p;
  const s = leaf.source;
  return (
    <div role="dialog" aria-label={leaf.text} className="flex max-w-xl flex-col gap-2 rounded-xl border border-ink bg-surface p-4 text-sm print:hidden">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{leaf.text}</p>
        <button type="button" onClick={onClose} className="text-xs text-ink-2 hover:text-ink">Close</button>
      </div>
      {leaf.fact && leaf.fact.quote && s.type !== "manual" && <p className="text-ink-2">“{leaf.fact.quote}”</p>}
      <p className="text-xs text-ink-2">
        {n ? `${n}. ` : ""}
        {sourceLabel(s)}
        {leaf.fact ? `. ${KIND_LABEL[leaf.fact.kind]}` : ""}
        {leaf.status === "suggested" ? `. Found by name only: ${s.why ?? "it may be someone else"}.` : ""}
      </p>
      {(leaf.status === "suggested" || p.pending) && (
        <span className="flex gap-2">
          <Choice active={p.pending === "confirm"} onClick={() => p.decide("confirm")}>Same person ✓</Choice>
          <Choice active={p.pending === "reject"} onClick={() => p.decide("reject")}>Not them ✗</Choice>
        </span>
      )}
      <div className="flex gap-3 text-xs">
        {s.url ? (
          <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-line hover:text-ink">{s.type === "email" ? "Open the email ↗" : "Open the page ↗"}</a>
        ) : sample ? (
          <span className="text-muted">Sample: nothing to open</span>
        ) : null}
        {leaf.fact && (
          <button type="button" onClick={() => onDelete(leaf.fact!.id)} className="text-ink-2 hover:text-bad-ink">Delete this fact</button>
        )}
      </div>
    </div>
  );
}

function NoteForm({ first, onAdd }: { first: string; onAdd: (text: string, kind: TwinFactKind) => void }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<TwinFactKind>("context");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onAdd(text.trim(), kind);
      }}
      className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 text-sm"
    >
      <label htmlFor="twin-note" className="text-xs font-semibold text-ink-2">
        A note about {first}, their profile text pasted in, or notes from a meeting DryRun didn&apos;t see
      </label>
      <textarea id="twin-note" value={text} onChange={(e) => setText(e.target.value)} rows={3} className="rounded-lg border border-line bg-paper p-2" placeholder="e.g. Prefers the numbers on one page" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-ink-2">
          It&apos;s about
          <select value={kind} onChange={(e) => setKind(e.target.value as TwinFactKind)} className="rounded-lg border border-line bg-paper px-2 py-1">
            <option value="context">who they are</option>
            <option value="preference">what they care about</option>
            <option value="raised">something they raised</option>
            <option value="promised">something you promised</option>
          </select>
        </label>
        <span className="text-xs text-muted">{text.length >= 300 ? "Long text is kept as a source; n8n reads it for facts on the next build." : "Kept as you wrote it, marked “you added this”."}</span>
        <button type="submit" className="ml-auto rounded-full bg-ink px-3 py-1 font-medium text-surface">Add</button>
      </div>
    </form>
  );
}

function AliasForm({ first, onAdd }: { first: string; onAdd: (email: string) => void }) {
  const [email, setEmail] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (email.includes("@")) onAdd(email.trim());
      }}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-4 text-sm"
    >
      <label htmlFor="twin-alias" className="text-xs font-semibold text-ink-2">Another address of {first}&apos;s</label>
      <input id="twin-alias" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-64 flex-1 rounded-lg border border-line bg-paper px-2 py-1" placeholder="name@company.com" />
      <button type="submit" className="rounded-full bg-ink px-3 py-1 font-medium text-surface">Link</button>
      <span className="w-full text-xs text-muted">Emails with it count as {first} for sure from then on; the next build reads them.</span>
    </form>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {note && <p className="-mt-1 text-xs text-muted">{note}</p>}
      {children}
    </section>
  );
}

function Num({ n, label, note }: { n: number | string | null; label: string; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dd className="font-display text-3xl leading-none tabular-nums">{n ?? "–"}</dd>
      <dt className="mt-1 text-xs text-ink-2">{label}</dt>
      {note && <span className="truncate text-[10px] text-muted">{note}</span>}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted">{children}</p>;

function Toggle({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on} className={`rounded-full border px-3 py-1 text-sm disabled:opacity-50 ${on ? "border-ink bg-ink text-surface" : "border-line hover:border-ink"}`}>
      {children}
    </button>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-full border px-3 py-0.5 text-xs ${active ? "border-ink bg-ink text-surface" : "border-line hover:border-ink"}`}>
      {children}
    </button>
  );
}

const clockAt = (ms: number) => (ms ? new Date(ms).toLocaleTimeString("en-GB", { hour12: false }) : "");
