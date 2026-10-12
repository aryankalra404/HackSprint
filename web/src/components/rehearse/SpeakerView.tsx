"use client";

import { useEffect, useState } from "react";
import type { Bundle, Deck } from "@/lib/contract";
import type { TurnView } from "@/lib/rehearse/turn-taker";
import { clock } from "@/lib/format";
import { StatusIcon } from "../ui";

interface Props {
  bundle: Bundle;
  deck: Deck | null;
  slide: number;
  count: number;
  // Time on the slide only counts during the run
  live: boolean;
  cue: TurnView["cue"];
  wrapUp: number | null;
  time: TurnView["time"];
  onGo: (index: number) => void;
  // During the pitch: end it now and take the questions
  onTakeQuestions?: () => void;
}

// What the presenter sees while pitching, like the confidence monitor in VR: the slide, how long they've been on it (n8n's time for it
// is only a guide), the pitch against its limit if there is one, the next slide, last time's talk track and, when they freeze, the
// Rescue Agent's cue under the slide.
export function SpeakerView({ bundle, deck, slide, count, live, cue, wrapUp, time, onGo, onTakeQuestions }: Props) {
  const planned = bundle.slides[slide];
  const image = deck?.slides[slide];
  const next = slide + 1 < count ? { image: deck?.slides[slide + 1], title: bundle.slides[slide + 1]?.title } : null;
  const target = planned?.target_seconds ?? 0;
  const onSlide = useTimeOnSlide(slide, live);

  return (
    <section aria-label="Speaker view" className="flex min-h-0 min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm">
            <span className="font-semibold">{count > 0 ? `Slide ${slide + 1} of ${count}` : "No deck"}</span>
            {planned?.title && <span className="ml-2 text-ink-2">{planned.title}</span>}
          </h2>
          <p className="text-xs text-ink-2" aria-live="off">
            {live ? `${clock(onSlide)} on this slide${target ? `, about ${clock(target)} planned` : ""}` : target ? `About ${clock(target)}` : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {time && <PitchClock time={time} />}
          {onTakeQuestions && (
            <button type="button" onClick={onTakeQuestions} className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium whitespace-nowrap hover:border-ink">
              Done? Take questions
            </button>
          )}
        </div>
      </div>

      {image ? (
        // The slide takes all the height the column has left
        <div className="relative min-h-[30vh] flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- slide images come from the laptop, sized by the parent */}
          <img
            src={image.image_url}
            alt={`Slide ${slide + 1}`}
            className="absolute inset-0 m-auto max-h-full max-w-full rounded-md border border-line bg-paper object-contain"
            style={{ aspectRatio: `${image.width} / ${image.height}` }}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-md border border-line bg-paper p-4">
          <p className="font-display text-lg leading-tight">{planned?.title ?? (count > 0 ? `Slide ${slide + 1}` : bundle.time === null ? "No time limit" : `A ${Math.round(bundle.pitch_seconds / 60)} min pitch`)}</p>
          {planned?.key_points.length ? (
            <ul className="list-disc pl-5 text-sm text-ink-2">
              {planned.key_points.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{count > 0 ? "No notes for this slide." : "No slides: just talk."}</p>
          )}
        </div>
      )}

      {/* The cue sits under the slide, never over it */}
      <div className="min-h-[3.25rem] shrink-0" aria-live="polite">
        {wrapUp != null ? (
          <p className="rounded-lg border border-line bg-paper px-3 py-2 text-sm">
            <span className="font-medium">Wrapping up? Questions in {wrapUp}…</span> <span className="text-ink-2">Keep talking to carry on.</span>
          </p>
        ) : cue ? (
          <p className="flex items-start gap-2 rounded-lg border border-line bg-paper px-3 py-2">
            <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-ink-2">
              <CueIcon />
              Cue
            </span>
            <span className={cue.level === 1 ? "text-sm text-muted" : cue.level === 2 ? "font-display text-lg leading-snug" : "text-base font-medium"}>
              {cue.level === 3 ? `Try: ${cue.text}` : cue.text}
            </span>
          </p>
        ) : null}
      </div>

      <div className="flex max-h-[22vh] shrink-0 flex-col gap-2 overflow-y-auto">
        {next && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">Next</span>
            {next.image && (
              // eslint-disable-next-line @next/next/no-img-element -- slide images come from the laptop
              <img src={next.image.image_url} alt="" className="h-10 rounded-sm border border-line bg-paper object-contain" style={{ aspectRatio: `${next.image.width} / ${next.image.height}` }} />
            )}
            <span className="truncate text-sm">{next.title ?? `Slide ${slide + 2}`}</span>
          </div>
        )}
        {planned?.notes && (
          <div>
            <p className="text-xs font-semibold text-ink-2">Last time&apos;s talk track</p>
            <p className="text-sm text-ink-2">{planned.notes}</p>
          </div>
        )}
      </div>

      {/* Without a deck there's nothing to page through */}
      <div className={`flex shrink-0 gap-2 ${count === 0 ? "hidden" : ""}`}>
        <button type="button" onClick={() => onGo(slide - 1)} disabled={slide === 0} className="rounded-full border border-line px-4 py-2 text-sm hover:border-ink disabled:opacity-40">
          ← Back
        </button>
        <button type="button" onClick={() => onGo(slide + 1)} disabled={slide >= count - 1} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-surface disabled:opacity-40">
          Next →
        </button>
        <span className="ml-auto self-center text-xs text-muted">Page Down, Page Up or a clicker work too</span>
      </div>
    </section>
  );
}

// The pitch against its limit: amber when it's close, red once it's over (the chair then keeps time, as n8n planned it)
function PitchClock({ time }: { time: NonNullable<TurnView["time"]> }) {
  const label = time.tone === "over" ? "Over time" : time.tone === "near" ? "Nearly at time" : "Pitch";
  const ink = time.tone === "over" ? "text-bad-ink" : time.tone === "near" ? "text-warn-ink" : "text-ink-2";
  return (
    <p className={`inline-flex items-center gap-1.5 text-sm whitespace-nowrap ${ink} ${time.tone === "ok" ? "" : "font-medium"}`} aria-live="off">
      {time.tone !== "ok" && <StatusIcon tone={time.tone === "over" ? "bad" : "warn"} />}
      {label} <span className="font-display tabular-nums">{clock(time.elapsed)}</span> of {clock(time.limit)}
    </p>
  );
}

// Seconds on the current slide, ticking twice a second during the run
function useTimeOnSlide(slide: number, live: boolean): number {
  const [time, setTime] = useState(() => ({ slide, since: 0, now: 0 }));
  useEffect(() => {
    if (!live) return;
    const tick = () =>
      setTime((t) => {
        const now = Date.now();
        return t.slide === slide && t.since > 0 ? { ...t, now } : { slide, since: now, now };
      });
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [slide, live]);
  return live && time.slide === slide ? Math.max(0, (time.now - time.since) / 1000) : 0;
}

function CueIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2.5a4 4 0 0 0-2.5 7.1V11h5V9.6A4 4 0 0 0 8 2.5z" />
      <path d="M6.5 13.5h3" />
    </svg>
  );
}
