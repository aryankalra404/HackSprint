"use client";

import { useEffect, useRef } from "react";
import type { Persona, PersonaId } from "@/lib/contract";
import { colorOf } from "@/lib/personas";
import { PersonaAvatar } from "../ui";
import { CARD_W, H, RoomPlan, TABLE_CENTRE, W, cardPlacement, pct, seatPoint } from "../room/RoomPlan";

interface Props {
  personas: Persona[];
  speaking: PersonaId | null;
  hands: PersonaId[];
  // In the middle of the table ("The panel is seated", "Session ended"), if anything
  centre?: string;
  // The speaking voice's loudness right now (read every frame)
  voiceLevel: () => number;
}

// The browser rehearsal's table: the same top-down room as the practice page and the dashboard, with the same faces, colours and
// seats as VR. Whoever speaks gets a ring in their colour that swells with their voice; a raised hand gets a badge and a label.
export function RehearsalTable({ personas, speaking, hands, centre, voiceLevel }: Props) {
  return (
    <RoomPlan occupied={personas.map((p) => p.seat)}>
      {centre && (
        <p
          className="absolute -translate-x-1/2 -translate-y-1/2 text-center font-display text-[1.8cqw] leading-tight whitespace-nowrap text-[#4a3826]"
          style={{ left: pct(TABLE_CENTRE.x, W), top: pct(TABLE_CENTRE.y, H) }}
        >
          {centre}
        </p>
      )}

      {personas.map((p) => {
        const at = seatPoint(p.seat);
        const card = cardPlacement(p.seat);
        const isSpeaking = speaking === p.id;
        const handUp = hands.includes(p.id);
        return (
          <div key={p.id}>
            <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: pct(at.x, W), top: pct(at.y, H) }}>
              {isSpeaking && <SpeakingRing color={colorOf(p.color)} level={voiceLevel} />}
              <PersonaAvatar persona={p} size="7.2cqw" />
              {handUp && (
                <span className="absolute -top-[1.2cqw] -right-[1.2cqw] flex size-[3.2cqw] animate-bounce items-center justify-center rounded-full bg-warn text-ink shadow ring-[0.3cqw] ring-surface">
                  <HandIcon className="size-[2cqw]" />
                </span>
              )}
            </div>
            <div
              className={`absolute flex flex-col gap-[0.2cqw] rounded-[0.6cqw] border px-[0.8cqw] py-[0.6cqw] shadow-[0_1px_0_#cdb48f] ${card.anchor} ${isSpeaking ? "bg-surface" : "border-[#d8c4a4] bg-surface/95"}`}
              style={{ left: pct(card.left, W), top: pct(card.top, H), width: pct(CARD_W, W), ...(isSpeaking ? { borderColor: colorOf(p.color), boxShadow: `0 0 0 0.2cqw ${colorOf(p.color)}` } : {}) }}
            >
              <span className="truncate font-display text-[1.25cqw] leading-tight">{p.display_name}</span>
              <span className="truncate text-[0.9cqw] leading-tight text-muted">{p.role}</span>
              {(p.chair || isSpeaking || handUp) && (
                <span className="mt-[0.2cqw] flex flex-wrap items-center gap-x-[0.6cqw] text-[0.95cqw] leading-tight font-medium">
                  {isSpeaking && (
                    <span className="inline-flex items-center gap-[0.25em]" style={{ color: colorOf(p.color) }}>
                      <span aria-hidden="true" className="size-[0.8em] rounded-full" style={{ background: colorOf(p.color) }} />
                      Speaking
                    </span>
                  )}
                  {handUp && (
                    <span className="inline-flex items-center gap-[0.25em] text-warn-ink">
                      <HandIcon className="size-[1.1em]" />
                      Hand up
                    </span>
                  )}
                  {p.chair && <span className="text-ink-2">Chair</span>}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </RoomPlan>
  );
}

// A ring in the speaker's colour, scaled every frame with their voice (from the player's AnalyserNode)
function SpeakingRing({ color, level }: { color: string; level: () => number }) {
  const ring = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let frame = 0;
    let smooth = 0;
    const draw = () => {
      smooth += (level() - smooth) * 0.35;
      if (ring.current) ring.current.style.transform = `scale(${1.12 + smooth * 0.45})`;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [level]);
  return <span ref={ring} aria-hidden="true" className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 0 0.7cqw ${color}`, opacity: 0.85 }} />;
}

export function HandIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 11V6a2 2 0 0 0-4 0v5" />
      <path d="M14 10V4a2 2 0 0 0-4 0v6" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}
