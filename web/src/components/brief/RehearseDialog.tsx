"use client";

import { useEffect, useRef, useState } from "react";
import type { DraftMember, PrepStep, RehearseIn } from "@/lib/contract";
import type { PrepRun } from "@/lib/prepProgress";
import { colorOf, portraitOf } from "@/lib/personas";
import { clock } from "@/lib/format";
import { btn } from "../ui";

const POLL_MS = 500;
// How long the finished steps stay on screen before the rehearsal opens
const DONE_HOLD_MS = 1500;

interface Props {
  members: DraftMember[];
  headset: { connected: boolean; via: "wifi" | "usb" };
  // Is there a deck in the room? Without one the dialog asks first.
  hasDeck: boolean;
  // When n8n last prepared exactly this rehearsal, or null; asked each time the dialog opens
  findReusable: () => Promise<string | null>;
  // Starts n8n's prep for this run (or reuses the last one, unless `fresh`); answers with where to rehearse, or an error
  onStart: (where: RehearseIn, runId: string, fresh: boolean) => Promise<{ ok: true; value: string } | { ok: false; error: string }>;
  onAddDeck: () => void;
  onOpen: (path: string) => void;
  onClose: () => void;
}

// Rehearse: pick where (this laptop or the headset), then watch n8n prepare the rehearsal step by step.
// The same n8n prep runs either way; only where the panel sits differs.
// Mounted only while open, so each opening starts from the choice.
export function RehearseDialog({ members, headset, hasDeck, findReusable, onStart, onAddDeck, onOpen, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [where, setWhere] = useState<RehearseIn | null>(null);
  const [run, setRun] = useState<PrepRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // Going on without a deck, once asked
  const [noDeck, setNoDeck] = useState(false);
  // When n8n prepared this same rehearsal, and whether to ask it again anyway
  const [reusedAt, setReusedAt] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const busy = where != null && !error;

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    let live = true;
    findReusable().then(
      (at) => live && setReusedAt(at),
      () => {},
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening, with the panel as it is then
  }, []);

  async function start(choice: RehearseIn) {
    const runId = `prep-${Date.now().toString(36)}`;
    setWhere(choice);
    setError(null);
    setRun(null);
    setStartedAt(Date.now());
    // Follow the laptop's progress store (never n8n) until the action answers
    let polling = true;
    const poll = async () => {
      while (polling) {
        try {
          const next = (await (await fetch(`/api/prep/progress?run=${runId}`, { cache: "no-store" })).json()) as PrepRun | null;
          if (next && polling) setRun(next);
        } catch {
          // The next poll tries again
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    };
    poll();
    const res = await onStart(choice, runId, fresh);
    polling = false;
    try {
      const last = (await (await fetch(`/api/prep/progress?run=${runId}`, { cache: "no-store" })).json()) as PrepRun | null;
      if (last) setRun(last);
    } catch {
      // Keep the last steps shown
    }
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTimeout(() => onOpen(res.value), DONE_HOLD_MS);
  }

  function reset() {
    setWhere(null);
    setRun(null);
    setError(null);
    setStartedAt(null);
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="rehearse-title"
      // While n8n works, Escape doesn't close it: the rehearsal opens by itself when it's ready
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else {
          reset();
          onClose();
        }
      }}
      className="m-auto w-[min(94vw,44rem)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/50"
    >
      {where == null && !hasDeck && !noDeck ? (
        <NoDeck onAddDeck={onAddDeck} onSkip={() => setNoDeck(true)} onClose={onClose} />
      ) : where == null ? (
        <Choose members={members} headset={headset} onPick={start} onClose={onClose} reusedAt={reusedAt} fresh={fresh} onFresh={setFresh} />
      ) : (
        <Progress
          where={where}
          run={run}
          error={error}
          startedAt={startedAt}
          onRetry={() => start(where)}
          onBack={reset}
        />
      )}
    </dialog>
  );
}

