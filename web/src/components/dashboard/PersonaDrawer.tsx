"use client";

import { useEffect, useRef } from "react";
import type { PersonaId, SessionRecord } from "@/lib/contract";
import { momentLabel, slideLabel } from "@/lib/format";
import { exchanges } from "@/lib/timeline";
import { PersonaAvatar, StancePill, VerdictPill } from "../ui";

const SOURCE_LABEL = { deck: "From your deck", research: "From research", history: "From a past session" } as const;

export function PersonaDrawer({ session, id, onClose }: { session: SessionRecord; id: PersonaId; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus(), [id]);

  const persona = session.bundle.personas.find((p) => p.id === id);
  if (!persona) return null;
  const verdict = session.debrief?.stakeholders.find((s) => s.persona_id === id);
  const asked = session.telemetry ? exchanges(session.telemetry).filter((x) => x.persona_id === id) : [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <aside
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={persona.display_name}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className="relative flex h-full w-full max-w-md flex-col gap-6 overflow-y-auto bg-surface p-6 shadow-xl outline-none"
      >
        <header className="flex items-start gap-3">
          <PersonaAvatar persona={persona} size={48} />
          <div className="flex-1">
            <h2 className="font-display text-3xl leading-none">{persona.display_name}</h2>
            <p className="mt-1 text-sm text-muted">{persona.role}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-line px-3 py-1 text-sm hover:border-ink">
            Close
          </button>
        </header>

        {verdict && (
          <section className="flex flex-col gap-2 rounded-xl bg-paper p-4">
            <StancePill stance={verdict.stance} />
            <p className="text-sm">{verdict.reason}</p>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-xs font-semibold text-ink-2">Cares about</h3>
          <ul className="list-disc pl-5 text-sm">
            {persona.priorities.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold text-ink-2">Will push on</h3>
          <ul className="flex flex-col gap-3">
            {persona.objections.map((o) => (
              <li key={o.text} className="text-sm">
                <p>{o.text}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {/* -1: not tied to a slide (no deck, or it could come at any time) */}
                  {SOURCE_LABEL[o.source]}, {o.slide_index < 0 ? "at any time" : `about ${slideLabel(o.slide_index).toLowerCase()}`}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {asked.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold text-ink-2">In the session</h3>
            <ul className="flex flex-col gap-4">
              {asked.map((x) => (
                <li key={x.id} className="flex flex-col gap-1.5 text-sm">
                  <p className="text-[11px] text-muted">{momentLabel(x.t, x.slide_index)}</p>
                  <p className="font-display text-xl leading-snug">{x.question}</p>
                  {x.answer && <p className="text-ink-2">You: “{x.answer.transcript}”</p>}
                  {x.answer?.verdict && <span className="w-fit"><VerdictPill verdict={x.answer.verdict} /></span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
