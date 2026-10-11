"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { BriefInput, DraftMember, PanelProposal, PitchSuggestion, Room, Seat } from "@/lib/contract";
import { ALL_COLORS, ALL_SEATS, AVATARS, MAX_PANEL } from "@/lib/personas";
import { briefPanelAction } from "@/app/m/actions";
import { PanelTable, type Selection } from "./PanelTable";
import { PanelEditor } from "./PanelEditor";
import { useRoom } from "@/lib/useRoom";
import { NameCardsToggle } from "../room/NameCardsToggle";
import { HeightControl } from "../room/HeightControl";
import { DeckPanel } from "../room/DeckPanel";
import { PitchLength } from "./PitchLength";
import { SAMPLE_ID } from "@/lib/mock/sample";

type Draft = Pick<PanelProposal, "draft_id" | "suggestions">;

interface Props {
  meeting: { id: string; title: string; company: string };
  // The practice panel as it is in the room, so a reload carries on where it left off
  input: BriefInput;
  draft: Draft;
  // n8n's suggested pitch length for this meeting, if it gave one
  pitch?: PitchSuggestion;
  panel: DraftMember[];
  nameCards: boolean;
  // The laptop's room, followed live for the deck (the headset changes the slide too)
  room: Room;
}

// Practise a meeting: its panel (real attendees plus practice roles) on the table, editable, then briefed.
// Every edit is saved to the room on the laptop, and the headset seats the panel as it changes.
export function Practice({ meeting, input, draft, pitch, panel, nameCards, room: initialRoom }: Props) {
  const proposal = draft;
  const room = useRoom(initialRoom);
  const [members, setMembers] = useState<DraftMember[]>(panel);
  const [selection, setSelection] = useState<Selection>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<"saved" | "saving" | "failed">("saved");
  const [headset, setHeadset] = useState<{ connected: boolean; via: "wifi" | "usb" }>({ connected: false, via: "usb" });
  const [briefing, startBriefing] = useTransition();

  // Is the headset following the room? Checked every few seconds while editing.
  useEffect(() => {
    let live = true;
    const check = async () => {
      try {
        const status = await (await fetch("/api/room/headset", { cache: "no-store" })).json();
        if (live) setHeadset(status);
      } catch {
        if (live) setHeadset({ connected: false, via: "usb" });
      }
    };
    check();
    const timer = setInterval(check, 4000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [proposal]);

  // Save edits to the room, a moment after the last change
  const lastSaved = useRef(JSON.stringify(members));
  useEffect(() => {
    const body = JSON.stringify(members);
    if (body === lastSaved.current) return;
    setSaved("saving");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/room/panel", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ panel: members }) });
        if (!res.ok) throw new Error((await res.json()).error);
        lastSaved.current = body;
        setSaved("saved");
      } catch {
        setSaved("failed");
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [members, proposal]);

  // The sample's run is scripted for its own five, briefed on the laptop
  const sample = meeting.id === SAMPLE_ID;

  function brief() {
    setError(null);
    startBriefing(async () => {
      const res = await briefPanelAction(input, proposal.draft_id, members);
      if (!res.ok) setError(res.error);
    });
  }

  // Someone new gets the chosen chair, a free colour and a free face (one with a portrait if there is one)
  function add(role: string, roleShort: string, why?: string) {
    if (members.length >= MAX_PANEL) return;
    const seat = selection?.kind === "seat" ? selection.seat : ALL_SEATS.find((s) => !members.some((m) => m.seat === s));
    const color = ALL_COLORS.find((c) => !members.some((m) => m.color === c));
    const free = AVATARS.filter((a) => !members.some((m) => m.avatar === a.id));
    const avatar = (free.find((a) => a.portrait) ?? free[0])?.id;
    if (seat == null || color == null || !avatar) return;
    const id = `p${Math.max(0, ...members.map((m) => Number(m.id.slice(1)) || 0)) + 1}`;
    setMembers((ms) => [...ms, { id, seat, color, avatar, role, role_short: roleShort, display_name: "", difficulty: 2, why }]);
    setSelection({ kind: "person", id });
  }

  // Move someone to a chair; whoever sat there takes their old chair
  function move(id: string, seat: Seat) {
    setMembers((ms) => {
      const from = ms.find((m) => m.id === id)?.seat;
      if (from == null || from === seat) return ms;
      return ms.map((m) => (m.id === id ? { ...m, seat } : m.seat === seat ? { ...m, seat: from } : m));
    });
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <Link href="/" className="font-display text-2xl">DryRun</Link>
          <span className="text-sm text-ink-2">Practise: {meeting.title}, {meeting.company}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <NameCardsToggle initial={nameCards} />
          <HeightControl initial={initialRoom.height_offset} />
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs" aria-live="polite">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${saved === "failed" ? "bg-bad" : saved === "saving" ? "animate-pulse bg-warn" : headset.connected ? "bg-good" : "bg-axis"}`}
            />
            {saved === "failed"
              ? "Couldn't save the table"
              : saved === "saving"
                ? "Saving…"
                : headset.connected
                  ? `Live in the headset (${headset.via === "wifi" ? "Wi-Fi" : "USB"})`
                  : "Saved. Headset not connected"}
          </p>
          <Link href={`/m/${encodeURIComponent(meeting.id)}`} className="text-sm text-ink-2 hover:text-ink">
            ← The brief
          </Link>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-h-0 flex-col gap-4">
          <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-line bg-surface p-4" aria-label="The table">
            <div className="hidden min-h-0 flex-1 md:block">
              <PanelTable members={members} selection={selection} onSelect={setSelection} onMove={move} />
            </div>
          </section>
          <DeckPanel room={room} />
        </div>
        <aside className="flex min-h-0 flex-col rounded-2xl border border-line bg-surface">
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <PanelEditor
              company={meeting.company}
              members={members}
              suggestions={proposal.suggestions}
              selection={selection}
              onSelect={setSelection}
              onChange={(id, patch) => setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)))}
              onMove={move}
              onRemove={(id) => {
                setMembers((ms) => ms.filter((m) => m.id !== id));
                setSelection(null);
              }}
              onAdd={add}
            />
          </div>
          <footer className="flex flex-col gap-3 border-t border-line p-5">
            <PitchLength initial={initialRoom.pitch_minutes} suggestion={pitch} />
            {error && <p role="alert" className="text-sm text-bad-ink">{error}</p>}
            <button
              type="button"
              onClick={brief}
              disabled={briefing || members.length === 0 || members.some((m) => !m.role.trim())}
              className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-surface disabled:opacity-50"
            >
              {briefing ? (sample ? "Seating the sample…" : "n8n is planning the rehearsal…") : `Start the rehearsal (${sample ? 5 : members.length})`}
            </button>
            <p className="text-xs text-muted">
              {sample
                ? "The sample seats these five with their slides and recorded voices, whatever you change, and the headset plays a scripted run without you speaking. Nothing calls n8n or an AI."
                : briefing
                  ? "It plans each slide, what everyone will push on and when they ask. About 20 seconds."
                  : "Then put on the headset: the panel is already seated."}
            </p>
          </footer>
        </aside>
      </main>
    </div>
  );
}
