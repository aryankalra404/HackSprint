import type { Metric } from "@/lib/contract";
import { clock, slideLabel } from "@/lib/format";
import { Card } from "../ui";

export function Metrics({ metrics, onSelect }: { metrics: Metric[]; onSelect: (t: number, note?: string) => void }) {
  return (
    <Card title="Scores, with evidence">
      <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {metrics.map((m) => (
          <li key={m.name} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">{m.name}</h3>
              <span className="font-mono text-sm tabular-nums">{m.score}</span>
            </div>
            <div className="h-1 rounded-full bg-paper" role="img" aria-label={`${m.name}: ${m.score} out of 100`}>
              <div className="h-1 rounded-full bg-ink" style={{ width: `${m.score}%` }} />
            </div>
            <p className="text-sm text-ink-2">{m.explanation}</p>
            <ul className="flex flex-wrap gap-2">
              {m.evidence.map((e) => (
                <li key={`${e.t}-${e.quote}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(e.t, e.quote)}
                    title={e.quote}
                    className="rounded-full border border-line px-2.5 py-1 font-mono text-xs text-ink-2 hover:border-ink hover:text-ink"
                  >
                    {clock(e.t)} · {slideLabel(e.slide_index)}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}
