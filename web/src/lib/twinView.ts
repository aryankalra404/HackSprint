import type { Twin, TwinChange, TwinFact, TwinFactKind, TwinLogStep, TwinMeeting, TwinSource, TwinSummary } from "./contract";

// How the twin page reads a twin (contract 0.27). Safe on the client and the server. Nothing here decides what a twin knows: n8n
// does (DryRun twin, DryRun twin update). The page only draws it.

// "From your email of 3 Oct", "kaverifreight.in", "Your note, 22 Sep"
export function sourceLabel(s: TwinSource): string {
  const d = shortDate(s.date);
  if (s.type === "email") return `${s.from === "you" ? "Your email" : "Email"}${d ? ` of ${d}` : ""}: ${s.title}`;
  if (s.type === "manual") return `${s.title}${d ? `, ${d}` : ""}`;
  if (s.type === "meeting_note") return `Your notes from the meeting${d ? ` of ${d}` : ""}`;
  return `${s.title}${d && s.type === "news" ? `, ${d}` : ""}`;
}

export function shortDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const today = () => new Date().toISOString().slice(0, 10);

export function summarize(t: Twin): TwinSummary {
  const past = t.meetings.map((m) => m.date).filter((d) => d && d <= today()).sort();
  return {
    facts: t.facts.filter((f) => f.status === "connected").length,
    meetings: past.length,
    to_check: t.sources.filter((s) => s.status === "suggested").length,
    last_met: past.at(-1) ?? null,
  };
}

// How full the twin is, stated from counts, never as a score. `fill` (0 to 1) is how much of the portrait is drawn.
export function fullness(t: Twin): { label: "Nothing yet" | "Thin" | "Growing" | "Solid"; text: string; fill: number } {
  const s = summarize(t);
  const emails = t.sources.filter((x) => x.type === "email" && x.status === "connected").length;
  const parts = [plural(s.meetings, "real meeting"), plural(emails, "email"), plural(s.facts, "fact")];
  const fill = Math.min(1, 0.08 + s.facts * 0.035 + s.meetings * 0.12 + emails * 0.03);
  if (s.facts === 0 && emails === 0 && s.meetings === 0)
    return { label: "Nothing yet", text: "No emails with this address and no meetings yet. Add a note, or build again after your first meeting.", fill: 0.05 };
  if (s.meetings === 0 && s.facts < 6) return { label: "Thin", text: `${parts.join(", ")}. In rehearsal this seat still leans on their role.`, fill };
  if (s.meetings < 2 && s.facts < 15) return { label: "Growing", text: `${parts.join(", ")}.`, fill };
  return { label: "Solid", text: `${parts.join(", ")}.`, fill };
}

// The hit rate (0.28): per real meeting, how many of the things they raised the last rehearsal before it had asked. n8n counts it (DryRun
// after the meeting); this only lays it out: the facts it matched, and the rest of what they raised in that meeting.
export interface MeetingHits {
  meeting: TwinMeeting;
  asked: number;
  predicted: number;
  matched: TwinFact[];
  missed: TwinFact[];
}

