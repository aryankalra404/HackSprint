"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PersonaId, Room, SessionRecord } from "@/lib/contract";
import { buildFeed } from "@/lib/feed";
import { PersonaAvatar, StancePill } from "../ui";
import { RoomBoard } from "./RoomBoard";
import { AgentFeed } from "./AgentFeed";
import { BottomStrip } from "./BottomStrip";
import { PersonaDrawer } from "./PersonaDrawer";
import { NameCardsToggle } from "../room/NameCardsToggle";
import { SessionControls } from "./SessionControls";
import { HeadsetView } from "./HeadsetView";

// One screen for the room: it sits on the big display while the presenter is in VR.
// Prep (briefed, waiting) and debrief share the layout. For the session in the laptop's room, the header also starts and ends it,
// and the room panel shows what the presenter sees in the headset (the room plan is one click away).
export function Dashboard({ session, nameCards, room }: { session: SessionRecord; nameCards: boolean; room: Room | null }) {
  const [open, setOpen] = useState<PersonaId | null>(null);
  const feed = useMemo(() => buildFeed(session), [session]);
  const { bundle, debrief } = session;
  const streamable = room !== null && !debrief;
  const [view, setView] = useState<"headset" | "plan">(streamable ? "headset" : "plan");

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <Link href="/" className="font-display text-2xl">DryRun</Link>
          <span className="text-sm text-ink-2">Pitch to {bundle.prospect.company}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NameCardsToggle initial={nameCards} />
          {room && !debrief ? (
            <SessionControls initial={room} />
          ) : (
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs">
              <span aria-hidden="true" className={`size-2 rounded-full ${debrief ? "bg-good" : "animate-pulse bg-warn"}`} />
              {debrief ? "Debrief ready" : "Waiting for the presenter"}
            </p>
          )}
        </div>
      </header>

      <main className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-4" aria-label="The room">
          {streamable && <ViewSwitch view={view} onChange={setView} />}
          {streamable && view === "headset" ? (
            <div className="flex min-h-[50vh] flex-1 flex-col lg:min-h-0">
              <HeadsetView name={bundle.prospect.company} />
            </div>
          ) : (
            <>
              <div className="hidden min-h-0 flex-1 md:block">
                <RoomBoard session={session} onOpen={setOpen} />
              </div>
              <ul className="flex flex-col divide-y divide-line md:hidden">
                {bundle.personas.map((p) => {
                  const verdict = debrief?.stakeholders.find((s) => s.persona_id === p.id);
                  return (
                    <li key={p.id}>
                      <button type="button" onClick={() => setOpen(p.id)} className="flex w-full items-center gap-3 py-3 text-left">
                        <PersonaAvatar persona={p} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{p.display_name}</span>
                          <span className="block truncate text-xs text-muted">{verdict ? p.role : p.objections[0]?.text}</span>
                        </span>
                        {verdict && <StancePill stance={verdict.stance} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
        <AgentFeed items={feed} />
      </main>

      <BottomStrip session={session} />

      {open && <PersonaDrawer session={session} id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// Headset view or room plan. Leaving the headset view unmounts it, which stops the headset encoding.
function ViewSwitch({ view, onChange }: { view: "headset" | "plan"; onChange: (view: "headset" | "plan") => void }) {
  const options = [
    { id: "headset", label: "Headset view" },
    { id: "plan", label: "Room plan" },
  ] as const;
  return (
    <div role="tablist" aria-label="What the room panel shows" className="inline-flex self-start rounded-full border border-line bg-paper p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={view === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-full px-3 py-1 ${view === o.id ? "bg-ink text-surface" : "text-ink-2 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
