import type { Metric } from "@/lib/contract";
import { momentLabel } from "@/lib/format";
import { Card } from "../ui";

// Every score side by side, one tile each: the number, a bar, why, and the moments it's based on (each jumps the timeline there)
export function Metrics({ metrics, onSelect }: { metrics: Metric[]; onSelect: (t: number, note?: string) => void }) {
  const weakest = metrics.reduce<Metric | null>((low, m) => (!low || m.score < low.score ? m : low), null);
  return (
    <Card title="Scores, with evidence" aside={weakest && <span className="text-xs text-ink-2">Lowest: {weakest.name}</span>}>
      <ul className={`grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 ${metrics.length >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        {metrics.map((m) => (
          <li key={m.name} className="flex flex-col gap-3 bg-surface p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">{m.name}</h3>
              <span className="font-display text-3xl leading-none tabular-nums">{m.score}</span>
            </div>
            <div className="h-1.5 rounded-full bg-paper" role="img" aria-label={`${m.name}: ${m.score} out of 100`}>
              <div className={`h-1.5 rounded-full ${m === weakest ? "bg-ink" : "bg-ink-2"}`} style={{ width: `${m.score}%` }} />
            </div>
            <p className="flex-1 text-sm text-ink-2">{m.explanation}</p>
            {m.evidence.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {m.evidence.map((e) => (
                  <li key={`${e.t}-${e.quote}`}>
                    <button
                      type="button"
                      onClick={() => onSelect(e.t, e.quote)}
                      title={e.quote}
                      className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 hover:border-ink hover:text-ink"
                    >
                      {momentLabel(e.t, e.slide_index)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