// No deck in the room: say what that changes, and offer to add one first
function NoDeck({ onAddDeck, onSkip, onClose }: { onAddDeck: () => void; onSkip: () => void; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-5 p-5 sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="rehearse-title" className="font-display text-2xl leading-tight">
            Rehearse without a deck?
          </h2>
          <p className="text-sm text-ink-2">
            n8n plans the rehearsal around your slides. Without them, the TV in the room stays blank, the panel keeps every question for the end
            (questions during the pitch follow the slides), and n8n has only the brief to go on.
          </p>
        </div>
        <CloseButton onClick={onClose} />
      </header>
      <footer className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onSkip} className={btn("secondary")}>
          Rehearse without one
        </button>
        <button type="button" onClick={onAddDeck} className={btn("primary")}>
          Add your deck
        </button>
      </footer>
    </div>
  );
}

function Choose({
  members,
  headset,
  onPick,
  onClose,
  reusedAt,
  fresh,
  onFresh,
}: Pick<Props, "members" | "headset" | "onClose"> & { onPick: (w: RehearseIn) => void; reusedAt: string | null; fresh: boolean; onFresh: (fresh: boolean) => void }) {
  return (
    <div className="flex flex-col gap-5 p-5 sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="rehearse-title" className="font-display text-2xl leading-tight">
            Where do you want to rehearse?
          </h2>
          <p className="text-sm text-ink-2">n8n prepares the same rehearsal either way: the slides, the panel&apos;s questions and their voices.</p>
        </div>
        <CloseButton onClick={onClose} />
      </header>
      {reusedAt && (
        <div className="flex flex-col gap-2 rounded-xl bg-paper px-4 py-3 text-sm">
          <p>
            <span className="font-medium">Nothing has changed since n8n prepared this at {when(reusedAt)}.</span>{" "}
            <span className="text-ink-2">Same panel, deck, pitch length and goal, and no debrief since, so that rehearsal is reused with no n8n run.</span>
          </p>
          <label className="inline-flex items-center gap-2 text-ink-2">
            <input type="checkbox" checked={fresh} onChange={(e) => onFresh(e.target.checked)} className="size-4 accent-ink" />
            Ask n8n to prepare it again anyway
          </label>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Option
          onClick={() => onPick("browser")}
          title="On this laptop"
          body="Talk to the panel in the browser, with your mic."
          picture={<LaptopPicture members={members} />}
          status={<span className="text-ink-2">Nothing else needed</span>}
        />
        <Option
          onClick={() => onPick("vr")}
          title="In the VR boardroom"
          body="Sit at the table with the panel on the Quest."
          picture={
            // eslint-disable-next-line @next/next/no-img-element -- a static render of the boardroom
            <img src="/vr/room_wide.jpg" alt="" className="size-full object-cover" />
          }
          status={
            headset.connected ? (
              <span className="inline-flex items-center gap-1.5 text-good-ink">
                <Check /> Headset connected ({headset.via === "wifi" ? "Wi-Fi" : "USB"})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-warn-ink">
                <Dash /> Headset not connected yet: it joins when you open DryRun on it
              </span>
            )
          }
        />
      </div>
    </div>
  );
}

function Option({ onClick, title, body, picture, status }: { onClick: () => void; title: string; body: string; picture: React.ReactNode; status: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-left transition hover:border-ink focus-visible:border-ink"
    >
      <span className="block aspect-[16/10] overflow-hidden bg-paper">{picture}</span>
      <span className="flex flex-1 flex-col gap-1 p-4">
        <span className="flex items-center justify-between gap-2">
          <span className="font-display text-lg">{title}</span>
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3.5L10.5 8 6 12.5" />
          </svg>
        </span>
        <span className="text-sm text-ink-2">{body}</span>
        <span className="mt-2 text-xs">{status}</span>
      </span>
    </button>
  );
}

// A laptop with this panel on its screen, seated as they will be in the browser
function LaptopPicture({ members }: { members: DraftMember[] }) {
  const seated = [...members].sort((a, b) => a.seat - b.seat).slice(0, 6);
  return (
    <span className="flex size-full items-center justify-center p-5">
      <span className="flex w-full max-w-[15rem] flex-col items-center">
        <span className="flex aspect-[16/10] w-full items-center justify-center rounded-t-lg border-[5px] border-b-0 border-ink bg-[#e9e8e2]">
          <span className="flex flex-wrap items-center justify-center gap-1.5 px-3">
            {seated.map((m) => {
              const portrait = portraitOf(m.avatar);
              return (
                <span key={m.id} className="size-7 overflow-hidden rounded-full bg-surface" style={{ boxShadow: `0 0 0 2px ${colorOf(m.color)}` }}>
                  {portrait && (
                    // eslint-disable-next-line @next/next/no-img-element -- small static portraits
                    <img src={portrait} alt="" className="size-full object-cover" />
                  )}
                </span>
              );
            })}
          </span>
        </span>
        <span className="h-2 w-[112%] rounded-b-md bg-ink" />
      </span>
    </span>
  );
}

function Progress({
  where,
  run,
  error,
  startedAt,
  onRetry,
  onBack,
}: {
  where: RehearseIn;
  run: PrepRun | null;
  error: string | null;
  startedAt: number | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  const done = run?.state === "done" && !error;
  const elapsed = useSeconds(startedAt, !done && !error);
  const steps: PrepStep[] = run?.steps ?? [{ id: "start", label: "Sending the panel and your deck to n8n", state: "running" }];
  return (
    <div className="flex flex-col gap-5 p-5 sm:p-6" aria-live="polite">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs text-ink-2">{where === "browser" ? "Rehearsing on this laptop" : "Rehearsing in the VR boardroom"}</p>
          <h2 id="rehearse-title" className="font-display text-2xl leading-tight">
            {error ? "n8n couldn't prepare it" : done ? "Your rehearsal is ready" : "n8n is preparing your rehearsal"}
          </h2>
        </div>
        <span className="shrink-0 rounded-full border border-line px-2.5 py-1 font-display text-sm tabular-nums">{clock(elapsed)}</span>
      </header>

      <ol className="flex flex-col">
        {steps.map((s, i) => (
          <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden="true" className="absolute top-6 bottom-0 left-[11px] w-px bg-line" />}
            <StepIcon state={s.state} />
            <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
              <span className={`text-sm ${s.state === "pending" ? "text-muted" : s.state === "error" ? "text-bad-ink" : "font-medium"}`}>
                {s.label}
                {s.state === "running" && <span className="animate-pulse">…</span>}
              </span>
              {s.detail && <span className="text-sm text-ink-2">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        {run?.n8n_url ? (
          <a href={run.n8n_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-ink-2 underline-offset-2 hover:text-ink hover:underline">
            Watch this run in n8n
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3.5h6.5V10M12.5 3.5L4 12" />
            </svg>
          </a>
        ) : (
          <span className="text-sm text-muted">{done ? "" : "Every step runs in n8n."}</span>
        )}
        {error ? (
          <span className="flex gap-2">
            <button type="button" onClick={onBack} className={btn("secondary")}>
              Back
            </button>
            <button type="button" onClick={onRetry} className={btn("primary")}>
              Try again
            </button>
          </span>
        ) : done ? (
          <span className="text-sm font-medium">Opening the rehearsal…</span>
        ) : null}
        {error && <p role="alert" className="w-full text-sm text-bad-ink">{error}</p>}
      </footer>
    </div>
  );
}

function StepIcon({ state }: { state: PrepStep["state"] }) {
  if (state === "running")
    return <span aria-hidden="true" className="mt-0.5 size-[22px] shrink-0 animate-spin rounded-full border-2 border-line border-t-ink" />;
  if (state === "done")
    return (
      <span aria-hidden="true" className="mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-ink text-surface">
        <Check />
      </span>
    );
  if (state === "error")
    return (
      <span aria-hidden="true" className="mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-bad text-surface">
        <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </svg>
      </span>
    );
  return <span aria-hidden="true" className="mt-0.5 size-[22px] shrink-0 rounded-full border-2 border-dashed border-line bg-surface" />;
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

function Dash() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 8h8" />
    </svg>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-paper hover:text-ink">
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  );
}

// "14:32", or "14:32, 15 Oct" on another day
function when(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${time}, ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

// Whole seconds since `from`, ticking while `running`
function useSeconds(from: number | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [running]);
  return from ? Math.max(0, (now - from) / 1000) : 0;
}