export function hitRate(t: Pick<Twin, "predictions" | "meetings" | "facts" | "sources">): { asked: number; predicted: number; meetings: MeetingHits[] } {
  const meetings = t.predictions
    .map((p) => {
      const meeting = t.meetings.find((m) => m.id === p.meeting_id) ?? { id: p.meeting_id, title: "A meeting", date: p.date ?? "" };
      const matched = (p.matched ?? []).map((id) => t.facts.find((f) => f.id === id)).filter((f): f is TwinFact => !!f);
      // What they raised there that the rehearsal didn't ask: raised facts from that meeting's notes
      const note = t.sources.find((s) => s.type === "meeting_note" && s.key === `after:${p.meeting_id}`);
      const missed = note ? t.facts.filter((f) => f.source_id === note.id && f.kind === "raised" && !matched.includes(f)).slice(0, Math.max(0, p.asked - matched.length)) : [];
      return { meeting, asked: p.asked, predicted: p.predicted, matched, missed };
    })
    .sort((a, b) => (a.meeting.date < b.meeting.date ? 1 : -1));
  return { asked: meetings.reduce((n, m) => n + m.asked, 0), predicted: meetings.reduce((n, m) => n + m.predicted, 0), meetings };
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// A promise with a date in it ("by 18 Oct") that has passed
export function overdue(f: TwinFact): boolean {
  if (f.kind !== "promised" || f.status !== "connected") return false;
  const m = f.text.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i);
  if (!m) return false;
  const year = new Date(f.added || Date.now()).getFullYear();
  const due = new Date(`${m[1]} ${m[2]} ${year} 23:59`);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

// The steps the page plays: the last build's log (Replay), or an opened twin all at once
export function playableSteps(t: Twin): TwinLogStep[] {
  if (t.build_log.length) {
    // Anything added since the build (a confirmed suggestion, a note) lands with the last step, so Replay ends on today's twin
    const logged = new Set(t.build_log.flatMap((s) => [...s.adds.sources, ...s.adds.facts, ...s.adds.readings, ...(s.adds.meetings ?? [])]));
    const rest = {
      sources: t.sources.filter((x) => !logged.has(x.id)).map((x) => x.id),
      facts: t.facts.filter((x) => !logged.has(x.id)).map((x) => x.id),
      readings: t.readings.filter((x) => !logged.has(x.id)).map((x) => x.id),
      meetings: t.meetings.filter((x) => !logged.has(x.id)).map((x) => x.id),
    };
    const log = t.build_log.map((s) => ({ ...s, adds: { ...s.adds, meetings: s.adds.meetings ?? [] } }));
    const last = log[log.length - 1];
    last.adds = {
      sources: [...last.adds.sources, ...rest.sources],
      facts: [...last.adds.facts, ...rest.facts],
      readings: [...last.adds.readings, ...rest.readings],
      meetings: [...(last.adds.meetings ?? []), ...rest.meetings],
    };
    return log;
  }
  return [
    {
      step: "load",
      text: `Opened ${t.name || t.email}'s twin`,
      t: 0,
      adds: { sources: t.sources.map((x) => x.id), facts: t.facts.map((x) => x.id), readings: t.readings.map((x) => x.id), meetings: t.meetings.map((x) => x.id) },
    },
  ];
}

// The presenter's queued changes, applied the way DryRun twin update applies them, so the page shows them before they're saved.
// For a real twin n8n's answer replaces this; only the sample twin (which never reaches n8n) keeps the result.
export function applyChanges(twin: Twin, changes: TwinChange[]): Twin | null {
  if (changes.some((c) => c.op === "forget")) return null;
  const t: Twin = structuredClone(twin);
  const maxId = (list: { id: string }[], p: string) => list.reduce((a, x) => Math.max(a, Number(x.id.replace(p, "")) || 0), 0);
  let sN = maxId(t.sources, "s");
  let fN = maxId(t.facts, "f");
  const now = new Date().toISOString();
  for (const c of changes) {
    if (c.op === "confirm" || c.op === "reject") {
      const s = t.sources.find((x) => x.id === c.source_id);
      if (!s || s.type === "manual") continue;
      s.status = c.op === "confirm" ? "connected" : "rejected";
      if (c.op === "confirm") s.why = `You confirmed it: ${s.why ?? ""}`;
      t.facts.forEach((f) => {
        if (f.source_id === s.id) f.status = s.status;
      });
    } else if (c.op === "note") {
      const text = c.text.trim().slice(0, 8000);
      if (!text) continue;
      const s: TwinSource = { id: `s${++sN}`, type: "manual", title: text.length < 300 ? "Your note" : "Text you pasted", date: now.slice(0, 10), status: "connected", why: "You added this", key: `manual:${now}:${sN}`, text };
      t.sources.push(s);
      if (text.length < 300) t.facts.push({ id: `f${++fN}`, kind: c.kind ?? "context", text: text.slice(0, 120), source_id: s.id, quote: text, status: "connected", added: now });
    } else if (c.op === "alias") {
      const a = c.email.trim().toLowerCase();
      if (a.includes("@") && a !== t.email && !t.aliases.includes(a)) t.aliases.push(a);
    } else if (c.op === "delete") {
      t.facts = t.facts.filter((f) => f.id !== c.fact_id);
    }
  }
  const ok = new Set(t.facts.filter((f) => f.status === "connected").map((f) => f.id));
  t.readings = t.readings.map((r) => ({ ...r, evidence: r.evidence.filter((id) => ok.has(id)) })).filter((r) => r.evidence.length >= 2);
  if (t.role && !t.sources.some((s) => s.id === t.role!.source_id && s.status === "connected")) t.role = null;
  t.updated = now;
  return t;
}

// "Since last time" for the brief from one twin: what they raised and what you promised, connected facts only, newest first. n8n's
// GET /meeting does the same for real meetings; this is for the sample, which never reaches n8n.
export function sinceFromTwin(t: Twin): { email: string; name: string; raised: { text: string; date: string; source: string }[]; promised: { text: string; date: string; source: string }[] } | null {
  const src = new Map(t.sources.filter((s) => s.status === "connected").map((s) => [s.id, s]));
  const pick = (kinds: TwinFactKind[]) =>
    t.facts
      .filter((f) => f.status === "connected" && kinds.includes(f.kind) && src.has(f.source_id))
      .map((f) => ({ text: f.text, date: src.get(f.source_id)!.date, source: sourceLabel(src.get(f.source_id)!) }))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 4);
  const raised = pick(["raised", "decision"]);
  const promised = pick(["promised"]);
  return raised.length || promised.length ? { email: t.email, name: t.name, raised, promised } : null;
}
