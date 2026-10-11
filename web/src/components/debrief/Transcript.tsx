import type { Bundle, DebriefSlide, TranscriptMark } from "@/lib/contract";
import { clock, slideLabel } from "@/lib/format";
import { Card, StatusIcon } from "../ui";

type Tone = "good" | "warn" | "bad";

// What each kind of mark means, its tone (always shown with an icon and a label) and how it's underlined in the transcript
const KIND: Record<TranscriptMark["kind"], { label: string; tone: Tone; underline: string }> = {
  landed: { label: "Landed", tone: "good", underline: "decoration-good" },
  hedge: { label: "Hedge", tone: "warn", underline: "decoration-warn" },
  filler: { label: "Filler", tone: "warn", underline: "decoration-warn decoration-dotted" },
  unsupported: { label: "No proof", tone: "bad", underline: "decoration-bad" },
  wrong_fact: { label: "Wrong fact", tone: "bad", underline: "decoration-bad" },
  dodged: { label: "Dodged", tone: "bad", underline: "decoration-bad" },
};

const INK: Record<Tone, string> = { good: "text-good-ink", warn: "text-warn-ink", bad: "text-bad-ink" };

// What the presenter said on each slide, with n8n's marks underlined in place and numbered, what came across and what didn't,
// the time against the plan, and the talk track for next time.
export function Transcript({ slides, bundle }: { slides: DebriefSlide[]; bundle: Bundle }) {
  const said = [...slides].sort((a, b) => a.index - b.index);
  if (said.length === 0) return null;
  return (
    <Card title="What you said, slide by slide" aside={<Legend />}>
      <ol className="flex flex-col divide-y divide-line">
        {said.map((s) => (
          <SlideBlock key={s.index} slide={s} title={bundle.slides.find((b) => b.index === s.index)?.title} />
        ))}
      </ol>
    </Card>
  );
}

function SlideBlock({ slide, title }: { slide: DebriefSlide; title?: string }) {
  const { parts, placed } = markUp(slide.transcript, slide.marks);
  const over = slide.target_seconds > 0 && slide.seconds > slide.target_seconds * 1.3;
  return (
    <li className="grid gap-4 py-5 first:pt-0 last:pb-0 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold">
            {slideLabel(slide.index)}
            {title ? `: ${title}` : ""}
          </h3>
          <p className={`inline-flex items-center gap-1 text-xs ${over ? "text-warn-ink" : "text-ink-2"}`}>
            {over && <StatusIcon tone="warn" className="size-3" />}
            {clock(slide.seconds)}
            {slide.target_seconds > 0 ? ` of ${clock(slide.target_seconds)} planned` : ""}
            {over ? ", over" : ""}
            {slide.words_per_minute > 0 ? `, ${slide.words_per_minute} words a minute` : ""}
          </p>
        </div>
        {slide.transcript ? (
          <p className="text-[15px] leading-7">
            {parts.map((p, i) =>
              p.mark ? (
                <span key={i} className={`underline decoration-2 underline-offset-4 ${KIND[p.mark.kind].underline}`}>
                  {p.text}
                  <sup className={`ml-0.5 text-[10px] font-semibold no-underline ${INK[KIND[p.mark.kind].tone]}`}>{p.n}</sup>
                </span>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
          </p>
        ) : (
          <p className="text-sm text-muted">Nothing said on this slide.</p>
        )}
        {placed.length > 0 && (
          <ol className="flex flex-col gap-2">
            {placed.map(({ mark, n }) => (
              <li key={n} className="flex gap-2 text-sm">
                <span className={`inline-flex shrink-0 items-start gap-1 text-xs font-medium ${INK[KIND[mark.kind].tone]}`}>
                  <span className="tabular-nums">{n}</span>
                  <StatusIcon tone={KIND[mark.kind].tone} className="mt-0.5 size-3" />
                  {KIND[mark.kind].label}
                </span>
                <span className="text-ink-2">
                  {mark.note}
                  {mark.better && <span className="block text-ink">Try: “{mark.better}”</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <aside className="flex flex-col gap-3 text-sm">
        {(slide.covered.length > 0 || slide.missed.length > 0) && (
          <ul className="flex flex-col gap-1">
            {slide.covered.map((c) => (
              <li key={`c-${c}`} className="flex items-start gap-1.5 text-good-ink">
                <StatusIcon tone="good" className="mt-1 size-3 shrink-0" />
                <span><span className="sr-only">Came across: </span>{c}</span>
              </li>
            ))}
            {slide.missed.map((m) => (
              <li key={`m-${m}`} className="flex items-start gap-1.5 text-bad-ink">
                <StatusIcon tone="bad" className="mt-1 size-3 shrink-0" />
                <span><span className="sr-only">Missed: </span>{m}</span>
              </li>
            ))}
          </ul>
        )}
        {slide.notes && (
          <div className="rounded-xl bg-paper px-4 py-3">
            <p className="mb-1 text-xs font-semibold">Next time</p>
            <p className="text-ink-2">{slide.notes}</p>
          </div>
        )}
      </aside>
    </li>
  );
}

function Legend() {
  const shown: TranscriptMark["kind"][] = ["landed", "hedge", "filler", "unsupported"];
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2" aria-label="What the underlines mean">
      {shown.map((k) => (
        <li key={k} className="inline-flex items-center gap-1">
          <span aria-hidden="true" className={`underline decoration-2 underline-offset-4 ${KIND[k].underline}`}>abc</span>
          {KIND[k].label}
        </li>
      ))}
    </ul>
  );
}

// Splits the transcript around each mark's quote (its first place not already marked), numbering the marks in reading order
function markUp(text: string, marks: TranscriptMark[]) {
  const spans: { start: number; end: number; mark: TranscriptMark }[] = [];
  for (const mark of marks) {
    const lower = text.toLowerCase();
    const q = mark.quote.toLowerCase();
    let at = lower.indexOf(q);
    while (at >= 0 && spans.some((s) => at < s.end && at + q.length > s.start)) at = lower.indexOf(q, at + 1);
    if (at >= 0 && q.length > 0) spans.push({ start: at, end: at + q.length, mark });
  }
  spans.sort((a, b) => a.start - b.start);
  const parts: { text: string; mark?: TranscriptMark; n?: number }[] = [];
  const placed: { mark: TranscriptMark; n: number }[] = [];
  let pos = 0;
  spans.forEach((s, i) => {
    if (s.start > pos) parts.push({ text: text.slice(pos, s.start) });
    parts.push({ text: text.slice(s.start, s.end), mark: s.mark, n: i + 1 });
    placed.push({ mark: s.mark, n: i + 1 });
    pos = s.end;
  });
  if (pos < text.length) parts.push({ text: text.slice(pos) });
  return { parts, placed };
}
