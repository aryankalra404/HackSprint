import type { ReactNode } from "react";
import type { Seat } from "@/lib/contract";
import { ALL_SEATS, PRESENTER_SEAT, SEAT_POS, TABLE } from "@/lib/personas";

// Overhead plan of the VR boardroom, drawn on a fixed 1000 x 560 canvas that scales with the screen.
// Room z runs left to right (presenter at the screen end), room x top to bottom.
// The short axis is stretched a little so the name cards fit on the table.
// Name cards are narrower than the gap between chairs, so every chair can be filled without overlap.
// Shared by the dashboard (who sat where, how it went) and the Brief screen (who will sit where).
export const W = 1000;
export const H = 560;
const Z = [-8.35, -0.75];
const X = [-6.0, -3.08];
const u = (z: number) => ((z - Z[0]) / (Z[1] - Z[0])) * W;
const v = (x: number) => ((x - X[0]) / (X[1] - X[0])) * H;
export const pct = (n: number, of: number) => `${(n / of) * 100}%`;
export const CARD_W = 126;

const TABLE_BOX = { x: u(TABLE.zMin), y: v(TABLE.xMin), w: u(TABLE.zMax) - u(TABLE.zMin), h: v(TABLE.xMax) - v(TABLE.xMin) };
const TABLE_MID = v((TABLE.xMin + TABLE.xMax) / 2);
const HEAD_END = u(TABLE.zMax);

// Chairs with no panel seat, so it reads as a real boardroom
const SPARE_CHAIRS = [
  { x: -5.4, z: -6.02 },
  { x: -5.4, z: -3.8 },
  { x: -3.67, z: -4.9 },
];

type Side = "top" | "bottom" | "head";
const sideOf = (x: number, z: number): Side => (u(z) > HEAD_END ? "head" : v(x) < TABLE_MID ? "top" : "bottom");

export const PRESENTER = { x: u(PRESENTER_SEAT.z), y: v(PRESENTER_SEAT.x) };
export const TABLE_CENTRE = { x: TABLE_BOX.x + TABLE_BOX.w * 0.43, y: TABLE_MID };

// Canvas position of a seat (the middle of the chair)
export function seatPoint(seat: Seat) {
  return { x: u(SEAT_POS[seat].z), y: v(SEAT_POS[seat].x) };
}

// Where a seat's name card goes: flush with the table edge in front of it; the head of the table gets it under the chair
export function cardPlacement(seat: Seat) {
  const { x, y } = seatPoint(seat);
  const side = sideOf(SEAT_POS[seat].x, SEAT_POS[seat].z);
  if (side === "head") return { left: x, top: y + 58, anchor: "-translate-x-1/2" };
  if (side === "top") return { left: x, top: TABLE_BOX.y + 10, anchor: "-translate-x-1/2" };
  return { left: x, top: TABLE_BOX.y + TABLE_BOX.h - 10, anchor: "-translate-x-1/2 -translate-y-full" };
}

interface Props {
  occupied: Seat[];
  // Drawn over the table, under the people (e.g. sight lines)
  lines?: ReactNode;
  // Positioned with pct(); font sizes in cqw scale with the plan
  children: ReactNode;
}

export function RoomPlan({ occupied, lines, children }: Props) {
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

          {SPARE_CHAIRS.map((c) => (
            <Chair key={`${c.x},${c.z}`} cx={u(c.z)} cy={v(c.x)} side={sideOf(c.x, c.z)} empty />
          ))}
          {ALL_SEATS.map((seat) => {
            const c = SEAT_POS[seat];
            return <Chair key={seat} cx={u(c.z)} cy={v(c.x)} side={sideOf(c.x, c.z)} empty={!occupied.includes(seat)} />;
          })}

          {/* Table: light oak with a darker edge */}
          <rect x={TABLE_BOX.x} y={TABLE_BOX.y} width={TABLE_BOX.w} height={TABLE_BOX.h} rx={22} fill="#cdb48f" />
          <rect x={TABLE_BOX.x + 5} y={TABLE_BOX.y + 5} width={TABLE_BOX.w - 10} height={TABLE_BOX.h - 10} rx={18} fill="#e6d5ba" />

          {lines}
        </svg>

        {/* Presenter */}
        <div
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[0.4cqw]"
          style={{ left: pct(PRESENTER.x, W), top: pct(PRESENTER.y, H) }}
        >
          <span className="size-[2.6cqw] rounded-full bg-ink ring-[0.5cqw] ring-surface" aria-hidden="true" />
          <span className="text-[1.15cqw] font-semibold">You</span>
        </div>

        {children}
      </div>
    </div>
  );
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
