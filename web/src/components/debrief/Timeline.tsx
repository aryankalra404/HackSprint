import type { Bundle, Verdict } from "@/lib/contract";
import { personaById, personaTag } from "@/lib/personas";
import { clock, slideLabel } from "@/lib/format";
import { RESCUE_LABEL, slideAt, type Exchange, type Freeze, type SlideSegment } from "@/lib/timeline";
import { Card, PersonaAvatar, StatusIcon, VerdictPill, verdictLabel, verdictTone } from "../ui";

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
  // When the pitch ended and the floor opened for questions, if it did
  qaStart?: number;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
}

const pct = (t: number, duration: number) => `${(t / duration) * 100}%`;

const LANE = 36;
// A question chip's width as a share of the track, roughly, so neighbours don't collide
const CHIP = 0.075;

const TONE_BG = { good: "bg-good", warn: "bg-warn", bad: "bg-bad" } as const;
const TONE_TEXT = { good: "text-surface", warn: "text-ink", bad: "text-surface" } as const;

// Each question takes the first lane free from its chip to its answer, so the line to the answer never crosses another chip
function lanes(items: Exchange[], duration: number): number[] {
  const ends: number[] = [];
  return items.map((x) => {
    const start = x.t / duration - CHIP / 2;
    const end = Math.max(x.t / duration + CHIP / 2, (x.answer?.t ?? 0) / duration + 0.015);
    let lane = ends.findIndex((e) => start > e);
    if (lane === -1) lane = ends.push(end) - 1;
    else ends[lane] = end;
    return lane;
  });
}

// n8n sometimes starts a question with the asker's name ("Rohan: …"); the chip already says who asked
function questionText(bundle: Bundle, x: Exchange): string {
  const name = personaTag(bundle.personas, x.persona_id).name;
  for (const prefix of [name, name.split(" ")[0]]) {
    if (x.question.startsWith(`${prefix}:`)) return x.question.slice(prefix.length + 1).trim();
  }
  return x.question;
}

const firstName = (name: string) => name.split(" ")[0];
// The full role when it fits ("VP Operations"), n8n's short form for long ones ("CTO")
const roleLabel = (tag: { role: string; short: string }) => (tag.role && tag.role.length <= 16 ? tag.role : tag.short);

