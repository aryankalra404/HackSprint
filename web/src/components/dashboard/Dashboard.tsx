"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PersonaId, SessionRecord } from "@/lib/contract";
import { PERSONA_STYLE } from "@/lib/personas";
import { buildFeed } from "@/lib/feed";
import { PersonaAvatar, StancePill } from "../ui";
import { RoomBoard } from "./RoomBoard";
import { AgentFeed } from "./AgentFeed";
import { BottomStrip } from "./BottomStrip";
import { PersonaDrawer } from "./PersonaDrawer";

// One screen for the room: it sits on the big display while the presenter is in VR.
// Prep (briefed, waiting) and debrief share the layout; live comes next.
export function Dashboard({ session }: { session: SessionRecord }) {
  const [open, setOpen] = useState<PersonaId | null>(null);
  const feed = useMemo(() => buildFeed(session), [session]);
  const { bundle, debrief } = session;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <Link href="/" className="font-display text-2xl">DryRun</Link>
          <span className="text-sm text-ink-2">Pitch to {bundle.prospect.company}</span>
        </div>
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-xs">
          <span aria-hidden="true" className={`size-2 rounded-full ${debrief ? "bg-good" : "animate-pulse bg-warn"}`} />
          {debrief ? "Session complete · debrief ready" : `Room briefed · waiting for presenter · code ${bundle.join_code}`}
        </p>
      </header>

      <main className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-0 flex-col rounded-2xl border border-line bg-surface p-4" aria-label="The room">
          <div className="hidden min-h-0 flex-1 md:block">
            <RoomBoard session={session} onOpen={setOpen} />
          </div>
          <ul className="flex flex-col divide-y divide-line md:hidden">
            {bundle.personas.map((p) => {
              const verdict = debrief?.stakeholders.find((s) => s.persona_id === p.id);
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => setOpen(p.id)} className="flex w-full items-center gap-3 py-3 text-left">
                    <PersonaAvatar id={p.id} name={p.display_name} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{p.display_name}</span>
                      <span className="block truncate text-xs text-muted">{verdict ? PERSONA_STYLE[p.id].role : p.objections[0]?.text}</span>
                    </span>
                    {verdict && <StancePill stance={verdict.stance} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <AgentFeed items={feed} />
      </main>

      <BottomStrip session={session} />

      {open && <PersonaDrawer session={session} id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
