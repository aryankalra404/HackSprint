import type { Bundle } from "@/lib/contract";
import { personaById, personaTag } from "@/lib/personas";
import { clock, slideLabel } from "@/lib/format";
import { RESCUE_LABEL, slideAt, type Exchange, type Freeze, type SlideSegment } from "@/lib/timeline";
import { Card, PersonaAvatar, RoleTag, StatusIcon, VerdictPill, verdictTone } from "../ui";

export interface Selection {
  t: number;
  momentId: string | null;
  note?: string;
}

interface Props {
  bundle: Bundle;
  duration: number;
  segments: SlideSegment[];
  exchanges: Exchange[];
  freezes: Freeze[];
  selection: Selection | null;
  onSelect: (s: Selection) => void;
}

const pct = (t: number, duration: number) => `${(t / duration) * 100}%`;

// Questions close together go on a second lane so their labels don't collide.
function lanes(items: Exchange[], duration: number): number[] {
  const lastInLane = [-Infinity, -Infinity];
  return items.map((x) => {
    const p = x.t / duration;
    const lane = p - lastInLane[0] > 0.08 ? 0 : 1;
    lastInLane[lane] = p;
    return lane;
  });
}

export function Timeline({ bundle, duration, segments, exchanges, freezes, selection, onSelect }: Props) {
  const exchangeLanes = lanes(exchanges, duration);
  // A tick every minute, closer together on a short session so the axis still reads
  const step = duration <= 90 ? 15 : duration <= 240 ? 30 : 60;
  const ticks = Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => i * step).filter((t) => duration - t > step / 3 || t === 0);
  const personasPresent = [...new Set(exchanges.map((x) => x.persona_id))];

  return (
    <div id="timeline" className="scroll-mt-6">
      <Card
        title="Session timeline"
        aside={
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Legend">
            {personasPresent.map((id) => {
              const persona = personaById(bundle.personas, id);
              return persona && <li key={id}><RoleTag persona={persona} /></li>;
            })}
            <li className="inline-flex items-center gap-1.5 text-xs text-ink-2">
              <span aria-hidden="true" className="h-2 w-4 rounded-sm bg-warn" /> Freeze + rescue cue
            </li>
          </ul>
        }
      >
        <div className="overflow-x-auto pt-2">
          <div className="flex min-w-[720px] gap-3">
            <div className="flex w-20 shrink-0 flex-col text-xs text-muted" aria-hidden="true">
              <span className="flex h-11 items-center">Slides</span>
              <span className="flex h-[84px] items-center">Questions</span>
              <span className="flex h-9 items-center">Freezes</span>
            </div>

            <div className="relative flex-1">
              {/* Slides */}
              <div className="relative h-11">
                {segments.map((s) => {
                  const width = ((s.end - s.start) / duration) * 100;
                  const over = s.end - s.start - s.target;
                  return (
                    <button
                      key={s.slide_index}
                      type="button"
                      onClick={() => onSelect({ t: s.start, momentId: null })}
                      title={`${slideLabel(s.slide_index)}: ${s.title}. ${clock(s.end - s.start)} against a ${clock(s.target)} target`}
                      className="absolute inset-y-0 flex items-center justify-between gap-1 overflow-hidden rounded-sm border-r-2 border-surface bg-paper px-2 text-left text-xs hover:bg-line"
                      style={{ left: pct(s.start, duration), width: `${width}%` }}
                    >
                      <span className="truncate">
                        <span className="text-muted">{s.slide_index + 1}</span>
                        {width > 11 && <span className="ml-1.5">{s.title}</span>}
                      </span>
                      {s.target > 0 && over > s.target * 0.3 && width > 7 && (
                        <span className="shrink-0 text-warn-ink">+{Math.round(over)}s</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Questions */}
              <div className="relative h-[84px] border-b border-line">
                {exchanges.map((x, i) => {
                  const selected = selection?.momentId === x.id;
                  return (
                    <div
                      key={x.id}
                      className="group absolute -translate-x-1/2"
                      style={{ left: pct(x.t, duration), top: exchangeLanes[i] === 0 ? 10 : 46 }}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect({ t: x.t, momentId: x.id })}
                        aria-label={`${clock(x.t)}: ${personaTag(bundle.personas, x.persona_id).name} asked a question${x.answer?.verdict ? `, ${x.answer.verdict}` : ""}`}
                        aria-pressed={selected}
                        className={`flex h-7 items-center gap-1.5 rounded-full border bg-surface px-2.5 text-xs ${selected ? "border-ink ring-2 ring-ink" : "border-line hover:border-ink"}`}
                      >
                        <span aria-hidden="true" className="size-2 rounded-full" style={{ background: personaTag(bundle.personas, x.persona_id).color }} />
                        {personaTag(bundle.personas, x.persona_id).short}
                        {x.answer?.verdict && <VerdictGlyph verdict={x.answer.verdict} />}
                      </button>
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden w-56 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs text-surface group-hover:block"
                      >
                        <span className="text-axis">{clock(x.t)}</span> {x.question}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Freezes */}
              <div className="relative h-9">
                {freezes.map((f) => {
                  const selected = selection?.momentId === f.id;
                  return (
                    <div
                      key={f.id}
                      className="group absolute top-2 min-w-5"
                      style={{ left: pct(f.t, duration), width: pct(f.duration_s, duration) }}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect({ t: f.t, momentId: f.id })}
                        aria-label={`${clock(f.t)}: froze for ${f.duration_s.toFixed(1)} seconds, ${RESCUE_LABEL[f.rescue_level]}`}
                        aria-pressed={selected}
                        className={`block h-5 w-full rounded-sm bg-warn ${selected ? "ring-2 ring-ink ring-offset-1" : ""}`}
                      />
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 hidden w-48 rounded-lg bg-ink px-3 py-2 text-xs text-surface group-hover:block"
                      >
                        <span className="text-axis">{clock(f.t)}</span> Froze {f.duration_s.toFixed(1)} s, then {RESCUE_LABEL[f.rescue_level].toLowerCase()}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Axis */}
              <div className="relative h-5 border-t border-axis" aria-hidden="true">
                {ticks.map((t) => (
                  <span key={t} className="absolute top-1 -translate-x-1/2 text-[11px] tabular-nums text-muted first:translate-x-0" style={{ left: pct(t, duration) }}>
                    {clock(t)}
                  </span>
                ))}
              </div>

              {selection && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-ink" style={{ left: pct(selection.t, duration) }} />
              )}
            </div>
          </div>
        </div>

        <Detail bundle={bundle} segments={segments} exchanges={exchanges} freezes={freezes} selection={selection} />
      </Card>
    </div>
  );
}

function VerdictGlyph({ verdict }: { verdict: NonNullable<NonNullable<Exchange["answer"]>["verdict"]> }) {
  const tone = verdictTone(verdict);
  const color = { good: "text-good-ink", warn: "text-warn-ink", bad: "text-bad-ink" }[tone];
  return <StatusIcon tone={tone} className={`size-3 ${color}`} />;
}

function Detail({ bundle, segments, exchanges, freezes, selection }: Omit<Props, "duration" | "onSelect">) {
  if (!selection) {
    return <p className="mt-5 border-t border-line pt-5 text-sm text-muted">Select a moment on the timeline to see what happened.</p>;
  }

  const slideIndex = slideAt(segments, selection.t);
  const segment = segments.find((s) => s.slide_index === slideIndex);
  const exchange = exchanges.find((x) => x.id === selection.momentId);
  const freeze = freezes.find((f) => f.id === selection.momentId);

  return (
    <div className="mt-5 flex flex-col gap-4 border-t border-line pt-5" aria-live="polite">
      <p className="text-xs text-ink-2">
        {slideLabel(slideIndex)}: {segment?.title}, at {clock(selection.t)}
      </p>

      {exchange && <ExchangeDetail bundle={bundle} exchange={exchange} />}

      {freeze && (
        <p className="text-sm">
          You went silent for <strong>{freeze.duration_s.toFixed(1)} s</strong>.{" "}
          {freeze.rescue_level > 0 ? (
            <>The Rescue Agent showed a <strong>{RESCUE_LABEL[freeze.rescue_level].toLowerCase()}</strong>.</>
          ) : (
            <>You recovered without a cue.</>
          )}
        </p>
      )}

      {!exchange && !freeze && segment && (
        <p className="text-sm">
          {clock(segment.end - segment.start)} on this slide against a {clock(segment.target)} target.
        </p>
      )}

      {selection.note && !exchange && (
        <blockquote className="font-display text-2xl leading-snug">“{selection.note}”</blockquote>
      )}
    </div>
  );
}

function ExchangeDetail({ bundle, exchange }: { bundle: Bundle; exchange: Exchange }) {
  const persona = bundle.personas.find((p) => p.id === exchange.persona_id);
  const tag = personaTag(bundle.personas, exchange.persona_id);
  const name = tag.name;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {persona && <PersonaAvatar persona={persona} size={36} />}
          <div className="text-sm">
            <p className="font-medium">{name}</p>
            <p className="text-xs text-muted">{tag.role}</p>
          </div>
        </div>
        <p className="font-display text-2xl leading-snug">{exchange.question}</p>
        <div className="rounded-xl bg-paper p-3">
          <p className="mb-1 text-xs font-semibold text-ink-2">Why they asked</p>
          <p className="text-sm text-ink-2">{exchange.reason}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-ink-2">
          Your answer{exchange.answer && `, at ${clock(exchange.answer.t)}`}
        </p>
        {exchange.answer ? (
          <>
            <p className="text-lg leading-relaxed">“{exchange.answer.transcript}”</p>
            {exchange.answer.verdict && <span className="w-fit"><VerdictPill verdict={exchange.answer.verdict} /></span>}
          </>
        ) : (
          <p className="text-sm text-muted">No answer recorded.</p>
        )}
      </div>
    </div>
  );
}
