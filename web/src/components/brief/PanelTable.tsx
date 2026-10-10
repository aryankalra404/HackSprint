"use client";

import type { DraftMember, PanelMember, Seat } from "@/lib/contract";
import { ALL_SEATS } from "@/lib/personas";
import { PersonaAvatar } from "../ui";
import { CARD_W, H, RoomPlan, TABLE_CENTRE, W, cardPlacement, pct, seatPoint } from "../room/RoomPlan";

export type Selection = { kind: "person"; id: string } | { kind: "seat"; seat: Seat } | null;

export const SOURCE_LABEL: Record<PanelMember["source"], string> = {
  email: "From the email",
  research: "From research",
  deck: "From your deck",
  typical: "Usual for this deal",
};

interface Props {
  members: DraftMember[];
  selection: Selection;
  onSelect: (s: Selection) => void;
}

// The Brief screen's table: n8n's proposed panel in their seats. Click a person to edit them, or an empty seat to add someone.
export function PanelTable({ members, selection, onSelect }: Props) {
  const free = ALL_SEATS.filter((seat) => !members.some((m) => m.seat === seat));

  return (
    <RoomPlan occupied={members.map((m) => m.seat)}>
      <p
        className="absolute -translate-x-1/2 -translate-y-1/2 text-center text-[1.15cqw] whitespace-nowrap text-[#6b5641]"
        style={{ left: pct(TABLE_CENTRE.x, W), top: pct(TABLE_CENTRE.y, H) }}
      >
        Click someone to edit them{free.length > 0 && <>, or <span className="font-semibold">+</span> to add someone</>}
      </p>

      {members.map((m) => {
        const at = seatPoint(m.seat);
        const card = cardPlacement(m.seat);
        const selected = selection?.kind === "person" && selection.id === m.id;
        return (
          <div key={m.id}>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => onSelect({ kind: "person", id: m.id })}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-105 ${selected ? "scale-105 ring-[0.4cqw] ring-ink ring-offset-[0.3cqw]" : ""}`}
              style={{ left: pct(at.x, W), top: pct(at.y, H) }}
            >
              <PersonaAvatar persona={m} size="7.2cqw" />
            </button>
            <button
              type="button"
              onClick={() => onSelect({ kind: "person", id: m.id })}
              aria-pressed={selected}
              className={`absolute flex flex-col gap-[0.2cqw] rounded-[0.6cqw] border bg-surface/95 px-[0.8cqw] py-[0.6cqw] text-left shadow-[0_1px_0_#cdb48f] hover:border-ink ${selected ? "border-ink" : "border-[#d8c4a4]"} ${card.anchor}`}
              style={{ left: pct(card.left, W), top: pct(card.top, H), width: pct(CARD_W, W) }}
            >
              <span className={`truncate font-display text-[1.25cqw] leading-tight ${m.display_name ? "" : "text-muted"}`}>
                {m.display_name || "Named by n8n"}
              </span>
              <span className="truncate text-[0.9cqw] leading-tight text-muted">{m.role || "No role yet"}</span>
              {m.source && <span className="mt-[0.2cqw] truncate text-[0.9cqw] leading-tight text-ink-2">{SOURCE_LABEL[m.source]}</span>}
            </button>
          </div>
        );
      })}

      {free.map((seat) => {
        const at = seatPoint(seat);
        const selected = selection?.kind === "seat" && selection.seat === seat;
        return (
          <button
            key={seat}
            type="button"
            onClick={() => onSelect({ kind: "seat", seat })}
            aria-label="Add someone to this seat"
            aria-pressed={selected}
            className={`absolute flex size-[5cqw] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[0.2cqw] border-dashed text-[2.4cqw] leading-none transition-colors ${selected ? "border-ink bg-ink text-surface" : "border-ink-2/50 bg-surface/80 text-ink-2 hover:border-ink hover:text-ink"}`}
            style={{ left: pct(at.x, W), top: pct(at.y, H) }}
          >
            +
          </button>
        );
      })}
    </RoomPlan>
  );
}
