"use client";

import { useEffect, useRef } from "react";
import type { FeedItem } from "@/lib/feed";
import { VerdictPill } from "../ui";

// status: where the rehearsal is (e.g. "Live: the pitch"), shown in the header while it runs
export function AgentFeed({ items, status }: { items: FeedItem[]; status?: string }) {
  const phases = ["Before", "During", "After"] as const;
  // Keep the newest in view as the rehearsal goes on
  const list = useRef<HTMLDivElement>(null);
  const count = items.length;
  useEffect(() => {
    if (status && list.current) list.current.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [count, status]);

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-line bg-surface">
      <header className="flex items-baseline justify-between border-b border-line px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">What the agent did</h2>
        <span className="text-xs text-muted">{status ?? "Runs on n8n"}</span>
      </header>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {phases.map((phase) => {
          const group = items.filter((i) => i.phase === phase);
          if (group.length === 0) return null;
          return (
            <div key={phase} className="mb-5 last:mb-0">
              <h3 className="mb-2 text-xs font-semibold text-ink-2">{phase} the pitch</h3>
              <ol className="flex flex-col">
                {group.map((item) => (
                  <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${item.busy ? "animate-pulse bg-warn" : ""}`}
                      style={item.busy ? undefined : { background: item.color ?? "var(--color-ink)" }}
                    />
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-sm leading-snug">
                        <span className="mr-2 text-[11px] text-muted">{item.when}</span>
                        {item.title}
                        {item.busy && <span className="text-muted">…</span>}
                      </p>
                      {item.detail && <p className="text-xs text-ink-2">{item.detail}</p>}
                      {item.verdict && <span className="w-fit"><VerdictPill verdict={item.verdict} /></span>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}
