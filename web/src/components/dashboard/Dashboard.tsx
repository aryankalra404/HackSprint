"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PersonaId, Room, SessionRecord } from "@/lib/contract";
import { buildDebriefFeed, buildFeed, buildLiveFeed } from "@/lib/feed";
import { useRoom } from "@/lib/useRoom";
import { PersonaAvatar, StancePill } from "../ui";
import { RoomBoard } from "./RoomBoard";
import { AgentFeed } from "./AgentFeed";
import { BottomStrip } from "./BottomStrip";
import { PersonaDrawer } from "./PersonaDrawer";
import { NameCardsToggle } from "../room/NameCardsToggle";
import { PositionControl } from "../room/PositionControl";
import { SessionControls } from "./SessionControls";
import { HeadsetView } from "./HeadsetView";
import { DeckPanel } from "../room/DeckPanel";
import { AppHeader } from "../shell";

type View = "headset" | "plan";

const STAGE = { opening: "the opening", pitch: "the pitch", questions: "questions", closing: "closing" } as const;

// One screen for the room: it sits on the big display while the presenter is in VR.
// Prep (briefed, waiting) and debrief share the layout. For the session in the laptop's room, the dashboard follows the room:
// the header starts, ends and restarts it, and the room panel shows the room plan while waiting and switches to what the
// presenter sees in the headset once the session is live (the headset only streams while that view is open).
export function Dashboard({
  session,
  nameCards,
  heightOffset,
  sideOffset,
  room: initialRoom,
  meetingId = null,
}: {
  session: SessionRecord;
  nameCards: boolean;
  heightOffset: number;
  sideOffset: number;
  room: Room | null;
  meetingId?: string | null;
}) {
  const [open, setOpen] = useState<PersonaId | null>(null);
  const room = useRoom(initialRoom);
  const { bundle, debrief } = session;
  // While this session is in the room, the feed follows the rehearsal turn by turn
  const live = room?.session_id === bundle.session_id ? room.live : null;
  const debriefing = room?.session_id === bundle.session_id ? room.debrief : null;
  const feed = useMemo(
    () => [...buildFeed(session), ...(live ? buildLiveFeed(live, room?.bundle ?? bundle) : []), ...(debriefing ? buildDebriefFeed(debriefing) : [])],
    [session, live, room?.bundle, bundle, debriefing],
  );
  const status = live
    ? room?.phase === "live"
      ? `Live: ${STAGE[live.stage]}`
      : debriefing?.state === "running"
        ? "n8n is debriefing"
        : "Rehearsal over"
    : undefined;
  // A browser rehearsal has no headset view: the room plan follows who speaks and who has a hand up instead
  const browser = room?.rehearse_in === "browser";
  const streamable = room !== null && !debrief && !browser;
  // A click on the switch wins until the session moves on (to its next phase, or a new run)
  const moment = `${room?.phase}:${room?.live?.started_at ?? ""}`;
  const [picked, setPicked] = useState<{ view: View; moment: string } | null>(null);
  const view: View = picked?.moment === moment ? picked.view : room?.phase === "live" ? "headset" : "plan";
  const setView = (next: View) => setPicked({ view: next, moment });

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:h-dvh">
      <AppHeader
        className="-mt-4"
        trail={[
          { label: "Meetings", href: "/" },
          meetingId ? { label: `Pitch to ${bundle.prospect.company}`, href: `/m/${encodeURIComponent(meetingId)}` } : { label: `Pitch to ${bundle.prospect.company}` },
          { label: "Dashboard" },
        ]}
        actions={
          <>
          {room && !debrief && <DeckPanel room={room} compact />}
          <NameCardsToggle initial={nameCards} />
          <PositionControl height={heightOffset} side={sideOffset} />
          {room && !debrief ? (
            <SessionControls room={room} />
          ) : (
            <p className="inline-flex items-center gap-2 h-8 rounded-full border border-line bg-surface px-3 text-xs">
              <span aria-hidden="true" className={`size-2 rounded-full ${debrief ? "bg-good" : "animate-pulse bg-warn"}`} />
              {debrief ? "Debrief ready" : "Waiting for the presenter"}
            </p>
          )}
          </>
        }
      />

      <main className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-4" aria-label="The room">
          {streamable && (
            <div className="flex flex-wrap items-center gap-3">
              <ViewSwitch view={view} onChange={setView} />
              {view === "plan" && room?.phase === "briefed" && <p className="text-xs text-muted">The headset view opens when the session starts.</p>}
              {room?.phase === "briefed" && <RehearseHere sessionId={bundle.session_id} switchFirst />}
            </div>
          )}
          {browser && room && !debrief && (room.phase === "briefed" || room.phase === "live") && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
              <span>Rehearsing in the browser.</span>
              <RehearseHere sessionId={bundle.session_id} label={room.phase === "live" ? "Open the rehearsal page" : "Rehearse in the browser"} />
            </div>
          )}
          {streamable && view === "headset" ? (
            <div className="flex min-h-[50vh] flex-1 flex-col lg:min-h-0">
              <HeadsetView name={bundle.prospect.company} />
            </div>
          ) : (
            <>
              <div className="hidden min-h-0 flex-1 md:block">
                <RoomBoard session={session} phase={room?.phase} rehearseIn={room?.rehearse_in} now={live?.now} onOpen={setOpen} />
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
        <AgentFeed items={feed} status={status} />
      </main>

      <BottomStrip session={session} />

      {open && <PersonaDrawer session={session} id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// To the browser's rehearsal page; for a panel set up for the headset, it moves the room to the browser first
function RehearseHere({ sessionId, switchFirst = false, label = "Rehearse in the browser instead" }: { sessionId: string; switchFirst?: boolean; label?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const href = `/s/${sessionId}/rehearse`;
  if (!switchFirst)
    return (
      <Link href={href} className="text-xs font-medium text-ink underline underline-offset-2">
        {label}
      </Link>
    );
  async function go() {
    setError(null);
    try {
      const res = await fetch("/api/room/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rehearse_in: "browser" }) });
      if (!res.ok) return setError(((await res.json()) as { error?: string }).error ?? "That didn't work.");
      router.push(href);
    } catch {
      setError("Couldn't reach the laptop's room.");
    }
  }
  return (
    <>
      <button type="button" onClick={go} className="text-xs font-medium text-ink underline underline-offset-2">
        {label}
      </button>
      {error && <span role="alert" className="text-xs text-bad-ink">{error}</span>}
    </>
  );
}

// Headset view or room plan. Leaving the headset view unmounts it, which stops the headset encoding.
function ViewSwitch({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  const options = [
    { id: "headset", label: "Headset view" },
    { id: "plan", label: "Room plan" },
  ] as const;
  return (
    <div role="tablist" aria-label="What the room panel shows" className="inline-flex h-8 items-center rounded-full border border-line bg-paper p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={view === o.id}
          onClick={() => onChange(o.id)}
          className={`h-full rounded-full px-3 font-medium ${view === o.id ? "bg-ink text-surface" : "text-ink-2 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
