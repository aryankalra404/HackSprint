import type { FeedItem } from "@/lib/feed";
import { VerdictPill } from "../ui";

export function AgentFeed({ items }: { items: FeedItem[] }) {
  const phases = ["Before", "During", "After"] as const;

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-line bg-surface">
      <header className="flex items-baseline justify-between border-b border-line px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">What the agent did</h2>
        <span className="text-xs text-muted">Runs on n8n</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
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
                      className="mt-1.5 size-2 shrink-0 rounded-full"
                      style={{ background: item.color ?? "var(--color-ink)" }}
                    />
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-sm leading-snug">
                        <span className="mr-2 text-[11px] text-muted">{item.when}</span>
                        {item.title}
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
