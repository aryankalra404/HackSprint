import type { Persona, PersonaId } from "@/lib/contract";
import { PERSONA_STYLE, PRESENTER_SEAT, SEATS, TABLE } from "@/lib/personas";
import { Card, StatusIcon } from "../ui";

// Top-down view of the VR boardroom, presenter on the left. Room z runs left to right, x top to bottom.
const S = 48;
const Z0 = -8.2;
const X0 = -6.2;
const W = 7.3 * S;
const H = 3.6 * S;
const px = (p: { x: number; z: number }) => ({ cx: (p.z - Z0) * S, cy: (p.x - X0) * S });

const LOW_SHARE = 0.1;

export function GazeMap({ dwell, personas }: { dwell: Partial<Record<PersonaId, number>>; personas: Persona[] }) {
  const total = Object.values(dwell).reduce((a, b) => a + (b ?? 0), 0) || 1;
  const rows = personas.map((p) => ({ ...p, share: (dwell[p.id] ?? 0) / total }));
  const presenter = px(PRESENTER_SEAT);

  return (
    <Card title="Eye contact" aside={<span className="font-mono text-xs text-muted">VR only</span>}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Top-down map of the boardroom showing how your eye contact was shared. Values are listed below.">
        <rect
          x={(TABLE.zMin - Z0) * S}
          y={(TABLE.xMin - X0) * S}
          width={(TABLE.zMax - TABLE.zMin) * S}
          height={(TABLE.xMax - TABLE.xMin) * S}
          rx={10}
          fill="var(--color-paper)"
          stroke="var(--color-line)"
        />
        {rows.map((r) => {
          const seat = px(SEATS[r.id]);
          return (
            <line
              key={`ray-${r.id}`}
              x1={presenter.cx}
              y1={presenter.cy}
              x2={seat.cx}
              y2={seat.cy}
              stroke={PERSONA_STYLE[r.id].color}
              strokeOpacity={0.5}
              strokeWidth={1.5 + r.share * 18}
              strokeLinecap="round"
            />
          );
        })}
        {rows.map((r) => {
          const seat = px(SEATS[r.id]);
          const above = SEATS[r.id].x < -5;
          return (
            <g key={r.id}>
              <circle cx={seat.cx} cy={seat.cy} r={12} fill="var(--color-surface)" stroke={PERSONA_STYLE[r.id].color} strokeWidth={2.5} />
              <text
                x={seat.cx}
                y={above ? seat.cy - 20 : seat.cy + 29}
                textAnchor="middle"
                className="fill-ink font-mono text-[11px]"
              >
                {PERSONA_STYLE[r.id].short} {Math.round(r.share * 100)}%
              </text>
            </g>
          );
        })}
        <circle cx={presenter.cx} cy={presenter.cy} r={9} fill="var(--color-ink)" />
        <text x={presenter.cx} y={presenter.cy + 26} textAnchor="middle" className="fill-ink-2 font-mono text-[11px]">You</text>
      </svg>

      <ul className="mt-4 flex flex-col gap-1.5">
        {[...rows].sort((a, b) => b.share - a.share).map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className="size-2 rounded-full" style={{ background: PERSONA_STYLE[r.id].color }} />
            <span className="flex-1">{r.display_name} <span className="text-muted">· {PERSONA_STYLE[r.id].short}</span></span>
            {r.share < LOW_SHARE && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-warn-ink">
                <StatusIcon tone="warn" className="size-3" /> Barely looked
              </span>
            )}
            <span className="w-10 text-right font-mono tabular-nums">{Math.round(r.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
