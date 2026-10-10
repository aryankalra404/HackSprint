"use client";

import { useState } from "react";
import type { DraftMember, PanelMember, Seat } from "@/lib/contract";
import { ALL_SEATS, MAX_PANEL } from "@/lib/personas";
import { PersonaAvatar } from "../ui";
import { CARD_W, H, RoomPlan, TABLE_CENTRE, W, cardPlacement, pct, seatPoint } from "../room/RoomPlan";

export type Selection = { kind: "person"; id: string } | { kind: "seat"; seat: Seat } | null;

export const SOURCE_LABEL: Record<PanelMember["source"], string> = {
  email: "From the email",
  research: "From research",
  deck: "From your deck",
  typical: "Usual for this deal",
};

export function seatLabel(seat: Seat): string {
  if (seat === 0) return "Head of the table";
  const side = seat <= 4 ? "Wall side" : "Window side";
  const n = seat <= 4 ? seat : seat - 4;
  return `${side}, ${["", "1st", "2nd", "3rd", "4th"][n]} from the head`;
}

interface Props {
  members: DraftMember[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  // Move someone to a seat; if it's taken, the two swap
  onMove: (id: string, seat: Seat) => void;
}

// The Brief screen's table: every chair is a seat. Click a person to edit them, + to add someone, drag to move.
export function PanelTable({ members, selection, onSelect, onMove }: Props) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Seat | null>(null);
  const full = members.length >= MAX_PANEL;
  const free = ALL_SEATS.filter((seat) => !members.some((m) => m.seat === seat));

  // Drag and drop between chairs; the editor's seat picker does the same from the keyboard
  const dragProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
      setDragging(id);
    },
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
  });
  const dropProps = (seat: Seat) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      setOver(seat);
    },
    onDragLeave: () => setOver((s) => (s === seat ? null : s)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      if (id) onMove(id, seat);
      setDragging(null);
      setOver(null);
    },
  });

  return (
    <RoomPlan occupied={members.map((m) => m.seat)}>
      <p
        className="absolute -translate-x-1/2 -translate-y-1/2 text-center text-[1.15cqw] whitespace-nowrap text-[#6b5641]"
        style={{ left: pct(TABLE_CENTRE.x, W), top: pct(TABLE_CENTRE.y, H) }}
      >
        {dragging ? (
          "Drop on any chair. Dropping on someone swaps you."
        ) : (
          <>
            {members.length} of {MAX_PANEL} seats filled. Drag people to move them{full ? "." : <>, or <span className="font-semibold">+</span> to add someone.</>}
          </>
        )}
      </p>

      {members.map((m) => {
        const at = seatPoint(m.seat);
        const card = cardPlacement(m.seat);
        const selected = selection?.kind === "person" && selection.id === m.id;
        const target = over === m.seat && dragging !== m.id;
        return (
          <div key={m.id} className={dragging === m.id ? "opacity-40" : ""}>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => onSelect({ kind: "person", id: m.id })}
              {...dragProps(m.id)}
              {...dropProps(m.seat)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full transition-transform hover:scale-105 active:cursor-grabbing ${selected || target ? "scale-105 ring-[0.4cqw] ring-ink ring-offset-[0.3cqw]" : ""}`}
              style={{ left: pct(at.x, W), top: pct(at.y, H) }}
            >
              <PersonaAvatar persona={m} size="7.2cqw" />
            </button>
            <button
              type="button"
              onClick={() => onSelect({ kind: "person", id: m.id })}
              aria-pressed={selected}
              {...dragProps(m.id)}
              {...dropProps(m.seat)}
              className={`absolute flex cursor-grab flex-col gap-[0.2cqw] rounded-[0.6cqw] border bg-surface/95 px-[0.8cqw] py-[0.6cqw] text-left shadow-[0_1px_0_#cdb48f] hover:border-ink active:cursor-grabbing ${selected ? "border-ink" : "border-[#d8c4a4]"} ${card.anchor}`}
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
        const target = over === seat;
        const look = target || selected
          ? "border-solid border-ink bg-ink text-surface"
          : dragging
            ? "border-ink bg-surface text-ink"
            : full
              ? "border-axis/60 bg-surface/60 text-axis"
              : "border-ink-2/50 bg-surface/80 text-ink-2 hover:border-ink hover:text-ink";
        return (
          <button
            key={seat}
            type="button"
            onClick={() => onSelect({ kind: "seat", seat })}
            {...dropProps(seat)}
            aria-label={full ? `${seatLabel(seat)}: the table is full` : `Add someone: ${seatLabel(seat).toLowerCase()}`}
            aria-pressed={selected}
            title={full ? `${MAX_PANEL} people is the limit. Remove someone first.` : undefined}
            className={`absolute flex size-[5cqw] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[0.2cqw] border-dashed text-[2.4cqw] leading-none transition-colors ${look}`}
            style={{ left: pct(at.x, W), top: pct(at.y, H) }}
          >
            {dragging ? "" : "+"}
          </button>
        );
      })}
    </RoomPlan>
  );
}
