import type { Bundle, Debrief } from "@/lib/contract";
import { PERSONA_STYLE } from "@/lib/personas";
import { slideLabel } from "@/lib/format";
import { Card, StatusIcon } from "../ui";

const ACTION_TEXT: Record<string, string> = {
  report_emailed: "Emailed you this report",
  drill_scheduled: "Booked the drill on your calendar",
  weak_spots_saved: "Briefed the panel to press harder on your weak spots next time",
};

export function Actions({ debrief, bundle }: { debrief: Debrief; bundle: Bundle }) {
  const { drill } = debrief;
  const focus = bundle.personas.find((p) => p.id === drill.focus_persona);

  return (
    <>
      <Card title="Next: drill">
        <p className="font-display text-3xl leading-tight">{drill.title}</p>
        <p className="mt-2 text-sm text-ink-2">
          {drill.minutes} minutes on {drill.slides.map(slideLabel).join(", ")}, against{" "}
          {focus?.display_name ?? PERSONA_STYLE[drill.focus_persona].short} ({PERSONA_STYLE[drill.focus_persona].role}).
        </p>
        <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-sm">
          In the headset, enter code <span className="font-mono text-base font-medium tracking-widest">{bundle.join_code}</span>
        </p>
      </Card>

      <Card title="What DryRun did for you">
        <ul className="flex flex-col gap-2.5">
          {debrief.actions_taken.map((a) => (
            <li key={a} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 text-good-ink"><StatusIcon tone="good" /></span>
              {ACTION_TEXT[a] ?? a.replaceAll("_", " ")}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
