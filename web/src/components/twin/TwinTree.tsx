"use client";

import type { ReactNode } from "react";
import type { TwinFact, TwinReading, TwinSource, TwinStatus } from "@/lib/contract";
import { BRANCHES, type Branch, SOURCE_GLYPH, branchOf, sourceTab } from "@/lib/twinView";

// The tree around the portrait: four branches (who they are, what they care about, what they raised, what you promised), a leaf per
// fact, and from each leaf a hairline out to its source on the outer ring. Reading inward is how the twin was built; reading outward
// is where each fact came from. Suggestions are dashed and grey, marked "?"; clicking one opens its card with "Same person / Not them". n8n's readings sit
// where their evidence meets. Lines draw in when a fact is connected; with reduced motion everything shows at once (globals.css).

export interface Leaf {
  id: string;
  branch: Branch;
  text: string;
  status: TwinStatus;
  source: TwinSource;
  fact?: TwinFact;
}

const W = 1200;
const H = 760;
const CX = W / 2;
const CY = H / 2;
const ANGLE: Record<Branch, number> = { raised: -90, cares: 0, promised: 90, who: 180 };
// Top and bottom branches spread wider: their labels sit side by side
const SPAN: Record<Branch, number> = { raised: 116, promised: 100, cares: 64, who: 64 };
const MAX_PER_BRANCH = 8;
const rad = (d: number) => (d * Math.PI) / 180;
// Rounded, so the server's and the browser's trigonometry agree to the digit (hydration)
const r1 = (n: number) => Math.round(n * 10) / 10;
const onEllipse = (deg: number, rx: number, ry: number) => ({ x: r1(CX + rx * Math.cos(rad(deg))), y: r1(CY + ry * Math.sin(rad(deg))) });

interface Props {
  leaves: Leaf[];
  sources: TwinSource[];
  readings: TwinReading[];
  footnote: Record<string, number>;
  hover: string | null;
  onHover: (id: string | null) => void;
  onSelect: (leaf: Leaf) => void;
  // Facts drawn in full ink when "Since last time" is on; the rest greyed
  emphasis: Set<string> | null;
  pending: Record<string, "confirm" | "reject">;
  centre: ReactNode;
}

