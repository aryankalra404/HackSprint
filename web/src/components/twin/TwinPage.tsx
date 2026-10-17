"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AvatarId, ColorIndex, Twin, TwinChange, TwinFact, TwinFactKind, TwinLogStep, TwinReading, TwinSource } from "@/lib/contract";
import type { TwinRun } from "@/lib/twins";
import { colorOf, portraitOf } from "@/lib/personas";
import { type MeetingHits, applyChanges, fullness, hitRate, overdue, playableSteps, plural, shortDate, sourceLabel, summarize } from "@/lib/twinView";
import { StatusIcon, btn } from "../ui";
import { ReadingPage } from "../shell";
import { Halftone } from "./Halftone";

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

// The facts, grouped the way you'd prepare for the person: what moves them, what they've asked, what you owe them, who they are
const GROUPS: { id: string; title: (first: string) => string; note: string; kinds: TwinFactKind[] }[] = [
  { id: "cares", title: () => "What they care about", note: "Lead with these.", kinds: ["preference"] },
  { id: "raised", title: () => "What they've raised", note: "Questions and decisions, from your emails and meetings.", kinds: ["raised", "decision"] },
  { id: "promised", title: (first) => `What you owe ${first}`, note: "Promises from your emails and notes. Overdue ones are flagged.", kinds: ["promised"] },
  { id: "who", title: () => "Who they are", note: "Role and context.", kinds: ["role", "context"] },
];

const LIST_MAX = 5;

