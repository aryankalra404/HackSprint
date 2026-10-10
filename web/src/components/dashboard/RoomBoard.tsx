import type { PersonaId, SessionRecord } from "@/lib/contract";
import { PERSONA_STYLE, PRESENTER_SEAT, SEATS, TABLE } from "@/lib/personas";
import { PersonaAvatar, StanceText, StatusIcon } from "../ui";

// Overhead plan of the VR boardroom, drawn on a fixed 1000 x 560 canvas that scales with the screen.
// Room z runs left to right (presenter at the screen end), room x top to bottom.
// The short axis is stretched a little so the name cards fit on the table.
// Name cards are narrower than the gap between chairs, so every chair can be filled without overlap.
const W = 1000;
const H = 560;
const Z = [-8.35, -0.75];
const X = [-6.0, -3.08];
const u = (z: number) => ((z - Z[0]) / (Z[1] - Z[0])) * W;
const v = (x: number) => ((x - X[0]) / (X[1] - X[0])) * H;
const pct = (n: number, of: number) => `${(n / of) * 100}%`;
const LOW_SHARE = 0.1;
const CARD_W = 126;

const TABLE_BOX = { x: u(TABLE.zMin), y: v(TABLE.xMin), w: u(TABLE.zMax) - u(TABLE.zMin), h: v(TABLE.xMax) - v(TABLE.xMin) };
const TABLE_MID = v((TABLE.xMin + TABLE.xMax) / 2);
const HEAD_END = u(TABLE.zMax);

// Chairs around the table that nobody sits in, so it reads as a real boardroom
const EMPTY_CHAIRS = [
  { x: -5.4, z: -6.02 },
  { x: -5.4, z: -3.8 },
  { x: -3.67, z: -4.9 },
  { x: -3.67, z: -2.75 },
];

type Side = "top" | "bottom" | "head";
const sideOf = (x: number, z: number): Side => (u(z) > HEAD_END ? "head" : v(x) < TABLE_MID ? "top" : "bottom");

interface Props {
  session: SessionRecord;
  onOpen: (id: PersonaId) => void;
}

