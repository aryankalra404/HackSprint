"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DeckFinding } from "@/lib/contract";
import type { StoredResearch } from "@/lib/deckResearch";
import { slideLabel } from "@/lib/format";
import { FindingPill, SectionHead } from "../ui";

// The laptop's copy of n8n's deck research (contract 0.30), followed while n8n works: a laptop read every few seconds, no n8n execution
function useResearch(meetingId: string, initial: StoredResearch | null, live: boolean) {
  const [stored, setStored] = useState(initial);
  useEffect(() => {
    if (!live) return;
    let on = true;
    const read = async () => {
      try {
        const res = await fetch(`/api/deck-research?meeting=${encodeURIComponent(meetingId)}`, { cache: "no-store" });
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
  return stored;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// On the practice page: one line under the deck. The findings belong to the brief; here it only says n8n is on it, and that the panel
// will ask about what it found.
export function DeckResearchLine({ meetingId, initial }: { meetingId: string; initial: StoredResearch | null }) {
  const stored = useResearch(meetingId, initial, true);
  if (!stored) return null;
  const findings = stored.research?.findings ?? [];
  const by = (v: DeckFinding["verdict"]) => findings.filter((f) => f.verdict === v).length;
  const tally = [
    by("challenged") && `${by("challenged")} challenged`,
    by("backed") && `${by("backed")} backed`,
    by("unproven") && `${by("unproven")} with nothing found`,
  ].filter(Boolean);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-line bg-surface px-4 py-3 text-sm" aria-live="polite">
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${stored.state === "running" ? "animate-pulse bg-warn" : stored.state === "failed" ? "bg-bad" : "bg-good"}`} />
      {stored.state === "running" && <span className="text-ink-2">n8n is picking the claims in your deck to check, and searching the news for each…</span>}
      {stored.state === "failed" && <span className="text-ink-2">n8n couldn&apos;t research this deck. {stored.error}</span>}
      {stored.state === "done" && (
        <>
          <span>
            {findings.length
              ? `n8n checked ${count(findings.length, "claim")} from your deck in the news (${tally.join(", ")}). The panel will ask about them.`
              : "n8n found nothing in your deck to check in the news."}
          </span>
          {findings.length > 0 && (
            <Link href={`/m/${encodeURIComponent(meetingId)}#deck-research`} className="text-ink-2 underline decoration-line hover:text-ink">
              What it found
            </Link>
          )}
        </>
      )}
    </p>
  );
}

// On the brief: the findings, as facts with their sources. The question a panel would ask is practice, so it stays out of the brief.
export function DeckFindings({ stored }: { stored: StoredResearch }) {
  const research = stored.research;
  return (
    <section id="deck-research" className="flex scroll-mt-6 flex-col gap-4">
      <SectionHead
        title="Checked from your deck"
        count={research?.findings.length}
        note={
          stored.state === "done" && research
            ? `n8n searched the news for ${count(research.searched.length, "claim")} in ${stored.deck_name}`
            : stored.deck_name
        }
      />
      {stored.state === "running" && <p className="text-sm text-ink-2">n8n is picking the claims in your deck to check, and searching the news for each…</p>}
      {stored.state === "failed" && <p className="text-sm text-ink-2">n8n couldn&apos;t research this deck. {stored.error}</p>}
      {stored.state === "done" && research && research.findings.length === 0 && (
        <p className="text-sm text-ink-2">n8n found no claims in your deck that the news could back or contradict.</p>
      )}
      {stored.state === "done" && research && research.findings.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface px-5 sm:px-6">
          {research.findings.map((f) => (
            <li key={`${f.slide_index}-${f.claim}`} className="flex flex-col gap-2 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="text-muted">{slideLabel(f.slide_index)}: </span>
                  <span className="font-medium">“{f.claim}”</span>
                </p>
                <FindingPill verdict={f.verdict} />
              </div>
              <p className="text-sm text-ink-2">{f.fact}</p>
              {f.sources.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {f.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer" className="inline-block max-w-md truncate rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 hover:border-ink hover:text-ink">
                        {s.title}
                        {s.publisher && <span className="text-muted">, {s.publisher}</span>}
                        {s.date && <span className="text-muted">, {s.date}</span>}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
