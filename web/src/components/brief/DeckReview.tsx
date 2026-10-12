"use client";

import { useEffect, useState } from "react";
import type { DeckReview as Review } from "@/lib/contract";
import type { StoredReview } from "@/lib/deckReview";
import { slideLabel } from "@/lib/format";

// Where the deck will get pushback (contract 0.26): n8n's check of the slides against the brief's research, with sources. On the
// practice page it follows n8n while it works (a laptop read, no n8n execution); the brief page passes the stored review in.
export function DeckReview({ meetingId, initial, live = false }: { meetingId: string; initial: StoredReview | null; live?: boolean }) {
  const [stored, setStored] = useState(initial);
  useEffect(() => {
    if (!live) return;
    let on = true;
    const read = async () => {
      try {
        const res = await fetch(`/api/deck-review?meeting=${encodeURIComponent(meetingId)}`, { cache: "no-store" });
        if (on && res.ok) setStored(await res.json());
      } catch {
        // Try again on the next tick
      }
    };
    read();
    const timer = setInterval(read, 3000);
    return () => {
      on = false;
      clearInterval(timer);
    };
  }, [meetingId, live]);

  if (!stored) return null;
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl leading-tight">Where your deck will get pushback</h2>
        <span className="text-sm text-ink-2">n8n checked {stored.deck_name} against your brief</span>
      </div>
      {stored.state === "running" && <p className="text-sm text-ink-2">n8n is reading your slides against what it found about them…</p>}
      {stored.state === "failed" && <p className="text-sm text-ink-2">n8n couldn&apos;t review this deck. {stored.error}</p>}
      {stored.state === "done" && stored.review && <Items review={stored.review} />}
    </section>
  );
}

function Items({ review }: { review: Review }) {
  if (review.items.length === 0) return <p className="text-sm text-ink-2">Nothing in the research pushes back on your slides.</p>;
  return (
    <>
      {review.summary && <p className="font-display text-xl leading-snug">{review.summary}</p>}
      <ul className="flex flex-col divide-y divide-line">
        {review.items.map((x) => (
          <li key={`${x.slide_index}-${x.claim}`} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
            <p className="text-sm">
              <span className="text-muted">{slideLabel(x.slide_index)}: </span>
              <span className="font-medium">“{x.claim}”</span>
            </p>
            <p className="text-sm text-ink-2">{x.pushback}</p>
            <p className="text-xs text-ink-2">
              {x.who && <span>Who will push: <span className="text-ink">{x.who}</span>. </span>}
              {x.source && (
                <a href={x.source.url} target="_blank" rel="noreferrer" className="underline decoration-line hover:text-ink">
                  {x.source.title}
                </a>
              )}
            </p>
            {x.fix && (
              <p className="rounded-lg bg-paper px-3 py-2 text-sm">
                <span className="font-medium">Fix: </span>
                {x.fix}
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
