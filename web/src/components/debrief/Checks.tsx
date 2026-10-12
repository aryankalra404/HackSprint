import type { ResearchCheck } from "@/lib/contract";
import { slideLabel } from "@/lib/format";
import { Card, CheckPill } from "../ui";

// Your claims against the research (contract 0.30): n8n searched the news for the deck's claims before the rehearsal, and the debrief
// checks what was actually said against what it found. The ones that went wrong come first.
const ORDER: Record<ResearchCheck["verdict"], number> = { contradicted: 0, unbacked: 1, held: 2, not_said: 3 };

export function Checks({ checks }: { checks: ResearchCheck[] }) {
  const sorted = [...checks].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict]);
  const wrong = checks.filter((c) => c.verdict === "contradicted" || c.verdict === "unbacked").length;
  return (
    <Card title="Your claims against the research" aside={<span className="text-xs text-ink-2">n8n searched the news for your deck&apos;s claims</span>}>
      <p className="mb-5 font-display text-3xl">
        {wrong ? `${wrong} of ${checks.length} claims won't survive a check` : `${checks.length} claim${checks.length === 1 ? "" : "s"} checked, none contradicted`}
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {sorted.map((c) => (
          <li key={`${c.slide_index}-${c.claim}`} className="grid gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[1fr_1.2fr]">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">{slideLabel(c.slide_index)}</span>
                <CheckPill verdict={c.verdict} />
              </div>
              <p className="font-display text-lg leading-snug">{c.claim}</p>
              <p className="text-sm text-ink-2">
                <span className="text-muted">You said: </span>
                {c.quote ? `“${c.quote}”` : "nothing about it"}
              </p>
            </div>
            <div className="flex flex-col gap-2 rounded-xl bg-paper p-4">
              {c.note && <p className="text-sm">{c.note}</p>}
              {c.sources.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {c.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer" className="inline-block max-w-sm truncate rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink-2 hover:border-ink hover:text-ink">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
