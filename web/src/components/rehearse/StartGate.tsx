"use client";

import type { MicState } from "@/lib/rehearse/useRehearsal";

interface Props {
  mic: MicState;
  micError: string | null;
  // The room is live but this page isn't taking turns (it was reloaded mid-run)
  resuming: boolean;
  onAllow: () => void;
  onWithoutMic: () => void;
  onStart: () => void;
  onEnd: () => void;
}

const BUTTON = "rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-60";

// The card over the table before the start: allow the mic (the click that also lets the page play the panel's voices), then wait
// for the presenter's first words. After a reload mid-run, it offers to resume or end instead.
export function StartGate({ mic, micError, resuming, onAllow, onWithoutMic, onStart, onEnd }: Props) {
  if (resuming) {
    return (
      <Card title="The rehearsal is still running.">
        <p className="text-sm text-ink-2">This page was reloaded. Resume to carry on where the panel is (the browser needs a click for the mic again), or end it and get the debrief.</p>
        {micError && <p role="alert" className="text-sm text-bad-ink">{micError}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onAllow} disabled={mic === "asking"} className={`${BUTTON} bg-ink text-surface`}>
            {mic === "asking" ? "Waiting for the browser…" : "Resume"}
          </button>
          <button type="button" onClick={onEnd} className={`${BUTTON} border border-line bg-surface hover:border-ink`}>
            End the session
          </button>
          {mic === "denied" && (
            <button type="button" onClick={onWithoutMic} className={`${BUTTON} text-ink-2 hover:text-ink`}>
              Resume without the mic
            </button>
          )}
        </div>
      </Card>
    );
  }

  if (mic === "ready" || mic === "none") {
    return (
      <Card title={mic === "ready" ? "Listening." : "No mic: the panel can't hear you."}>
        <p className="text-sm text-ink-2">
          {mic === "ready" ? "Start speaking whenever you're ready: introduce yourself and the chair will welcome you." : "Start when you're ready. The screen works as usual, but nobody will react to what you say."}
        </p>
        <div>
          <button type="button" onClick={onStart} className={`${BUTTON} ${mic === "ready" ? "border border-line bg-surface hover:border-ink" : "bg-ink text-surface"}`}>
            Start now
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card title="The panel is seated.">
      <p className="text-sm text-ink-2">Use headphones so the panel&apos;s voices don&apos;t reach your mic. Introduce yourself when you begin: the chair will welcome you.</p>
      {micError && <p role="alert" className="text-sm text-bad-ink">{micError}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onAllow} disabled={mic === "asking"} className={`${BUTTON} bg-ink text-surface`}>
          {mic === "asking" ? "Waiting for the browser…" : mic === "denied" ? "Try the microphone again" : "Allow the microphone"}
        </button>
        {mic === "denied" && (
          <button type="button" onClick={onWithoutMic} className={`${BUTTON} border border-line bg-surface hover:border-ink`}>
            Start without the mic
          </button>
        )}
      </div>
      {mic === "denied" && <p className="text-xs text-muted">Without the mic the panel can&apos;t hear you: for showing the screen only.</p>}
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper/60 p-6 backdrop-blur-[2px]">
      <div className="flex max-w-md flex-col gap-3 rounded-2xl border border-line bg-surface p-6 shadow-lg" role="dialog" aria-label={title}>
        <h2 className="font-display text-2xl leading-tight">{title}</h2>
        {children}
      </div>
    </div>
  );
}