export function Timeline({ bundle, duration, segments, exchanges, freezes, qaStart, selection, onSelect }: Props) {
  // Slides end where the questions after the pitch begin
  const hasQa = qaStart != null && qaStart < duration - 1;
  const shown = hasQa ? segments.filter((s) => s.start < qaStart).map((s) => ({ ...s, end: Math.min(s.end, qaStart) })) : segments;

  const exchangeLanes = lanes(exchanges, duration);
  const laneCount = Math.max(1, ...exchangeLanes.map((l) => l + 1));
  const questionsHeight = 12 + laneCount * LANE;

  // A tick every minute, closer together on a short session so the axis still reads
  const step = duration <= 90 ? 15 : duration <= 240 ? 30 : 60;
  const ticks = Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => i * step).filter((t) => duration - t > step / 3 || t === 0);

  const personasPresent = [...new Set(exchanges.map((x) => x.persona_id))];
  const verdictsPresent = (["resolved", "partial", "dodged"] as Verdict[]).filter((v) => exchanges.some((x) => x.answer?.verdict === v));
  const unanswered = exchanges.some((x) => !x.answer);

  return (
    <div id="timeline" className="scroll-mt-6">
      <Card
        title="Session timeline"
        aside={
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
            {personasPresent.map((id) => {
              const persona = personaById(bundle.personas, id);
              if (!persona) return null;
              const tag = personaTag(bundle.personas, id);
              return (
                <li key={id} className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ background: tag.color }} />
                  <span className="text-ink">{firstName(tag.name)}</span>
                  {roleLabel(tag)}
                </li>
              );
            })}
            {(verdictsPresent.length > 0 || unanswered) && <li aria-hidden="true" className="h-3 w-px bg-line" />}
            {verdictsPresent.map((v) => (
              <li key={v} className="inline-flex items-center gap-1.5">
                <VerdictDot verdict={v} />
                {verdictLabel(v)}
              </li>
            ))}
            {unanswered && (
              <li className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-3 rounded-full border-[1.5px] border-dashed border-muted" />
                No answer
              </li>
            )}
            {freezes.length > 0 && (
              <li className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-4 rounded-sm bg-warn" /> Freeze and rescue cue
              </li>
            )}
          </ul>
        }
      >
        <div className="overflow-x-auto pt-2 lg:overflow-visible">
          <div className="flex min-w-[720px] gap-3">
            <div className="flex w-20 shrink-0 flex-col text-xs text-muted" aria-hidden="true">
              <span className="flex h-11 items-center">Slides</span>
              <span className="flex items-center" style={{ height: questionsHeight }}>Questions</span>
              {freezes.length > 0 && <span className="flex h-9 items-center">Freezes</span>}
            </div>

            <div className="relative flex-1">
              {selection && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-[5] w-px bg-ink/50" style={{ left: pct(selection.t, duration) }} />
              )}

              {/* Slides, then the questions after the pitch */}
              <div className="relative h-11">
                {shown.map((s) => {
                  const width = ((s.end - s.start) / duration) * 100;
                  const over = s.pitch - s.target;
                  return (
                    <button
                      key={`${s.slide_index}-${s.start}`}
                      type="button"
                      onClick={() => onSelect({ t: s.start, momentId: null })}
                      title={`${slideLabel(s.slide_index)}: ${s.title}. ${clock(s.pitch)} of pitch against a ${clock(s.target)} target`}
                      className="absolute inset-y-0 flex items-center justify-between gap-1 overflow-hidden rounded-md border-r-2 border-surface bg-paper px-2 text-left text-xs hover:bg-line"
                      style={{ left: pct(s.start, duration), width: `${width}%` }}
                    >
                      <span className="truncate">
                        <span className="text-muted">{s.slide_index + 1}</span>
                        {width > 11 && <span className="ml-1.5">{s.title}</span>}
                      </span>
                      {s.target > 0 && over > s.target * 0.3 && width > 7 && <span className="shrink-0 text-warn-ink">+{Math.round(over)}s</span>}
                    </button>
                  );
                })}
                {hasQa && (
                  <button
                    type="button"
                    onClick={() => onSelect({ t: qaStart, momentId: null })}
                    className="absolute inset-y-0 flex items-center overflow-hidden rounded-md border border-dashed border-axis px-2 text-left text-xs text-ink-2 hover:border-ink"
                    style={{ left: pct(qaStart, duration), width: pct(duration - qaStart, duration) }}
                  >
                    <span className="truncate">Questions after the pitch</span>
                  </button>
                )}
              </div>

              {/* Questions, each with a line to your answer in the colour of how it went */}
              <div className={`relative ${freezes.length > 0 ? "border-b border-line" : ""}`} style={{ height: questionsHeight }}>
                {exchanges.map((x, i) => {
                  const top = 8 + exchangeLanes[i] * LANE;
                  const tone = x.answer?.verdict ? verdictTone(x.answer.verdict) : null;
                  return x.answer && x.answer.t > x.t ? (
                    <div key={`${x.id}-answer`}>
                      <span
                        aria-hidden="true"
                        className={`absolute h-0.5 ${tone ? TONE_BG[tone] : "bg-axis"}`}
                        style={{ left: pct(x.t, duration), width: pct(x.answer.t - x.t, duration), top: top + 13 }}
                      />
                      <button
                        type="button"
                        onClick={() => onSelect({ t: x.answer!.t, momentId: x.id })}
                        aria-label={`${clock(x.answer.t)}: your answer${x.answer.verdict ? `, ${verdictLabel(x.answer.verdict).toLowerCase()}` : ""}`}
                        className="absolute z-10 -translate-x-1/2 rounded-full ring-2 ring-surface"
                        style={{ left: pct(x.answer.t, duration), top: top + 6 }}
                      >
                        {x.answer.verdict ? <VerdictDot verdict={x.answer.verdict} /> : <span className="block size-4 rounded-full bg-axis" />}
                      </button>
                    </div>
                  ) : null;
                })}

                {exchanges.map((x, i) => {
                  const selected = selection?.momentId === x.id;
                  const tag = personaTag(bundle.personas, x.persona_id);
                  return (
                    <div key={x.id} className="group absolute z-10 -translate-x-1/2" style={{ left: pct(x.t, duration), top: 8 + exchangeLanes[i] * LANE }}>
                      <button
                        type="button"
                        onClick={() => onSelect({ t: x.t, momentId: x.id })}
                        aria-label={`${clock(x.t)}: ${tag.name} (${tag.role}) asked a question, ${x.answer?.verdict ? verdictLabel(x.answer.verdict).toLowerCase() : x.answer ? "answered" : "no answer"}`}
                        aria-pressed={selected}
                        className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs whitespace-nowrap ${
                          selected ? "border-ink bg-ink text-surface" : x.answer ? "border-line bg-surface hover:border-ink" : "border-dashed border-axis bg-surface hover:border-ink"
                        }`}
                      >
                        <span aria-hidden="true" className="size-2 rounded-full" style={{ background: tag.color }} />
                        {firstName(tag.name)}
                      </button>
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-64 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs leading-relaxed text-surface shadow-lg group-hover:block"
                      >
                        <span className="text-axis">
                          {clock(x.t)}, {roleLabel(tag)}
                        </span>{" "}
                        {questionText(bundle, x)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Freezes: only once a client records silences */}
              {freezes.length > 0 && (
                <div className="relative h-9">
                  {freezes.map((f) => {
                    const selected = selection?.momentId === f.id;
                    return (
                      <div key={f.id} className="group absolute top-2 min-w-5" style={{ left: pct(f.t, duration), width: pct(f.duration_s, duration) }}>
                        <button
                          type="button"
                          onClick={() => onSelect({ t: f.t, momentId: f.id })}
                          aria-label={`${clock(f.t)}: froze for ${f.duration_s.toFixed(1)} seconds, ${RESCUE_LABEL[f.rescue_level]}`}
                          aria-pressed={selected}
                          className={`block h-5 w-full rounded-sm bg-warn ${selected ? "ring-2 ring-ink ring-offset-1" : ""}`}
                        />
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 hidden w-48 rounded-lg bg-ink px-3 py-2 text-xs text-surface group-hover:block"
                        >
                          <span className="text-axis">{clock(f.t)}</span> Froze {f.duration_s.toFixed(1)} s, then {RESCUE_LABEL[f.rescue_level].toLowerCase()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Axis */}
              <div className="relative h-5 border-t border-axis" aria-hidden="true">
                {ticks.map((t) => (
                  <span key={t} className="absolute top-1 -translate-x-1/2 text-[11px] tabular-nums text-muted first:translate-x-0" style={{ left: pct(t, duration) }}>
                    {clock(t)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <Detail bundle={bundle} segments={shown} exchanges={exchanges} freezes={freezes} qaStart={hasQa ? qaStart : undefined} selection={selection} />
      </Card>
    </div>
  );
}

function VerdictDot({ verdict }: { verdict: Verdict }) {
  const tone = verdictTone(verdict);
  return (
    <span aria-hidden="true" className={`flex size-4 items-center justify-center rounded-full ${TONE_BG[tone]} ${TONE_TEXT[tone]}`}>
      <StatusIcon tone={tone} className="size-2.5" />
    </span>
  );
}

function Detail({ bundle, segments, exchanges, freezes, qaStart, selection }: Omit<Props, "duration" | "onSelect">) {
  if (!selection) {
    return <p className="mt-5 border-t border-line pt-5 text-sm text-muted">Select a moment on the timeline to see what happened.</p>;
  }

  const inQa = qaStart != null && selection.t >= qaStart;
  const slideIndex = slideAt(segments, selection.t);
  const segment = segments.find((s) => s.slide_index === slideIndex);
  const exchange = exchanges.find((x) => x.id === selection.momentId);
  const freeze = freezes.find((f) => f.id === selection.momentId);
  const qa = qaStart != null ? exchanges.filter((x) => x.t >= qaStart) : [];

  return (
    <div className="mt-5 flex flex-col gap-4 border-t border-line pt-5" aria-live="polite">
      <p className="text-xs text-ink-2">
        {inQa ? "Questions after the pitch" : `${slideLabel(slideIndex)}: ${segment?.title}`}, at {clock(selection.t)}
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

      {!exchange && !freeze && inQa && (
        <p className="text-sm">
          {qa.length === 1 ? "1 question" : `${qa.length} questions`} after the pitch, {qa.filter((x) => x.answer).length} answered.
        </p>
      )}

      {!exchange && !freeze && !inQa && segment && (
        <p className="text-sm">
          {clock(segment.end - segment.start)} on this slide against a {clock(segment.target)} target.
        </p>
      )}

      {selection.note && !exchange && <blockquote className="font-display text-2xl leading-snug">“{selection.note}”</blockquote>}
    </div>
  );
}

function ExchangeDetail({ bundle, exchange }: { bundle: Bundle; exchange: Exchange }) {
  const persona = bundle.personas.find((p) => p.id === exchange.persona_id);
  const tag = personaTag(bundle.personas, exchange.persona_id);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {persona && <PersonaAvatar persona={persona} size={36} />}
          <div className="text-sm">
            <p className="font-medium">{tag.name}</p>
            <p className="text-xs text-muted">
              {tag.role}, at {clock(exchange.t)}
            </p>
          </div>
        </div>
        <p className="font-display text-2xl leading-snug">{questionText(bundle, exchange)}</p>
        <div className="rounded-xl bg-paper p-3">
          <p className="mb-1 text-xs font-semibold text-ink-2">Why they asked</p>
          <p className="text-sm text-ink-2">{exchange.reason}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-ink-2">Your answer{exchange.answer && `, at ${clock(exchange.answer.t)}`}</p>
        {exchange.answer ? (
          <>
            <p className="text-lg leading-relaxed">“{exchange.answer.transcript}”</p>
            {exchange.answer.verdict && (
              <span className="w-fit">
                <VerdictPill verdict={exchange.answer.verdict} />
              </span>
            )}
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-axis p-3 text-sm text-ink-2">No answer: you went on with the pitch, or the session ended first.</p>
        )}
      </div>
    </div>
  );
}