// One person's twin (contract 0.27), laid out as a dossier: who they are and how well DryRun knows them, how to handle them (every fact
// with its source and quote), how well rehearsal predicted them, and how n8n built it. One renderer plays n8n's live build and the
// saved build (Replay, no n8n call): facts land as each step adds them. Changes are queued and sent to n8n as one batch.
export function TwinPage({ initial, look, n8n, ask, run: initialRun }: Props) {
  const [twin, setTwin] = useState(initial);
  const [queue, setQueue] = useState<TwinChange[]>([]);
  const [run, setRun] = useState<TwinRun | null>(initialRun?.state === "running" ? initialRun : null);
  const [play, setPlay] = useState<Play>({ mode: initialRun?.state === "running" ? "live" : "idle", steps: initialRun?.steps ?? [], upto: initialRun?.steps.length ?? 0, clock0: initialRun?.started ?? 0 });
  const [panel, setPanel] = useState<"note" | "alias" | "forget" | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [forgotten, setForgotten] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const timers = useRef<number[]>([]);

  const shown = useMemo(() => (queue.length ? applyChanges(twin, queue) ?? twin : twin), [twin, queue]);
  const pending = useMemo(() => Object.fromEntries(queue.flatMap((c) => (c.op === "confirm" || c.op === "reject" ? [[c.source_id, c.op]] : []))) as Record<string, "confirm" | "reject">, [queue]);

  // ---------------------------------------------------------------- What's on the page right now
  const pool: Pool = useMemo(() => {
    if (play.mode !== "live" || !run) return shown;
    const merge = <T extends { id: string }>(a: T[], b: T[]) => [...new Map([...a, ...b].map((x) => [x.id, x])).values()];
    return { sources: merge(shown.sources, run.partial.sources), facts: merge(shown.facts, run.partial.facts), readings: run.partial.readings.length ? run.partial.readings : shown.readings, meetings: merge(shown.meetings, run.partial.meetings) };
  }, [play.mode, run, shown]);

  // While a build plays, only what its steps have added so far
  const view = useMemo(() => {
    const added = play.mode === "idle" ? null : new Set(play.steps.slice(0, play.upto).flatMap((s) => [...s.adds.sources, ...s.adds.facts, ...s.adds.readings, ...(s.adds.meetings ?? [])]));
    const on = (id: string) => !added || added.has(id);
    const sources = pool.sources.filter((s) => on(s.id) && (s.status !== "rejected" || pending[s.id] === "reject"));
    const ids = new Set(sources.filter((s) => s.status !== "rejected").map((s) => s.id));
    const facts = pool.facts.filter((f) => on(f.id) && ids.has(f.source_id) && f.status !== "rejected");
    const connected = new Set(facts.filter((f) => f.status === "connected").map((f) => f.id));
    const readings = pool.readings.filter((r) => on(r.id) && r.evidence.filter((id) => connected.has(id)).length >= 2);
    const meetings = pool.meetings.filter((m) => on(m.id));
    return { sources, facts, readings, meetings };
  }, [play, pool, pending]);

  const summary = summarize(shown);
  const full = fullness({ ...shown, ...view });
  const color = look.color != null ? colorOf(look.color) : "#0b0b0b";
  const portrait = look.avatar ? portraitOf(look.avatar) : undefined;
  const who = shown.name || shown.email;
  const first = who.split(" ")[0];
  const building = run?.state === "running";
  // n8n has never saved this person: there's nothing to update yet, so queued notes go with the first build (0.37)
  const unbuilt = !twin.updated && !twin.sample;
  const queuedNotes = queue.flatMap((c) => (c.op === "note" ? [{ text: c.text, kind: c.kind }] : []));
  const animating = play.mode !== "idle";
  const sourceOf = useMemo(() => new Map(view.sources.map((s) => [s.id, s])), [view.sources]);
  const connected = view.facts.filter((f) => f.status === "connected");
  const toCheck = view.sources.filter((s) => s.status === "suggested" || pending[s.id] === "reject");
  // New since you last met them: from a source dated after the last real meeting
  const lastMet = summary.last_met;
  const isNew = (f: TwinFact) => !!lastMet && (sourceOf.get(f.source_id)?.date ?? "") > lastMet;
  const hits = hitRate({ ...shown, meetings: view.meetings, predictions: shown.predictions.filter((x) => view.meetings.some((m) => m.id === x.meeting_id)) });

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
    setPlay({ mode: "replay", steps, upto: 0, clock0: built - total });
    steps.forEach((_, i) => timers.current.push(window.setTimeout(() => setPlay((p) => ({ ...p, upto: i + 1 })), at[i] + 300)));
    timers.current.push(window.setTimeout(() => setPlay((p) => ({ ...p, mode: "idle" })), (at.at(-1) ?? 0) + 2500));
  }, [shown]);

  const build = async () => {
    stopTimers();
    setProblem(null);
    const notes = unbuilt ? queuedNotes : [];
    const res = await fetch("/api/twin/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: twin.email, ...ask, name: twin.name || ask.name, company: twin.company || ask.company, notes }) });
    const r = (await res.json()) as TwinRun & { error?: string };
    if (!res.ok || r.state === "failed") {
      setProblem(r.error ?? "Couldn't start the build.");
      return;
    }
    // Those notes are in n8n's build now; anything else queued is saved as usual once the twin exists
    if (notes.length) setQueue((q) => q.filter((c) => c.op !== "note"));
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
    unsaved.current = unbuilt ? [] : queue;
  }, [queue, unbuilt]);
  useEffect(() => {
    const flush = () => {
      if (unsaved.current.length) navigator.sendBeacon("/api/twin", JSON.stringify({ email: twin.email, changes: unsaved.current }));
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [twin.email]);

  if (forgotten)
    return (
      <ReadingPage active="people">
        <div className="flex flex-col items-start gap-4">
          <h1 className="font-display text-3xl">DryRun has forgotten {who}</h1>
          <p className="text-ink-2">Their twin and every fact in it are deleted from n8n&apos;s people table.</p>
          <Link href="/people" className={btn("secondary")}>Everyone DryRun knows</Link>
        </div>
      </ReadingPage>
    );

  // The build log: the steps played so far, or the last build's
  const steps = animating ? play.steps.slice(0, play.upto) : shown.build_log;
  const lastT = shown.build_log.at(-1)?.t ?? 0;
  const stampOf = (s: TwinLogStep) => clockAt(animating ? play.clock0 + s.t : (Date.parse(shown.updated) || 0) - (lastT - s.t));
  const notBuilt = shown.sources.length === 0 && !animating;

  return (
    <ReadingPage active="people">
      {/* ------------------------------------------------ Who they are, and how well DryRun knows them */}
      <header className="flex flex-col gap-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
          <div className="shrink-0 print:hidden">
            <Halftone portrait={portrait} color={color} fill={full.fill} size={152} label={`${who}, drawn from ${plural(connected.length, "connected fact")}`} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
              <Link href="/people" className="underline-offset-4 hover:text-ink hover:underline">People</Link>
              <span aria-hidden="true" className="text-axis">/</span>
              <span>Twin</span>
              {shown.sample && <span className="ml-1 rounded-full border border-line px-2 py-0.5 text-xs">Sample</span>}
            </p>
            <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">{who}</h1>
            <p className="text-lg text-ink-2">{[shown.role?.text, shown.company].filter(Boolean).join(", ") || "Role not stated in any source yet"}</p>
            <p className="text-xs text-muted">{[shown.email, ...shown.aliases].join(", ")}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button type="button" onClick={build} disabled={building || (!n8n && !shown.sample)} className={btn("primary")}>
            {building ? "n8n is building…" : shown.sources.length && !unbuilt ? "Build again" : `Build ${first}'s twin`}
          </button>
          <button type="button" onClick={replay} disabled={building || animating || unbuilt || !shown.sources.length} className={btn("secondary")}>
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3" fill="currentColor"><path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z" /></svg>
            Replay how n8n built it
          </button>
          <button type="button" onClick={() => setPanel(panel === "note" ? null : "note")} aria-expanded={panel === "note"} className={btn("secondary")}>Add a note</button>
          <span className="text-xs text-muted sm:ml-2">
            {shown.sample ? "The sample never reaches n8n: building it replays a recorded build." : n8n ? "A build is one n8n run. Replay costs nothing." : "n8n isn't set up on this laptop, so this twin can't be built here."}
          </span>
        </div>
        {panel === "note" && <NoteForm first={first} unbuilt={unbuilt} onAdd={(text, kind) => { queueChange({ op: "note", text, kind }); setPanel(null); }} onCancel={() => setPanel(null)} />}

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
          <Stat label="How well DryRun knows them" value={full.label} note={full.text} />
          <Stat label="Real meetings" value={summary.meetings} note={lastMet ? `Last met ${shortDate(lastMet)}` : "Not met yet"} />
          <Stat label="Facts" value={connected.length} note={`From ${plural(view.sources.filter((s) => s.status === "connected").length, "source")}, each quoted`} />
          <Stat
            label="Rehearsal predicted"
            value={hits.meetings.length ? `${hits.predicted}/${hits.asked}` : "–"}
            note={hits.meetings.length ? `of what ${first} raised in real meetings` : "Scored after your first real meeting"}
          />
        </dl>
      </header>

      {queue.length > 0 && (
        <div className="sticky top-3 z-30 -my-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink bg-surface px-4 py-3 text-sm shadow-lg shadow-ink/5 print:hidden" role="status">
          <span>
            {unbuilt && queuedNotes.length
              ? `${plural(queuedNotes.length, "note")} for ${first}'s first build. n8n reads them with your emails in the same run.`
              : `${plural(queue.length, "change")} to save. They go to n8n together, as one run.`}
          </span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setQueue([])} className={btn("quiet", "sm")}>Undo</button>
            {unbuilt && queuedNotes.length ? (
              <button type="button" onClick={build} disabled={building || !n8n} className={btn("primary", "sm")}>
                {building ? "n8n is building…" : "Build with these notes"}
              </button>
            ) : (
              <button type="button" onClick={() => save()} disabled={saving} className={btn("primary", "sm")}>
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </span>
        </div>
      )}
      {problem && (
        <p role="alert" className="-my-6 flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-bad-ink">
          <StatusIcon tone="bad" className="size-4" /> {problem}
        </p>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ------------------------------------------------ How to handle them */}
        <div className="flex min-w-0 flex-col gap-8">
          {notBuilt ? (
            <section className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-axis p-6 sm:p-8">
              <h2 className="font-display text-xl">No twin of {first} yet</h2>
              <p className="max-w-xl text-sm text-ink-2">
                n8n reads your emails with {shown.email}, the meetings they were invited to, then looks for their name on the web. What it finds by
                name only waits for you to confirm. Every fact keeps the quote it came from, and none of it comes from a rehearsal.
              </p>
            </section>
          ) : (
            <>
              <h2 className="sr-only">What DryRun knows about {first}</h2>
              {animating && steps.length > 0 && (
                <p className="flex items-center gap-3 rounded-2xl border border-ink bg-surface px-4 py-3 text-sm" role="status">
                  <span aria-hidden="true" className="size-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-ink" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{play.mode === "live" ? "n8n is building" : "Replaying the build"}: </span>
                    {steps.at(-1)!.text}
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">Step {steps.length}{play.mode === "replay" ? ` of ${play.steps.length}` : ""}</span>
                </p>
              )}
              {GROUPS.map((g) => {
                // Newest first; a long group shows its five newest until opened (a build shows everything as it lands)
                const facts = connected.filter((f) => g.kinds.includes(f.kind)).sort((a, b) => ((sourceOf.get(a.source_id)?.date ?? "") < (sourceOf.get(b.source_id)?.date ?? "") ? 1 : -1));
                if (!facts.length && g.id === "who" && !animating) return null;
                const all = animating || expanded.has(g.id) || facts.length <= LIST_MAX + 1;
                return (
                  <section key={g.id} className="flex flex-col gap-3" aria-labelledby={`g-${g.id}`}>
                    <div className="flex flex-col gap-0.5">
                      <h3 id={`g-${g.id}`} className="flex items-baseline gap-2 font-display text-lg">
                        {g.title(first)}
                        <span className="font-sans text-sm font-normal text-muted">{facts.length}</span>
                      </h3>
                      <p className="text-sm text-ink-2">{g.note}</p>
                    </div>
                    {facts.length ? (
                      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                        {(all ? facts : facts.slice(0, LIST_MAX)).map((f) => (
                          <FactRow key={f.id} fact={f} source={sourceOf.get(f.source_id)} fresh={isNew(f)} animate={animating} sample={shown.sample} onDelete={() => queueChange({ op: "delete", fact_id: f.id })} />
                        ))}
                        {!all && (
                          <li>
                            <button type="button" onClick={() => setExpanded((e) => new Set(e).add(g.id))} className="w-full px-4 py-3 text-left text-sm text-ink-2 hover:bg-paper/60 hover:text-ink sm:px-5">
                              Show {facts.length - LIST_MAX} more
                            </button>
                          </li>
                        )}
                      </ul>
                    ) : (
                      <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">{animating ? "Nothing found for this yet…" : "Nothing yet."}</p>
                    )}
                  </section>
                );
              })}
              {view.readings.length > 0 && <Readings readings={view.readings} facts={view.facts} sourceOf={sourceOf} animate={animating} />}
            </>
          )}
        </div>

        {/* ------------------------------------------------ Is it right, what to check, where it came from */}
        <aside className="flex flex-col gap-6">
          <Predicted hits={hits.meetings} first={first} link={!shown.sample} />

          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5" aria-labelledby="built" aria-live="polite">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="built" className="font-display text-base">How n8n built it</h2>
              {animating && <span className="inline-flex items-center gap-1.5 text-xs text-ink-2"><span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-warn" />{play.mode === "live" ? "Live" : "Replaying"}</span>}
            </div>
            {steps.length ? (
              <ol className="flex flex-col">
                {steps.map((s, i) => {
                  const current = animating && i === steps.length - 1;
                  return (
                    <li key={`${s.step}-${i}`} className={`relative flex gap-3 pb-3 last:pb-0 ${animating ? "tw-fade" : ""}`}>
                      {i < steps.length - 1 && <span aria-hidden="true" className="absolute top-4 bottom-0 left-[5px] w-px bg-line" />}
                      <span aria-hidden="true" className={`mt-1.5 size-[11px] shrink-0 rounded-full ${current ? "border-2 border-ink bg-surface" : "bg-ink"}`} />
                      <span className="flex min-w-0 flex-col text-sm">
                        <span className={current ? "font-medium" : ""}>
                          {s.text}
                          {current && building && <span className="animate-pulse">…</span>}
                        </span>
                        <span className="text-xs text-muted tabular-nums">{stampOf(s)}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-sm text-muted">
                {shown.meetings.length && shown.sources.some((x) => x.type === "meeting_note") ? "Started from your notes after a real meeting. Build it to add your emails with them." : "Not built yet."}
              </p>
            )}
            {run?.n8n_url && (
              <a href={run.n8n_url} target="_blank" rel="noreferrer" className="text-sm text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">
                Open this run in n8n ↗
              </a>
            )}
          </section>

          {toCheck.length > 0 && (
            <section className="flex flex-col gap-3 rounded-2xl border border-warn/60 bg-surface p-5" aria-labelledby="to-check">
              <div className="flex flex-col gap-1">
                <h2 id="to-check" className="flex items-center gap-2 font-display text-base">
                  <span className="flex size-5 items-center justify-center rounded-full bg-warn/20 text-warn-ink"><StatusIcon tone="warn" className="size-3.5" /></span>
                  {plural(toCheck.length, "source")} to check
                </h2>
                <p className="text-xs text-ink-2">Found by name only. n8n adds them only if you say it&apos;s the same person.</p>
              </div>
              <ul className="flex flex-col divide-y divide-line">
                {toCheck.map((s) => {
                  const would = view.facts.filter((f) => f.source_id === s.id);
                  const rejecting = pending[s.id] === "reject";
                  return (
                    <li key={s.id} className={`flex flex-col gap-2 py-3 first:pt-0 last:pb-0 ${rejecting ? "opacity-50" : ""}`}>
                      <span className={`text-sm ${rejecting ? "line-through" : ""}`}>{s.why ?? s.title}</span>
                      {would.length > 0 && <span className="text-xs text-ink-2">Would add: {would.map((f) => f.text).join("; ")}</span>}
                      <span className="flex gap-2">
                        <Choice active={pending[s.id] === "confirm"} onClick={() => decide(s.id, "confirm")}>Same person</Choice>
                        <Choice active={rejecting} onClick={() => decide(s.id, "reject")}>Not them</Choice>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <Sources sources={view.sources.filter((s) => s.status === "connected")} sample={shown.sample} />

          <div className="flex flex-wrap gap-1 print:hidden">
            <button type="button" onClick={() => setPanel(panel === "alias" ? null : "alias")} aria-expanded={panel === "alias"} className={btn("quiet", "sm")}>Link another email</button>
            <button type="button" onClick={() => window.print()} className={btn("quiet", "sm")}>Print the file</button>
            <button type="button" onClick={() => setPanel(panel === "forget" ? null : "forget")} aria-expanded={panel === "forget"} className={`${btn("quiet", "sm")} hover:text-bad-ink`}>Forget {first}</button>
          </div>
          {panel === "alias" && <AliasForm first={first} onAdd={(email) => { queueChange({ op: "alias", email }); setPanel(null); }} />}
          {panel === "forget" && (
            <div className="flex flex-col gap-3 rounded-2xl border border-bad/40 bg-surface p-4 text-sm">
              <span>Delete {who}&apos;s twin and every fact in it from n8n? This can&apos;t be undone.</span>
              <span className="flex gap-2">
                <button type="button" onClick={() => { setPanel(null); void save([{ op: "forget" }]); }} className={`${btn("primary", "sm")} bg-bad hover:bg-bad/85`}>Forget {first}</button>
                <button type="button" onClick={() => setPanel(null)} className={btn("secondary", "sm")}>Keep</button>
              </span>
            </div>
          )}
        </aside>
      </div>
    </ReadingPage>
  );
}

// ---------------------------------------------------------------- Pieces

// "Email, 3 Oct", "Your note, 22 Sept", "kaverifreight.in"
function sourceShort(s: TwinSource): string {
  const d = shortDate(s.date);
  const kind =
    s.type === "email" ? (s.from === "you" ? "Your email" : "Email") : s.type === "meeting_note" ? "Meeting notes" : s.type === "manual" ? "Your note" : s.type === "news" ? "News" : s.title.replace(/^www\./, "").split("/")[0];
  return d && s.type !== "web" ? `${kind}, ${d}` : kind;
}

// One fact: the claim, where it came from; open it for the quote and the source
function FactRow({ fact: f, source: s, fresh, animate, sample, onDelete }: { fact: TwinFact; source?: TwinSource; fresh: boolean; animate: boolean; sample: boolean; onDelete: () => void }) {
  const late = overdue(f);
  return (
    <li className={animate ? "tw-fade" : ""}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 hover:bg-paper/60 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
            <span>{f.text}</span>
            {late && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn-ink">
                <StatusIcon tone="warn" /> Overdue
              </span>
            )}
            {fresh && (
              <span className="inline-flex items-center gap-1 text-xs text-ink-2">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-ink" />
                New since you met
              </span>
            )}
          </span>
          {s && <span className="mt-0.5 shrink-0 text-xs whitespace-nowrap text-muted group-open:text-ink">{sourceShort(s)}</span>}
          <svg viewBox="0 0 16 16" aria-hidden="true" className="mt-1 size-3.5 shrink-0 text-muted transition-transform group-open:rotate-90 print:hidden" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3.5L10.5 8 6 12.5" />
          </svg>
        </summary>
        <div className="flex flex-col gap-2 border-t border-dashed border-line bg-paper/40 px-4 py-3 text-sm sm:px-5">
          {f.quote && s?.type !== "manual" && <blockquote className="border-l-2 border-ink pl-3 text-ink-2">“{f.quote}”</blockquote>}
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
            {s && <span>{sourceLabel(s)}</span>}
            {s?.url ? (
              <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-4 hover:text-ink">
                {s.type === "email" ? "Open the email ↗" : "Open the page ↗"}
              </a>
            ) : sample && s?.type !== "manual" ? (
              <span className="text-muted">Sample: nothing to open</span>
            ) : null}
            <button type="button" onClick={onDelete} className="ml-auto hover:text-bad-ink print:hidden">Delete this fact</button>
          </span>
        </div>
      </details>
    </li>
  );
}

// n8n's reading: an interpretation, never a fact, and never in the brief. Each opens to the facts behind it.
function Readings({ readings, facts, sourceOf, animate }: { readings: TwinReading[]; facts: TwinFact[]; sourceOf: Map<string, TwinSource>; animate: boolean }) {
  const byId = new Map(facts.map((f) => [f.id, f]));
  return (
    <section className="flex flex-col gap-3" aria-labelledby="reading">
      <div>
        <h3 id="reading" className="font-display text-lg">n8n&apos;s reading</h3>
      </div>
      <p className="-mt-2 text-sm text-ink-2">An interpretation from two or more facts, never a fact itself, and never in the brief.</p>
      <ul className="flex flex-col gap-2">
        {readings.map((r) => {
          const evidence = r.evidence.map((id) => byId.get(id)).filter((f): f is TwinFact => !!f);
          return (
            <li key={r.id} className={`rounded-2xl border border-dashed border-axis bg-paper/40 ${animate ? "tw-fade" : ""}`}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className="flex-1 italic">{r.text}</span>
                  <span className="shrink-0 text-xs text-muted group-open:text-ink">From {plural(evidence.length, "fact")}</span>
                </summary>
                <ul className="flex flex-col gap-1 px-4 pb-3 text-sm text-ink-2 sm:px-5">
                  {evidence.map((f) => {
                    const s = sourceOf.get(f.source_id);
                    return (
                      <li key={f.id} className="flex gap-2">
                        <span aria-hidden="true" className="text-axis">–</span>
                        <span>
                          {f.text}
                          {s && <span className="text-xs text-muted"> ({sourceShort(s)})</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Rehearsal against reality (0.28): per real meeting, how much of what they raised the last rehearsal before it had asked
function Predicted({ hits, first, link }: { hits: MeetingHits[]; first: string; link: boolean }) {
  if (!hits.length)
    return (
      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-base">Rehearsal against reality</h2>
        <p className="text-sm text-ink-2">
          After your first real meeting with {first}, tell DryRun how it went. n8n then checks how much of what {first} raised your rehearsal had already asked.
        </p>
      </section>
    );
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-ink bg-surface p-5" aria-labelledby="predicted">
      <h2 id="predicted" className="font-display text-base">Rehearsal against reality</h2>
      {hits.map((h) => (
        <div key={h.meeting.id} className="flex flex-col gap-3">
          <div className="flex items-end gap-3">
            <span className="font-display text-5xl leading-none tabular-nums">
              {h.predicted}<span className="text-2xl text-muted">/{h.asked}</span>
            </span>
            <span className="flex min-w-0 flex-col pb-0.5 text-sm">
              {link ? (
                <Link href={`/m/${encodeURIComponent(h.meeting.id)}`} className="truncate font-medium hover:underline">{h.meeting.title}</Link>
              ) : (
                <span className="truncate font-medium">{h.meeting.title}</span>
              )}
              <span className="text-xs text-ink-2">{shortDate(h.meeting.date)}</span>
            </span>
          </div>
          <p className="text-sm text-ink-2">
            Your rehearsal asked {h.predicted} of the {h.asked} {h.asked === 1 ? "thing" : "things"} {first} raised.
          </p>
          {(h.matched.length > 0 || h.missed.length > 0) && (
            <ul className="flex flex-col gap-2 text-sm">
              {h.matched.map((f) => (
                <li key={f.id} className="flex gap-2">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-good/15 text-good-ink" title="Predicted"><StatusIcon tone="good" className="size-3" /></span>
                  <span><span className="sr-only">Predicted: </span>{f.text}</span>
                </li>
              ))}
              {h.missed.map((f) => (
                <li key={f.id} className="flex gap-2 text-ink-2">
                  <span className="mt-0.5 size-4 shrink-0 rounded-full border-[1.5px] border-dashed border-muted" title="Not asked" />
                  <span><span className="sr-only">Not asked: </span>{f.text} <span className="text-xs text-muted">(not asked)</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <p className="border-t border-line pt-3 text-xs text-muted">n8n keeps only the count and the matches, never the practice lines.</p>
    </section>
  );
}

function Sources({ sources, sample }: { sources: TwinSource[]; sample: boolean }) {
  if (!sources.length) return null;
  const sorted = [...sources].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5" aria-labelledby="sources">
      <h2 id="sources" className="font-display text-base">Sources <span className="font-sans text-sm font-normal text-muted">{sources.length}</span></h2>
      <ul className="flex flex-col gap-2 text-sm">
        {sorted.map((s) => (
          <li key={s.id} className="flex flex-col">
            {s.url ? (
              <a href={s.url} target="_blank" rel="noreferrer" className="truncate hover:underline">{s.type === "manual" || s.type === "meeting_note" ? sourceShort(s) : s.title}</a>
            ) : (
              <span className="truncate">{s.type === "manual" || s.type === "meeting_note" ? sourceShort(s) : s.title}</span>
            )}
            <span className="text-xs text-muted">{s.type === "manual" || s.type === "meeting_note" ? s.why : sourceShort(s)}</span>
          </li>
        ))}
      </ul>
      {sample && <p className="text-xs text-muted">Sample: no real emails or pages behind these.</p>}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-surface p-4 sm:p-5">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="font-display text-3xl leading-tight tabular-nums">{value}</dd>
      <dd className="text-xs text-muted">{note}</dd>
    </div>
  );
}

function NoteForm({ first, unbuilt, onAdd, onCancel }: { first: string; unbuilt: boolean; onAdd: (text: string, kind: TwinFactKind) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<TwinFactKind>("context");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onAdd(text.trim(), kind);
      }}
      className="flex flex-col gap-3 rounded-2xl border border-ink bg-surface p-5 text-sm"
    >
      <label htmlFor="twin-note" className="font-medium">
        A note about {first}, their profile text pasted in, or notes from a meeting DryRun didn&apos;t see
      </label>
      <textarea id="twin-note" value={text} onChange={(e) => setText(e.target.value)} rows={3} className="rounded-xl border border-line bg-surface px-3 py-2 placeholder:text-muted focus:border-ink focus:outline-none" placeholder="e.g. Prefers the numbers on one page" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-ink-2">
          It&apos;s about
          <select value={kind} onChange={(e) => setKind(e.target.value as TwinFactKind)} className="rounded-lg border border-line bg-surface px-2 py-1.5">
            <option value="context">who they are</option>
            <option value="preference">what they care about</option>
            <option value="raised">something they raised</option>
            <option value="promised">something you promised</option>
          </select>
        </label>
        <span className="text-xs text-muted">{text.length >= 300
            ? unbuilt ? "Long text is kept as a source; n8n reads it for facts when you build." : "Long text is kept as a source; n8n reads it for facts on the next build."
            : "Kept as you wrote it, marked “you added this”."}</span>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={onCancel} className={btn("quiet", "sm")}>Cancel</button>
          <button type="submit" className={btn("primary", "sm")}>Add</button>
        </span>
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
      className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-sm"
    >
      <label htmlFor="twin-alias" className="font-medium">Another address of {first}&apos;s</label>
      <span className="flex gap-2">
        <input id="twin-alias" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-1.5 placeholder:text-muted focus:border-ink focus:outline-none" placeholder="name@company.com" />
        <button type="submit" className={btn("primary", "sm")}>Link</button>
      </span>
      <span className="text-xs text-muted">Emails with it count as {first} for sure from then on; the next build reads them.</span>
    </form>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`h-7 rounded-full border px-3 text-xs font-medium ${active ? "border-ink bg-ink text-surface" : "border-line bg-surface hover:border-ink"}`}>
      {children}
    </button>
  );
}

const clockAt = (ms: number) => (ms ? new Date(ms).toLocaleTimeString("en-GB", { hour12: false }) : "");
