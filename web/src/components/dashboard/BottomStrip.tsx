import Link from "next/link";
import type { SessionRecord } from "@/lib/contract";
import { personaTag, colorOf } from "@/lib/personas";
import { clock } from "@/lib/format";
import { exchanges, freezes, RESCUE_LABEL, slideSegments } from "@/lib/timeline";
import { StatusIcon, verdictTone } from "../ui";

// Before the pitch: the deck with where each stakeholder will push back.
// After: what actually happened, on the real clock.
export function BottomStrip({ session }: { session: SessionRecord }) {
  const { bundle, telemetry, debrief } = session;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 lg:flex-row lg:items-center lg:gap-6">
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="min-w-[560px]">
          {telemetry ? <ActualStrip session={session} /> : <PlannedStrip session={session} />}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-6 lg:border-l lg:border-line lg:pl-6">
        {debrief ? (
          <>
            {debrief.overall != null ? (
              <p className="flex items-baseline gap-1">
                <span className="font-display text-5xl leading-none">{debrief.overall}</span>
                <span className="text-xs text-muted">/100</span>
              </p>
            ) : (
              <p className="text-sm text-ink-2">Too short to score</p>
            )}
            {debrief.previous_overall != null && debrief.overall != null && (
              <p className="text-sm text-good-ink">
                ▲ {debrief.overall - debrief.previous_overall}
                <span className="block text-[11px] text-muted">since last</span>
              </p>
            )}
            <Link href={`/s/${bundle.session_id}/report`} className="rounded-full bg-ink px-5 py-3 text-sm text-surface">
              Open full report
            </Link>
          </>
        ) : (
          <dl className="flex gap-6 text-xs text-ink-2">
            <div>
              <dt className="text-muted">Slides</dt>
              <dd className="text-xl text-ink">{bundle.slides.length}</dd>
            </div>
            <div>
              <dt className="text-muted">Objections</dt>
              <dd className="text-xl text-ink">{bundle.personas.reduce((n, p) => n + p.objections.length, 0)}</dd>
            </div>
            <div>
              <dt className="text-muted">Planned</dt>
              <dd className="text-xl text-ink">{clock(bundle.slides.reduce((n, s) => n + s.target_seconds, 0))}</dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}

function PlannedStrip({ session }: { session: SessionRecord }) {
  const { bundle } = session;
  return (
    <ol className="flex gap-0.5" aria-label="Deck, with where each stakeholder is expected to push back">
      {bundle.slides.map((s) => {
        const pushers = bundle.personas.filter((p) => p.objections.some((o) => o.slide_index === s.index));
        return (
          <li key={s.index} className="flex min-w-0 flex-col gap-2 rounded-sm bg-paper px-2 py-2" style={{ flex: s.target_seconds }}>
            <span className="truncate text-xs">
              <span className="text-muted">{s.index + 1}</span> {s.title}
            </span>
            <span className="flex min-h-5 flex-wrap gap-1">
              {pushers.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-surface px-1.5 py-0.5 text-[10px]">
                  <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: colorOf(p.color) }} />
                  {p.role_short}
                </span>
              ))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ActualStrip({ session }: { session: SessionRecord }) {
  const telemetry = session.telemetry!;
  const duration = telemetry.duration_s;
  const segments = slideSegments(telemetry, session.bundle.slides);
  const pct = (t: number) => `${(t / duration) * 100}%`;
  // Questions close together alternate between two rows so their chips don't collide
  const rows: number[] = [];
  exchanges(telemetry).forEach((x, i, all) => {
    rows.push(i > 0 && x.t - all[i - 1].t < duration * 0.08 && rows[i - 1] === 0 ? 1 : 0);
  });

  return (
    <div className="relative h-[76px]">
      {segments.map((s) => (
        <div
          key={s.slide_index}
          className="absolute top-0 h-7 truncate rounded-sm border-r-2 border-surface bg-paper px-1.5 py-1 text-xs"
          style={{ left: pct(s.start), width: pct(s.end - s.start) }}
          title={`${s.title}, ${clock(s.end - s.start)}`}
        >
          <span className="text-muted">{s.slide_index + 1}</span> {s.title}
        </div>
      ))}
      {exchanges(telemetry).map((x, i) => {
        const verdict = x.answer?.verdict;
        const tone = verdict ? verdictTone(verdict) : null;
        const lower = rows[i] === 1;
        return (
          <span
            key={x.id}
            className={`absolute ${lower ? "top-[54px]" : "top-9"} inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface px-1.5 py-0.5 text-[10px]`}
            style={{ left: pct(x.t) }}
            title={`${clock(x.t)} ${x.question}`}
          >
            <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: personaTag(session.bundle.personas, x.persona_id).color }} />
            {personaTag(session.bundle.personas, x.persona_id).short}
            {tone && <StatusIcon tone={tone} className={`size-2.5 ${{ good: "text-good-ink", warn: "text-warn-ink", bad: "text-bad-ink" }[tone]}`} />}
          </span>
        );
      })}
      {freezes(telemetry, segments).map((f) => (
        <span
          key={f.id}
          className="absolute top-[38px] h-4 w-1.5 rounded-sm bg-warn"
          style={{ left: pct(f.t) }}
          title={`${clock(f.t)} froze ${f.duration_s.toFixed(1)} s, then ${RESCUE_LABEL[f.rescue_level].toLowerCase()}`}
        />
      ))}
    </div>
  );
}
