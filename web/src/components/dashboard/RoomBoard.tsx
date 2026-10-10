import type { PersonaId, SessionRecord } from "@/lib/contract";
import { PERSONA_STYLE, PRESENTER_SEAT, SEATS, TABLE } from "@/lib/personas";
import { PersonaAvatar, StancePill, StatusIcon } from "../ui";

// Top-down view of the VR boardroom: presenter on the left, room z runs left to right, x top to bottom.
const Z = [-8.4, -0.6];
const X = [-5.95, -3.1];
const left = (z: number) => ((z - Z[0]) / (Z[1] - Z[0])) * 100;
const top = (x: number) => ((x - X[0]) / (X[1] - X[0])) * 100;
const LOW_SHARE = 0.1;

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
  const presenter = { x: left(PRESENTER_SEAT.z), y: top(PRESENTER_SEAT.x) };

  return (
    <div className="relative size-full min-h-[460px]">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden="true">
        <rect
          x={left(TABLE.zMin)}
          y={top(TABLE.xMin)}
          width={left(TABLE.zMax) - left(TABLE.zMin)}
          height={top(TABLE.xMax) - top(TABLE.xMin)}
          rx={1.5}
          fill="var(--color-paper)"
          stroke="var(--color-line)"
          vectorEffect="non-scaling-stroke"
        />
        {bundle.personas.map((p) => {
          const s = share(p.id);
          if (s == null) return null;
          return (
            <line
              key={p.id}
              x1={presenter.x}
              y1={presenter.y}
              x2={left(SEATS[p.id].z)}
              y2={top(SEATS[p.id].x)}
              stroke={PERSONA_STYLE[p.id].color}
              strokeOpacity={0.45}
              strokeWidth={2 + s * 26}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      {/* Middle of the table */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
        style={{ left: `${(left(TABLE.zMin) + left(TABLE.zMax)) / 2 - 6}%`, top: `${(top(TABLE.xMin) + top(TABLE.xMax)) / 2}%` }}
      >
        {debrief ? (
          <p className="rounded-lg bg-paper px-3 py-1 font-display text-2xl xl:text-3xl">{backing} of {debrief.stakeholders.length} would back this</p>
        ) : (
          <p className="text-xs text-muted">
            Join in the headset with
            <span className="block font-display text-3xl tracking-[0.3em] text-ink xl:text-4xl">{bundle.join_code}</span>
          </p>
        )}
      </div>

      {/* Presenter */}
      <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1" style={{ left: `${presenter.x}%`, top: `${presenter.y}%` }}>
        <span className="size-5 rounded-full bg-ink" aria-hidden="true" />
        <span className="text-xs text-ink-2">You</span>
      </div>

      {/* Seats */}
      {bundle.personas.map((p) => {
        const verdict = debrief?.stakeholders.find((s) => s.persona_id === p.id);
        const objection = p.objections[0];
        const s = share(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            className="absolute flex w-[23%] max-w-60 -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded-xl border border-line bg-surface p-3 text-left shadow-sm hover:border-ink"
            style={{ left: `${left(SEATS[p.id].z)}%`, top: `${top(SEATS[p.id].x)}%` }}
          >
            <span className="flex items-center gap-2">
              <PersonaAvatar id={p.id} name={p.display_name} size={32} />
              <span className="min-w-0">
                <span className="block truncate font-display text-sm">{p.display_name}</span>
                <span className="block truncate text-xs text-muted">{PERSONA_STYLE[p.id].role}</span>
              </span>
            </span>
            {verdict ? (
              <span className="flex flex-wrap items-center justify-between gap-1">
                <StancePill stance={verdict.stance} />
                {s != null && (
                  <span className={`inline-flex items-center gap-1 text-[11px] ${s < LOW_SHARE ? "text-warn-ink" : "text-ink-2"}`}>
                    {s < LOW_SHARE && <StatusIcon tone="warn" className="size-3" />}
                    {Math.round(s * 100)}% eye contact
                  </span>
                )}
              </span>
            ) : (
              objection && <span className="line-clamp-2 text-xs text-ink-2">{objection.text}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
