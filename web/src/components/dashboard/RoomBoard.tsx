import type { PersonaId, Room, SessionRecord } from "@/lib/contract";
import { colorOf } from "@/lib/personas";
import { PersonaAvatar, StanceText, StatusIcon } from "../ui";
import { CARD_W, H, PRESENTER, RoomPlan, TABLE_CENTRE, W, cardPlacement, pct, seatPoint } from "../room/RoomPlan";

const LOW_SHARE = 0.1;

interface Props {
  session: SessionRecord;
  // The laptop's room, when this is its session: the table says where the session is
  phase?: Room["phase"];
  onOpen: (id: PersonaId) => void;
}

const TABLE_TEXT: Partial<Record<Room["phase"], [string, string]>> = {
  live: ["The session is live", "The panel is listening"],
  done: ["Session ended", "Run it again from the top bar, or press A in the headset"],
};

// The room on the dashboard: who sits where, and after the session, how each of them landed
export function RoomBoard({ session, phase, onOpen }: Props) {
  const { bundle, telemetry, debrief } = session;
  const dwell = telemetry?.gaze_dwell_s;
  const total = dwell ? Object.values(dwell).reduce((a, b) => a + b, 0) || 1 : 1;
  const share = (id: PersonaId) => (dwell ? (dwell[id] ?? 0) / total : null);
  const backing = debrief?.stakeholders.filter((s) => s.stance === "backs").length ?? 0;
  const [headline, detail] = (phase && TABLE_TEXT[phase]) ?? ["The panel is seated", "Put on the headset to start"];

  // Where the presenter looked: line weight is share of eye contact
  const lines = bundle.personas.map((p) => {
    const s = share(p.id);
    if (s == null) return null;
    const to = seatPoint(p.seat);
    return (
      <line
        key={p.id}
        x1={PRESENTER.x}
        y1={PRESENTER.y}
        x2={to.x}
        y2={to.y}
        stroke={colorOf(p.color)}
        strokeOpacity={0.5}
        strokeWidth={2 + s * 30}
        strokeLinecap="round"
      />
    );
  });

  return (
    <RoomPlan occupied={bundle.personas.map((p) => p.seat)} lines={lines}>
      {debrief ? (
        <div className="absolute top-0 left-0 flex flex-col gap-[0.6cqw]">
          <p className="font-display text-[2.6cqw] leading-none">
            {backing} of {debrief.stakeholders.length} would back this
          </p>
          {dwell && <p className="text-[1.1cqw] text-ink-2">Lines and percentages show where your eye contact went.</p>}
        </div>
      ) : (
        <p
          className="absolute -translate-x-1/2 -translate-y-1/2 text-center font-display text-[1.8cqw] leading-tight whitespace-nowrap text-[#4a3826]"
          style={{ left: pct(TABLE_CENTRE.x, W), top: pct(TABLE_CENTRE.y, H) }}
        >
          {headline}
          <span className="block font-sans text-[1.15cqw] text-[#6b5641]">{detail}</span>
        </p>
      )}

      {/* Stakeholders: portrait in the chair, name card on the table in front of them */}
      {bundle.personas.map((p) => {
        const at = seatPoint(p.seat);
        const card = cardPlacement(p.seat);
        const verdict = debrief?.stakeholders.find((s) => s.persona_id === p.id);
        const s = share(p.id);
        return (
          <div key={p.id}>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => onOpen(p.id)}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-105"
              style={{ left: pct(at.x, W), top: pct(at.y, H) }}
            >
              <PersonaAvatar persona={p} size="7.2cqw" stance={verdict?.stance} />
            </button>
            <button
              type="button"
              onClick={() => onOpen(p.id)}
              className={`absolute flex flex-col gap-[0.2cqw] rounded-[0.6cqw] border border-[#d8c4a4] bg-surface/95 px-[0.8cqw] py-[0.6cqw] text-left shadow-[0_1px_0_#cdb48f] hover:border-ink ${card.anchor}`}
              style={{ left: pct(card.left, W), top: pct(card.top, H), width: pct(CARD_W, W) }}
            >
              <span className="truncate font-display text-[1.25cqw] leading-tight">{p.display_name}</span>
              <span className="truncate text-[0.9cqw] leading-tight text-muted">{p.role}</span>
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
    </RoomPlan>
  );
}
