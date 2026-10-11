import type { Bundle, OwedAnswer } from "@/lib/contract";
import { personaTag } from "@/lib/personas";
import { Card, OwedPill, PersonaAvatar } from "../ui";

// The homework (contract 0.26): each question the presenter couldn't answer, with what they said and the answer n8n drafted from the
// deck, the research and their own words, what to check before the real meeting, and the sources. The next rehearsal asks them again.
export function Owed({ owed, bundle }: { owed: OwedAnswer[]; bundle: Bundle }) {
  const company = bundle.prospect.company || "them";
  return (
    <Card title="Questions you owe them" aside={<span className="text-xs text-ink-2">The panel asks these again next time</span>}>
      <p className="mb-5 font-display text-3xl">
        {owed.length} question{owed.length === 1 ? "" : "s"} you couldn&apos;t answer for {company}
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {owed.map((o) => {
          const persona = bundle.personas.find((p) => p.id === o.persona_id);
          const tag = personaTag(bundle.personas, o.persona_id);
          return (
            <li key={o.thread_id} className="grid gap-4 py-5 first:pt-0 last:pb-0 lg:grid-cols-[1fr_1.2fr]">
              <div className="flex gap-3">
                {persona && <PersonaAvatar persona={persona} />}
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{tag.name}</span>
                    <span className="text-xs text-muted">{tag.role}</span>
                    <OwedPill status={o.status} />
                  </div>
                  <p className="font-display text-lg leading-snug">{o.question}</p>
                  <p className="text-sm text-ink-2">
                    <span className="text-muted">You said: </span>
                    {o.said ? `“${o.said}”` : "nothing"}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-xl bg-paper p-4">
                <div>
                  <p className="mb-1 text-xs font-semibold">Suggested answer</p>
                  <p className="text-sm">{o.suggested}</p>
                </div>
                {o.confirm && (
                  <div>
                    <p className="mb-1 text-xs font-semibold">Check before the meeting</p>
                    <p className="text-sm text-ink-2">{o.confirm}</p>
                  </div>
                )}
                {o.sources.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {o.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noreferrer" className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink-2 hover:border-ink hover:text-ink">
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