export function TwinTree({ leaves, sources, readings, footnote, hover, onHover, onSelect, emphasis, pending, centre }: Props) {
  // Leaves per branch, spread across the branch's sector; the rest are counted, not drawn
  const placed: (Leaf & { x: number; y: number; deg: number })[] = [];
  const more: Partial<Record<Branch, number>> = {};
  for (const b of BRANCHES) {
    const mine = leaves.filter((l) => l.branch === b.id);
    const shown = mine.slice(0, MAX_PER_BRANCH);
    if (mine.length > shown.length) more[b.id] = mine.length - shown.length;
    shown.forEach((l, i) => {
      const deg = ANGLE[b.id] + (shown.length === 1 ? 0 : SPAN[b.id] * ((i + 0.5) / shown.length - 0.5));
      placed.push({ ...l, deg, ...onEllipse(deg, 300, 235) });
    });
  }

  // Each source on the outer ring, where its leaves point (circular mean), kept apart from its neighbours
  const ring = sources
    .map((s) => {
      const mine = placed.filter((l) => l.source.id === s.id);
      const deg = mine.length
        ? (Math.atan2(mine.reduce((a, l) => a + Math.sin(rad(l.deg)), 0), mine.reduce((a, l) => a + Math.cos(rad(l.deg)), 0)) * 180) / Math.PI
        : s.status === "suggested" ? 200 : -40;
      return { s, deg: (deg + 360) % 360 };
    })
    .sort((a, b) => a.deg - b.deg);
  const GAP = Math.min(14, 360 / Math.max(1, ring.length));
  for (let pass = 0; pass < 3; pass++)
    for (let i = 1; i < ring.length; i++) if (ring[i].deg - ring[i - 1].deg < GAP) ring[i].deg = ring[i - 1].deg + GAP;
  const tabs = new Map(ring.map(({ s, deg }) => [s.id, { s, deg, ...onEllipse(deg, 548, 340) }]));

  const hoveredLeaf = hover ? placed.find((l) => l.fact?.id === hover || l.id === hover) : undefined;
  const lit = (l: Leaf) => !!hoveredLeaf && hoveredLeaf.id === l.id;
  const litSource = (id: string) => !!hoveredLeaf && hoveredLeaf.source.id === id;
  const faded = (l: Leaf) => (emphasis && l.fact ? !emphasis.has(l.fact.id) : false);

  return (
    <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible" role="img" aria-label="How the twin was built: each fact and where it came from">
        {/* Branches: from the portrait to a hub, labelled */}
        {BRANCHES.map((b) => {
          const from = onEllipse(ANGLE[b.id], 104, 112);
          const hub = onEllipse(ANGLE[b.id], 200, 178);
          const has = placed.some((l) => l.branch === b.id);
          return (
            <g key={b.id} className={has ? "" : "opacity-40"}>
              <path d={`M${from.x},${from.y} L${hub.x},${hub.y}`} className="tw-line stroke-ink" strokeWidth={1.4} pathLength={1} fill="none" />
              <text x={hub.x} y={hub.y + (ANGLE[b.id] === -90 ? -10 : ANGLE[b.id] === 90 ? 22 : -10)} textAnchor="middle" className="fill-ink-2 text-[13px] font-semibold">
                {b.label}
                {more[b.id] ? ` (+${more[b.id]} in the file)` : ""}
              </text>
            </g>
          );
        })}

        {/* Leaf to source: where each fact came from */}
        {placed.map((l) => {
          const t = tabs.get(l.source.id);
          if (!t) return null;
          return (
            <line
              key={`src-${l.id}`}
              x1={l.x}
              y1={l.y}
              x2={t.x}
              y2={t.y}
              className={`${l.status === "connected" ? "tw-line stroke-axis" : "tw-fade stroke-axis"} ${litSource(l.source.id) && lit(l) ? "!stroke-ink" : ""}`}
              strokeWidth={lit(l) ? 1.6 : 0.8}
              strokeDasharray={l.status === "connected" ? undefined : "4 4"}
              pathLength={l.status === "connected" ? 1 : undefined}
            />
          );
        })}

        {/* Hub to leaf */}
        {placed.map((l) => {
          const hub = onEllipse(ANGLE[l.branch], 200, 178);
          return (
            <path
              key={`br-${l.id}`}
              d={`M${hub.x},${hub.y} Q${(hub.x + l.x) / 2 + (CX - l.x) * 0.05},${(hub.y + l.y) / 2 + (CY - l.y) * 0.05} ${l.x},${l.y}`}
              fill="none"
              className={`${l.status === "connected" ? "tw-line stroke-ink" : "tw-fade stroke-muted"}`}
              strokeOpacity={faded(l) ? 0.25 : 1}
              strokeWidth={lit(l) ? 2 : 1}
              strokeDasharray={l.status === "connected" ? undefined : "4 4"}
              pathLength={l.status === "connected" ? 1 : undefined}
            />
          );
        })}

        {/* n8n's readings: where two or more leaves' lines meet, never without their leaves */}
        {readings.map((r) => {
          const ev = r.evidence.map((id) => placed.find((l) => l.fact?.id === id)).filter((x): x is (typeof placed)[number] => !!x);
          if (ev.length < 2) return null;
          // Between the hub and its leaves, in the direction they point
          const deg = (Math.atan2(ev.reduce((a, l) => a + l.y - CY, 0) / 235, ev.reduce((a, l) => a + l.x - CX, 0) / 300) * 180) / Math.PI;
          // Off the branch's own line, so its label never sits on the branch's name
          const { x, y } = onEllipse(deg + (Math.abs(Math.cos(rad(deg))) < 0.3 ? 14 : 0), 252, 208);
          const side = Math.cos(rad(deg));
          return (
            <g key={r.id} className="tw-leaf">
              {ev.map((l) => (
                <line key={l.id} x1={x} y1={y} x2={l.x} y2={l.y} className="stroke-axis" strokeWidth={0.8} strokeDasharray="1 3" />
              ))}
              <circle cx={x} cy={y} r={6} className="fill-surface stroke-ink" strokeWidth={1.2} />
              <text x={x + (side < -0.3 ? -10 : 10)} y={y + 4} textAnchor={side < -0.3 ? "end" : "start"} className="fill-ink-2 text-[11px]">
                n8n&apos;s reading: {r.text.toLowerCase()} ({ev.length})
              </text>
            </g>
          );
        })}

        {/* Leaves: a tick and a short label, with the footnote of its source */}
        {placed.map((l) => {
          const cos = Math.cos(rad(l.deg));
          const anchor = cos > 0.25 ? "start" : cos < -0.25 ? "end" : "middle";
          const dx = anchor === "start" ? 9 : anchor === "end" ? -9 : 0;
          const dy = anchor === "middle" ? (Math.sin(rad(l.deg)) < 0 ? -10 : 18) : 4;
          const label = l.text.length > 30 ? `${l.text.slice(0, 28)}…` : l.text;
          const n = footnote[l.source.id];
          return (
            <g
              key={l.id}
              className="tw-leaf cursor-pointer outline-none"
              tabIndex={0}
              role="button"
              aria-label={`${l.text}${n ? `, source ${n}` : ""}${l.status === "suggested" ? ", to check" : ""}`}
              onMouseEnter={() => onHover(l.fact?.id ?? l.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(l.fact?.id ?? l.id)}
              onBlur={() => onHover(null)}
              onClick={() => onSelect(l)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(l)}
            >
              {/* Greyed under "Since last time": on an inner group, since the appear animation sets the outer one's opacity */}
              <g className={faded(l) ? "opacity-30" : undefined}>
              <circle cx={l.x} cy={l.y} r={lit(l) ? 5 : 3.5} className={l.status === "connected" ? "fill-ink" : "fill-surface stroke-muted"} strokeWidth={1.2} />
              <text x={l.x + dx} y={l.y + dy} textAnchor={anchor} className={`text-[13px] ${l.status === "connected" ? "fill-ink" : "fill-muted"} ${lit(l) ? "font-semibold" : ""}`}>
                {label}
                {n ? <tspan className="fill-ink-2 text-[9px]" dy={-5}>{` ${n}`}</tspan> : null}
              </text>
              </g>
            </g>
          );
        })}

        {/* Sources on the outer ring, as small file tabs */}
        {[...tabs.values()].map(({ s, x, y }) => {
          const suggested = s.status === "suggested";
          const rejecting = pending[s.id] === "reject";
          const text = `${SOURCE_GLYPH[s.type]} ${sourceTab(s)}${suggested ? " ?" : ""}`;
          const w = Math.max(56, text.length * 7 + 14);
          return (
            <g key={s.id} className="tw-tab">
              <title>{suggested ? `${s.why ?? s.title}: same person? Click its leaf, or check it in the file.` : s.title}</title>
              <rect x={x - w / 2} y={y - 11} width={w} height={22} rx={3} className={`${litSource(s.id) ? "fill-ink" : "fill-surface"} ${suggested ? "stroke-muted" : "stroke-ink"}`} strokeWidth={1} strokeDasharray={suggested ? "3 3" : undefined} />
              <text x={x} y={y + 4} textAnchor="middle" className={`text-[11px] ${litSource(s.id) ? "fill-surface" : suggested ? "fill-muted" : "fill-ink"} ${rejecting ? "line-through opacity-40" : ""}`}>
                {text}
                {footnote[s.id] ? <tspan dy={-4} className="text-[8px]">{` ${footnote[s.id]}`}</tspan> : null}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: `${(190 / W) * 100}%` }}>
        {centre}
      </div>
    </div>
  );
}

// Facts as leaves, and every suggestion with no facts yet as a grey leaf of its own (its "why"), so each one can be checked
export function toLeaves(facts: TwinFact[], sources: TwinSource[]): Leaf[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const leaves: Leaf[] = facts
    .filter((f) => f.status !== "rejected" && byId.has(f.source_id))
    .map((f) => ({ id: f.id, branch: branchOf(f), text: f.text, status: f.status, source: byId.get(f.source_id)!, fact: f }));
  for (const s of sources)
    if (s.status === "suggested" && !leaves.some((l) => l.source.id === s.id))
      leaves.push({ id: `q-${s.id}`, branch: "who", text: s.why ?? s.title, status: "suggested", source: s });
  return leaves;
}
