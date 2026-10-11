import type { Trouble as TroubleItem } from "@/lib/contract";
import { clock } from "@/lib/format";

const KIND: Record<TroubleItem["kind"], string> = {
  garbled: "Possibly mis-heard",
  cut_short: "The panel cut in early",
  turn_failed: "n8n didn't answer",
};

// What went wrong on DryRun's side (contract 0.26), shown quietly: the debrief discounted these rather than blame the presenter
export function Trouble({ trouble }: { trouble: TroubleItem[] }) {
  return (
    <section className="rounded-2xl border border-dashed border-line px-5 py-4 text-sm text-ink-2">
      <p className="mb-2 text-xs font-semibold text-ink">What went wrong on our side (not held against you)</p>
      <ul className="flex flex-col gap-1">
        {trouble.map((t) => (
          <li key={`${t.kind}-${t.t}`} className="flex gap-3">
            <span className="w-10 shrink-0 tabular-nums text-muted">{clock(t.t)}</span>
            <span>
              <span className="text-ink">{KIND[t.kind]}:</span> {t.note}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
