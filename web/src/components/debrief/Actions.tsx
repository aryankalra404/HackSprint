import type { Bundle, Debrief } from "@/lib/contract";
import { personaTag } from "@/lib/personas";
import { slideLabel } from "@/lib/format";
import { Card, PersonaAvatar, StatusIcon } from "../ui";

const ACTION_TEXT: Record<string, string> = {
  report_emailed: "Emailed you this report",
  drill_scheduled: "Booked the drill on your calendar",
  weak_spots_saved: "Briefed the panel to press on your weak spots next time",
  answers_drafted: "Drafted answers to the questions you couldn't answer, with sources",
};

// Where the report ends: the one thing to practise, who will press on it, and what n8n already did about it.
// wide: the card has the row to itself (no headset data beside it), so the drill and the rest sit side by side.
export function Actions({ debrief, bundle, wide = false }: { debrief: Debrief; bundle: Bundle; wide?: boolean }) {
  const { drill } = debrief;
  const focus = bundle.personas.find((p) => p.id === drill.focus_persona);
  const tag = personaTag(bundle.personas, drill.focus_persona);
  const on = drill.slides.length > 0 ? ` on ${drill.slides.map(slideLabel).join(", ")}` : "";

  return (
    <Card title="What to practise next">
      <div className={`grid gap-6 ${wide ? "lg:grid-cols-2" : ""}`}>
        <div>
          <p className="font-display text-3xl leading-tight">{drill.title}</p>
          <div className="mt-4 flex items-center gap-3">
            {focus && <PersonaAvatar persona={focus} size={40} />}
            <p className="text-sm text-ink-2">
              {drill.minutes} minutes{on}, against <span className="text-ink">{tag.name}</span> ({tag.role}).
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-5">
          {debrief.weak_spots && debrief.weak_spots.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold">The panel will press on</p>
              <ul className="flex flex-wrap gap-2">
                {debrief.weak_spots.map((w) => (
                  <li key={w} className="rounded-full bg-paper px-3 py-1 text-sm">{w}</li>
                ))}
              </ul>
            </div>
          )}
          <ul className="flex flex-col gap-1.5 border-t border-line pt-4">
            {debrief.actions_taken.map((a) => (
              <li key={a} className="flex items-start gap-2 text-xs text-ink-2">
                <span className="mt-px text-good-ink"><StatusIcon tone="good" className="size-3" /></span>
                {ACTION_TEXT[a] ?? a.replaceAll("_", " ")}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
