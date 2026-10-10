import type { Bundle, Debrief } from "@/lib/contract";
import { personaTag } from "@/lib/personas";
import { slideLabel } from "@/lib/format";
import { Card, StatusIcon } from "../ui";

const ACTION_TEXT: Record<string, string> = {
  report_emailed: "Emailed you this report",
  drill_scheduled: "Booked the drill on your calendar",
  weak_spots_saved: "Briefed the panel to press on your weak spots next time",
};

export function Actions({ debrief, bundle }: { debrief: Debrief; bundle: Bundle }) {
  const { drill } = debrief;

  return (
    <Card title="Next: drill">
      <p className="font-display text-3xl leading-tight">{drill.title}</p>
      <p className="mt-2 text-sm text-ink-2">
        {drill.minutes} minutes on {drill.slides.map(slideLabel).join(", ")}, against{" "}
        {personaTag(bundle.personas, drill.focus_persona).name} ({personaTag(bundle.personas, drill.focus_persona).role}).
      </p>
      <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-sm">
        The panel will be waiting in the headset, briefed to press on exactly this.
      </p>
      <ul className="mt-4 flex flex-col gap-1.5 border-t border-line pt-4">
        {debrief.actions_taken.map((a) => (
          <li key={a} className="flex items-start gap-2 text-xs text-ink-2">
            <span className="mt-px text-good-ink"><StatusIcon tone="good" className="size-3" /></span>
            {ACTION_TEXT[a] ?? a.replaceAll("_", " ")}
          </li>
        ))}
      </ul>
    </Card>
  );
}
