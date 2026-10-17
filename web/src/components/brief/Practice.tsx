"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BriefInput, DraftMember, PanelProposal, PanelSuggestion, PitchSuggestion, Room, Seat, TwinSummary } from "@/lib/contract";
import { ALL_COLORS, ALL_SEATS, AVATARS, MAX_PANEL } from "@/lib/personas";
import { briefPanelAction, reusablePrepAction } from "@/app/m/actions";
import { PanelTable, type Selection } from "./PanelTable";
import { PanelEditor } from "./PanelEditor";
import { useRoom } from "@/lib/useRoom";
import { NameCardsToggle } from "../room/NameCardsToggle";
import { PositionControl } from "../room/PositionControl";
import { DeckPanel } from "../room/DeckPanel";
import { PitchLength } from "./PitchLength";
import { RehearseDialog } from "./RehearseDialog";
import { AppHeader } from "../shell";
import { btn } from "../ui";

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
  // What DryRun knows of each real attendee, by address (0.27): their seat says "From their twin"
  twins?: Record<string, TwinSummary>;
}

// Practise a meeting: its panel (real attendees plus practice roles) on the table, editable, then briefed.
// Every edit is saved to the room on the laptop, and the headset seats the panel as it changes.
export function Practice({ meeting, input, draft, pitch, panel, nameCards, room: initialRoom, twins = {} }: Props) {
  const proposal = draft;
  const room = useRoom(initialRoom);
  const [members, setMembers] = useState<DraftMember[]>(panel);
  const [selection, setSelection] = useState<Selection>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<"saved" | "saving" | "failed">("saved");
  const [headset, setHeadset] = useState<{ connected: boolean; via: "wifi" | "usb" }>({ connected: false, via: "usb" });
  // The rehearse dialog: where to rehearse, then n8n's prep step by step
  const [choosing, setChoosing] = useState(false);
  const router = useRouter();

  // Next keeps this page's state when it's left (Activity): the dialog closes then, so coming back shows the table, not the last prep
  useLayoutEffect(() => () => setChoosing(false), []);

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

  const notReady = members.length === 0 || members.some((m) => !m.role.trim());

  // Someone new gets the chosen chair and a free colour. A suggestion from n8n comes as a whole person (name, face, what they push on),
  // keeping their face if it's free; a role typed in gets a free face (one with a portrait if there is one) and n8n names them.
  function add(s: PanelSuggestion) {
    if (members.length >= MAX_PANEL) return;
    const seat = selection?.kind === "seat" ? selection.seat : ALL_SEATS.find((x) => !members.some((m) => m.seat === x));
    const color = ALL_COLORS.find((c) => !members.some((m) => m.color === c));
    const free = AVATARS.filter((a) => !members.some((m) => m.avatar === a.id));
    const own = free.find((a) => a.id === s.avatar);
    const avatar = (own ?? free.find((a) => a.portrait && (!s.gender || a.gender === s.gender)) ?? free.find((a) => a.portrait) ?? free[0])?.id;
    if (seat == null || color == null || !avatar) return;
    const id = `p${Math.max(0, ...members.map((m) => Number(m.id.slice(1)) || 0)) + 1}`;
    const person: DraftMember = { id, seat, color, avatar, role: s.role, role_short: s.role_short, display_name: s.display_name ?? "", difficulty: 2,
      ...(s.why ? { why: s.why } : {}), ...(s.gender ? { gender: s.gender } : {}), ...(s.will_push_on ? { will_push_on: s.will_push_on } : {}), source: "typical" };
    setMembers((ms) => [...ms, person]);
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
      <AppHeader
        className="-mt-4"
        trail={[{ label: "Meetings", href: "/" }, { label: meeting.title, href: `/m/${encodeURIComponent(meeting.id)}` }, { label: "Practice" }]}
        actions={
          <>
          <NameCardsToggle initial={nameCards} />
          <PositionControl height={initialRoom.height_offset} side={initialRoom.side_offset} />
          <p className="inline-flex items-center gap-2 h-8 rounded-full border border-line bg-surface px-3 text-xs" aria-live="polite">
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
          </>
        }
      />

      <main className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* On a short window the column scrolls; the table never shrinks below the room plan's own minimum */}
        <div className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto">
          <section className="flex flex-1 shrink-0 flex-col rounded-2xl border border-line bg-surface p-4 md:min-h-[454px]" aria-label="The table">
            <div className="hidden min-h-0 flex-1 md:block">
              <PanelTable members={members} selection={selection} onSelect={setSelection} onMove={move} twins={twins} />
            </div>
          </section>
          <div id="deck">
            <DeckPanel room={room} />
          </div>
        </div>
        <aside className="flex min-h-0 flex-col rounded-2xl border border-line bg-surface">
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <PanelEditor
              company={meeting.company}
              twins={twins}
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
              onClick={() => {
                setError(null);
                setChoosing(true);
              }}
              disabled={notReady}
              className={btn("primary", "lg")}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="currentColor">
                <path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z" />
              </svg>
              Rehearse
            </button>
            {notReady && <p className="text-xs text-muted">Give everyone at the table a role first.</p>}
            {choosing && (
              <RehearseDialog
                members={members}
                headset={headset}
                hasDeck={room.deck != null}
                findReusable={() => reusablePrepAction(input, proposal.draft_id, members)}
                onStart={(where, runId, fresh) => briefPanelAction(input, proposal.draft_id, members, where, runId, fresh)}
                onAddDeck={() => {
                  setChoosing(false);
                  document.getElementById("deck")?.scrollIntoView({ behavior: "smooth", block: "center" });
                  // Still in the click, so the browser lets the file picker open
                  document.querySelector<HTMLInputElement>("#deck input[type=file]")?.click();
                }}
                onOpen={(path) => router.push(path)}
                onClose={() => setChoosing(false)}
              />
            )}
          </footer>
        </aside>
      </main>
    </div>
  );
}
