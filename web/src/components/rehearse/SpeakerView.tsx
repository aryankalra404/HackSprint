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
  onGo: (index: number) => void;
}

// What the presenter sees while pitching, like the confidence monitor in VR: the slide, how long they've been on it against n8n's
// target, the next slide, last time's talk track and, when they freeze, the Rescue Agent's cue under the slide.
export function SpeakerView({ bundle, deck, slide, count, live, cue, wrapUp, onGo }: Props) {
  const planned = bundle.slides[slide];
  const image = deck?.slides[slide];
  const next = slide + 1 < count ? { image: deck?.slides[slide + 1], title: bundle.slides[slide + 1]?.title } : null;
  const target = planned?.target_seconds ?? 0;
  const onSlide = useTimeOnSlide(slide, live);
  const over = live && target > 0 && onSlide > target;

  return (
    <section aria-label="Speaker view" className="flex min-h-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {count > 0 ? `Slide ${slide + 1} of ${count}` : "No deck"}
          {planned?.title && <span className="ml-2 font-normal text-ink-2">{planned.title}</span>}
        </h2>
        <p className={`inline-flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap ${over ? "font-medium text-warn-ink" : "text-ink-2"}`} aria-live="off">
          {over && (
            <>
              <StatusIcon tone="warn" />
              Over time:{" "}
            </>
          )}
          {live ? `${clock(onSlide)} of ${clock(target)}` : target ? `Target ${clock(target)}` : null}
        </p>
      </div>

      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- slide images come from the laptop, sized by the parent
        <img
          src={image.image_url}
          alt={`Slide ${slide + 1}`}
          className="max-h-[42vh] min-h-0 w-full rounded-md border border-line bg-paper object-contain"
          style={{ aspectRatio: `${image.width} / ${image.height}` }}
        />
      ) : (
        <div className="flex min-h-0 flex-col gap-2 rounded-md border border-line bg-paper p-4">
          <p className="font-display text-lg leading-tight">{planned?.title ?? (count > 0 ? `Slide ${slide + 1}` : `A ${Math.round(bundle.pitch_seconds / 60)} min pitch`)}</p>
          {planned?.key_points.length ? (
            <ul className="list-disc pl-5 text-sm text-ink-2">
              {planned.key_points.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{count > 0 ? "No notes for this slide: talk to the time." : "No slides: talk to the time."}</p>
          )}
        </div>
      )}

      {/* The cue sits under the slide, never over it */}
      <div className="min-h-[3.25rem]" aria-live="polite">
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

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
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
      <div className={`mt-auto flex gap-2 ${count === 0 ? "hidden" : ""}`}>
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