export function RoomBoard({ session, onOpen }: Props) {
  const { bundle, telemetry, debrief } = session;
  const dwell = telemetry?.gaze_dwell_s;
  const total = dwell ? Object.values(dwell).reduce((a, b) => a + (b ?? 0), 0) || 1 : 1;
  const share = (id: PersonaId) => (dwell ? (dwell[id] ?? 0) / total : null);
  const backing = debrief?.stakeholders.filter((s) => s.stance === "backs").length ?? 0;
  const you = { x: u(PRESENTER_SEAT.z), y: v(PRESENTER_SEAT.x) };

  return (
    <div className="relative size-full min-h-[420px]" style={{ containerType: "size" }}>
      <div
        className="absolute inset-0 m-auto"
        style={{ width: `min(100cqw, calc(100cqh * ${W / H}))`, aspectRatio: `${W} / ${H}`, containerType: "inline-size" }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" aria-hidden="true">
          {/* Slide screen on the wall behind the presenter */}
          <rect x={6} y={TABLE_MID - 70} width={7} height={140} rx={3} fill="var(--color-ink-2)" />
          <text x={30} y={TABLE_MID} transform={`rotate(-90 30 ${TABLE_MID})`} textAnchor="middle" className="fill-muted text-[13px]">
            Slides
          </text>

          {EMPTY_CHAIRS.map((c) => (
            <Chair key={`${c.x},${c.z}`} cx={u(c.z)} cy={v(c.x)} side={sideOf(c.x, c.z)} empty />
          ))}
          {bundle.personas.map((p) => (
            <Chair key={p.id} cx={u(SEATS[p.id].z)} cy={v(SEATS[p.id].x)} side={sideOf(SEATS[p.id].x, SEATS[p.id].z)} />
          ))}

          {/* Table: light oak with a darker edge */}
          <rect {...rect(TABLE_BOX)} rx={22} fill="#cdb48f" />
          <rect x={TABLE_BOX.x + 5} y={TABLE_BOX.y + 5} width={TABLE_BOX.w - 10} height={TABLE_BOX.h - 10} rx={18} fill="#e6d5ba" />

          {/* Where the presenter looked: line weight is share of eye contact */}
          {bundle.personas.map((p) => {
            const s = share(p.id);
            if (s == null) return null;
            return (
              <line
                key={p.id}
                x1={you.x}
                y1={you.y}
                x2={u(SEATS[p.id].z)}
                y2={v(SEATS[p.id].x)}
                stroke={PERSONA_STYLE[p.id].color}
                strokeOpacity={0.5}
                strokeWidth={2 + s * 30}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {debrief ? (
          <div className="absolute top-0 left-0 flex flex-col gap-[0.6cqw]">
            <p className="font-display text-[2.6cqw] leading-none">
              {backing} of {debrief.stakeholders.length} would back this
            </p>
            {dwell && <p className="text-[1.1cqw] text-ink-2">Lines and percentages show where your eye contact went.</p>}
          </div>
        ) : (
          <p
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-baseline gap-[1cqw] text-[1.2cqw] whitespace-nowrap text-[#6b5641]"
            style={{ left: pct(TABLE_BOX.x + TABLE_BOX.w * 0.43, W), top: pct(TABLE_MID, H) }}
          >
            Join code
            <span className="font-display text-[3cqw] leading-none tracking-[0.2em] text-[#4a3826]">{bundle.join_code}</span>
          </p>
        )}

        {/* Presenter */}
        <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[0.4cqw]" style={{ left: pct(you.x, W), top: pct(you.y, H) }}>
          <span className="size-[2.6cqw] rounded-full bg-ink ring-[0.5cqw] ring-surface" aria-hidden="true" />
          <span className="text-[1.15cqw] font-semibold">You</span>
        </div>

        {/* Stakeholders: portrait in the chair, name card on the table in front of them */}
        {bundle.personas.map((p) => {
          const seat = SEATS[p.id];
          const side = sideOf(seat.x, seat.z);
          const verdict = debrief?.stakeholders.find((s) => s.persona_id === p.id);
          const s = share(p.id);
          // Flush with the table edge in front of the seat; the head of the table gets it under the chair
          const card =
            side === "head"
              ? { left: u(seat.z), top: v(seat.x) + 58, anchor: "-translate-x-1/2" }
              : side === "top"
                ? { left: u(seat.z), top: TABLE_BOX.y + 10, anchor: "-translate-x-1/2" }
                : { left: u(seat.z), top: TABLE_BOX.y + TABLE_BOX.h - 10, anchor: "-translate-x-1/2 -translate-y-full" };
          return (
            <div key={p.id}>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={() => onOpen(p.id)}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-105"
                style={{ left: pct(u(seat.z), W), top: pct(v(seat.x), H) }}
              >
                <PersonaAvatar id={p.id} name={p.display_name} size="7.2cqw" stance={verdict?.stance} />
              </button>
              <button
                type="button"
                onClick={() => onOpen(p.id)}
                className={`absolute flex flex-col gap-[0.2cqw] rounded-[0.6cqw] border border-[#d8c4a4] bg-surface/95 px-[0.8cqw] py-[0.6cqw] text-left shadow-[0_1px_0_#cdb48f] hover:border-ink ${card.anchor}`}
                style={{ left: pct(card.left, W), top: pct(card.top, H), width: pct(CARD_W, W) }}
              >
                <span className="truncate font-display text-[1.25cqw] leading-tight">{p.display_name}</span>
                <span className="truncate text-[0.9cqw] leading-tight text-muted">{PERSONA_STYLE[p.id].role}</span>
                {verdict && (
                  <span className="mt-[0.2cqw] flex items-center justify-between gap-[0.4cqw] text-[1cqw] leading-tight whitespace-nowrap">
                    <StanceText stance={verdict.stance} />
                    {s != null && (
                      <span className={`inline-flex items-center gap-[0.2em] ${s < LOW_SHARE ? "text-warn-ink" : "text-ink-2"}`} title="Share of your eye contact">
                        {s < LOW_SHARE && <StatusIcon tone="warn" className="size-[1em]" />}
                        {Math.round(s * 100)}%
                      </span>
                    )}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function rect(b: { x: number; y: number; w: number; h: number }) {
  return { x: b.x, y: b.y, width: b.w, height: b.h };
}

// Top-down office chair: seat, with the backrest on the side away from the table
function Chair({ cx, cy, side, empty = false }: { cx: number; cy: number; side: Side; empty?: boolean }) {
  const rotate = side === "top" ? 0 : side === "bottom" ? 180 : 90;
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rotate})`} opacity={empty ? 0.5 : 1}>
      <rect x={-40} y={-38} width={80} height={72} rx={18} fill="#e4e2dc" stroke="#cfccc3" strokeWidth={1.5} />
      <rect x={-44} y={-52} width={88} height={18} rx={9} fill="#bdb9ae" />
    </g>
  );
}
