import type { Bundle, StakeholderVerdict } from "@/lib/contract";
import { PERSONA_STYLE } from "@/lib/personas";
import { momentLabel } from "@/lib/format";
import { Card, PersonaAvatar, StancePill } from "../ui";

export function Stakeholders({
  bundle,
  stakeholders,
  onSelect,
}: {
  bundle: Bundle;
  stakeholders: StakeholderVerdict[];
  onSelect: (t: number, note?: string) => void;
}) {
  const backing = stakeholders.filter((s) => s.stance === "backs").length;

  return (
    <Card title="The room">
      <p className="mb-5 font-display text-3xl">
        {backing} of {stakeholders.length} would back this
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {stakeholders.map((s) => {
          const persona = bundle.personas.find((p) => p.id === s.persona_id);
          const name = persona?.display_name ?? PERSONA_STYLE[s.persona_id].short;
          return (
            <li key={s.persona_id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <PersonaAvatar id={s.persona_id} name={name} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">{name}</span>
                  <span className="text-xs text-muted">{PERSONA_STYLE[s.persona_id].role}</span>
                  <span className="ml-auto"><StancePill stance={s.stance} /></span>
                </div>
                <p className="text-sm text-ink-2">{s.reason}</p>
                {s.deciding_moment && (
                  <button
                    type="button"
                    onClick={() => onSelect(s.deciding_moment!.t, s.deciding_moment!.quote)}
                    className="w-fit text-xs text-ink-2 underline decoration-axis underline-offset-4 hover:text-ink hover:decoration-ink"
                  >
                    {momentLabel(s.deciding_moment.t, s.deciding_moment.slide_index)}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
