"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSideAction } from "@/app/m/actions";
import { btn } from "../ui";

// Know your side (contract 0.26): what n8n thinks the presenter wants from this meeting, and what they offer, to confirm or edit.
// The brief stays as n8n wrote it; the next rehearsal aims at the goal.
export function YourSide({
  meetingId,
  guess,
  own,
  offer,
}: {
  meetingId: string;
  guess: { text: string; why: string } | null;
  own: string;
  offer: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!guess && !own);
  const [goal, setGoal] = useState(own || guess?.text || "");
  const [offerText, setOfferText] = useState(offer);
  const [saving, save] = useTransition();
  const shown = own || guess?.text;

  if (!editing)
    return (
      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-ink-2">{own ? "What you want from this meeting" : "n8n thinks you want"}</p>
          <p className="text-balance font-display text-2xl leading-snug">{shown}</p>
          {!own && guess?.why && <p className="text-sm text-ink-2">{guess.why}</p>}
          {offer && <p className="text-sm text-ink-2">You offer: {offer}</p>}
          <p className="mt-1 text-xs text-muted">The panel will press on whatever would stop that, and the debrief checks you asked for it.</p>
        </div>
        <button type="button" onClick={() => setEditing(true)} className={btn("secondary")}>
          {own ? "Edit" : "Not quite? Edit"}
        </button>
      </section>
    );

  return (
    <form
      className="flex flex-col gap-4 rounded-2xl border border-ink bg-surface p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        save(async () => {
          await saveSideAction(meetingId, { offer: offerText, goal });
          setEditing(false);
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">What you want from this meeting</span>
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="A paid 3-month pilot approved"
          className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm placeholder:text-muted focus:border-ink focus:outline-none"
        />
        {guess && <span className="text-xs text-muted">n8n&apos;s guess: {guess.text}</span>}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">What you offer (for every meeting)</span>
        <input
          value={offerText}
          onChange={(e) => setOfferText(e.target.value)}
          placeholder="RouteIQ: route optimisation for logistics fleets"
          className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm placeholder:text-muted focus:border-ink focus:outline-none"
        />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={btn("primary")}>
          {saving ? "Saving…" : "Save"}
        </button>
        {(guess || own) && (
          <button type="button" onClick={() => setEditing(false)} className={btn("quiet")}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
