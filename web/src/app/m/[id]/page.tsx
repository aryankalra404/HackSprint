import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMeeting, n8nProblem, n8nRunUrl } from "@/lib/api";
import type { MeetingDetail } from "@/lib/contract";
import { hasStarted, meetingWhen, stillResearching, untilLabel } from "@/lib/format";
import { PersonaAvatar } from "@/components/ui";
import { MeetingStatus } from "@/components/meetings/MeetingStatus";
import { PractiseButton } from "@/components/meetings/PractiseButton";
import { RefreshWhileResearching } from "@/components/meetings/RefreshWhileResearching";
import { LiveProgress } from "@/components/meetings/LiveProgress";
import { PrepareAnyway } from "@/components/meetings/PrepareAnyway";
import { Rehearsals } from "@/components/meetings/Rehearsals";
import { HowDidItGo } from "@/components/meetings/HowDidItGo";
import { HowItWent } from "@/components/meetings/HowItWent";
import { YourSide } from "@/components/brief/YourSide";
import { getProfile } from "@/lib/profile";
import { getDeckReview } from "@/lib/deckReview";
import { DeckReview } from "@/components/brief/DeckReview";
import { twinSummaries } from "@/lib/twins";
import { sampleTwin } from "@/lib/mock/twin";
import { SAMPLE_ID } from "@/lib/mock/sample";
import { sinceFromTwin, shortDate } from "@/lib/twinView";
import type { SinceLastTime, TwinSummary } from "@/lib/contract";

export const metadata = { title: "DryRun brief" };

export default function MeetingPage({ params }: PageProps<"/m/[id]">) {
  return (
    <Suspense fallback={<p className="px-8 py-24 text-sm text-muted">Loading the brief…</p>}>
      {params.then(({ id }) => (
        <Meeting id={decodeURIComponent(id)} />
      ))}
    </Suspense>
  );
}

async function Meeting({ id }: { id: string }) {
  let detail: MeetingDetail | null;
  try {
    detail = await getMeeting(id);
  } catch (err) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-8">
        <Link href="/" className="font-display text-2xl">DryRun</Link>
        <p role="alert" className="rounded-2xl border border-line bg-surface p-5 text-sm text-ink-2">
          Couldn&apos;t reach n8n for this meeting. {n8nProblem(err)}
        </p>
      </div>
    );
  }
  // A meeting just added from the web app takes a few seconds to reach n8n's table
  if (!detail && id.startsWith("web-")) return <JustAdded />;
  if (!detail) notFound();
  const { meeting, brief, proposal } = detail;
  const [profile, review, twins] = await Promise.all([getProfile(), getDeckReview(id), twinSummaries(meeting.attendees)]);
  // After the real meeting has started (0.28): "How did it go?", then what n8n found. The sample meeting never happens.
  const happened = meeting.id !== SAMPLE_ID && meeting.status !== "researching" && hasStarted(meeting.start);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-4">
          <Link href="/" className="font-display text-2xl">DryRun</Link>
          <Link href="/" className="text-sm text-ink-2 hover:text-ink">← Your meetings</Link>
        </div>
        <MeetingStatus status={meeting.status} />
      </header>

      <section className="flex flex-col gap-2">
        <p className="text-sm text-ink-2">
          {meeting.company !== meeting.title && `${meeting.company}, `}
          {meetingWhen(meeting.start)} ({untilLabel(meeting.start)})
        </p>
        <h1 className="font-display text-4xl leading-tight">{meeting.title}</h1>
        {meeting.why && <p className="max-w-3xl text-ink-2">{meeting.why}</p>}
        {brief && meeting.progress && meeting.progress.length > 0 && <HowPrepared meeting={meeting} />}
      </section>

      {meeting.after ? (
        <HowItWent after={meeting.after} runUrl={n8nRunUrl(meeting.after.run)} />
      ) : (
        happened && <HowDidItGo meetingId={meeting.id} names={meeting.attendees.map((a) => a.name.split(" ")[0]).filter(Boolean)} />
      )}

      {brief && proposal && (
        <YourSide meetingId={meeting.id} guess={proposal.goal ?? null} own={profile.goals[meeting.id] ?? ""} offer={profile.offer} />
      )}

      {review && <DeckReview meetingId={meeting.id} initial={review} />}

      {detail.sessions && detail.sessions.length > 0 && <Rehearsals sessions={detail.sessions} />}

      {meeting.status === "skipped" ? (
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-6">
          <h2 className="font-display text-2xl">n8n skipped this one</h2>
          <p className="max-w-2xl text-sm text-ink-2">
            It read the invite and decided it isn&apos;t worth a brief or a rehearsal, for the reason above. If it matters to you, n8n will
            research it and brief you like any other meeting.
          </p>
          <PrepareAnyway meetingId={meeting.id} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-surface disabled:opacity-60" />
        </section>
      ) : !brief ? (
        meeting.progress && meeting.progress.length > 0 ? (
          <>
            {stillResearching(meeting) && <RefreshWhileResearching />}
            <LiveProgress
              meetingId={meeting.id}
              title={meeting.title}
              progress={meeting.progress}
              startedAt={meeting.started_at ?? null}
              runUrl={n8nRunUrl(meeting.run)}
              runId={meeting.run?.execution_id ?? null}
            />
          </>
        ) : (
          <Researching company={meeting.company} />
        )
      ) : (
        <BriefBody detail={{ ...detail, brief }} twins={twins} />
      )}

      {brief && proposal && (
        <section id="practise" className="scroll-mt-6 flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-2xl">{meeting.practice ? "Practise it again" : "Practise this meeting"}</h2>
            <p className="max-w-xl text-sm text-ink-2">
              Rehearse against the people coming, plus practice roles that usually weigh in on a decision like this. You can change anyone
              before you start. The practice roles are hypothetical and never appear in your brief.
            </p>
            <ul className="flex flex-wrap gap-3">
              {proposal.members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-full border border-line py-1 pr-3 pl-1">
                  <PersonaAvatar persona={m} size={28} />
                  <span className="text-sm">{m.display_name}</span>
                  <span className="text-xs text-muted">{m.source === "email" ? "Attending" : `Practice: ${m.role_short}`}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="shrink-0">
            <PractiseButton meetingId={meeting.id} />
          </div>
        </section>
      )}
    </div>
  );
}

// "How n8n prepared this": the finished run's steps, for pointing at during a demo
function HowPrepared({ meeting }: { meeting: NonNullable<MeetingDetail["meeting"]> }) {
  const runUrl = n8nRunUrl(meeting.run);
  return (
    <details className="group w-fit max-w-3xl text-sm">
      <summary className="cursor-pointer list-none text-ink-2 hover:text-ink">
        <span className="underline decoration-line">How n8n prepared this</span> <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">›</span>
      </summary>
      <ol className="mt-3 flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-4">
        {(meeting.progress ?? []).map((s) => (
          <li key={s.id} className="flex gap-2">
            <span className="w-20 shrink-0 font-medium">{s.label}</span>
            <span className={s.state === "error" ? "text-bad-ink" : "text-ink-2"}>{s.detail}</span>
          </li>
        ))}
        {runUrl && (
          <li className="pt-2">
            <a href={runUrl} target="_blank" rel="noreferrer" className="text-ink-2 underline decoration-line hover:text-ink">
              Open this run in n8n ↗
            </a>
          </li>
        )}
      </ol>
    </details>
  );
}

function JustAdded() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-8">
      <Link href="/" className="font-display text-2xl">DryRun</Link>
      <Researching company="the company" />
    </div>
  );
}

function Researching({ company }: { company: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6">
      <RefreshWhileResearching />
      <h2 className="font-display text-2xl">n8n is preparing this meeting</h2>
      <p className="text-sm text-ink-2">
        It&apos;s reading your recent emails with the attendees, researching {company} on the web, and writing your brief. This takes about a
        minute; this page updates by itself.
      </p>
    </section>
  );
}

function BriefBody({ detail, twins }: { detail: MeetingDetail & { brief: NonNullable<MeetingDetail["brief"]> }; twins: Record<string, TwinSummary> }) {
  const { brief, meeting } = detail;
  const attendeeNames = brief.attendees.map((a) => a.name);
  // How each attendee sits at the practice table, so their twin's portrait matches
  const seatOf = (name: string) => detail.proposal?.members.find((m) => m.source === "email" && m.display_name === name);
  // The sample's brief comes from its sample twin; a real one from n8n (GET /meeting joins the twins)
  const since: SinceLastTime[] = brief.since_last_time ?? (meeting.id === SAMPLE_ID ? [sinceFromTwin(sampleTwin())].filter((x): x is SinceLastTime => !!x) : []);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-8">
        <p className="text-lg leading-relaxed">{brief.summary}</p>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-ink">Who&apos;s coming</h2>
          {brief.attendees.length === 0 ? (
            <p className="text-sm text-muted">No attendees were named in the invite.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
              {brief.attendees.map((a) => (
                <li key={a.email || a.name} className="flex flex-col gap-1 p-4">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{a.name}</span>
                    {a.role && <span className="text-sm text-ink-2">{a.role}</span>}
                    {a.email && <span className="text-xs text-muted">{a.email}</span>}
                  </span>
                  {a.likely_focus && <span className="text-sm text-ink-2">Likely focus: {a.likely_focus}</span>}
                  {a.email.includes("@") && <TwinButton email={a.email} name={a.name} company={meeting.company} summary={twins[a.email.toLowerCase()]} seat={seatOf(a.name)} />}
                </li>
              ))}
            </ul>
          )}
        </section>

        {since.length > 0 && <SinceLastTimeSection since={since} />}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-ink">Questions likely to come up</h2>
          <ol className="flex flex-col gap-2">
            {brief.questions.map((q, i) => (
              <li key={i}>
                <details className="group rounded-2xl border border-line bg-surface p-4 open:border-ink">
                  <summary className="flex cursor-pointer list-none items-start gap-3">
                    <span className="font-display text-ink-2">{i + 1}</span>
                    <span className="flex-1">
                      {q.question}
                      {attendeeNames.includes(q.asked_by) && <span className="text-sm text-muted"> (likely from {q.asked_by})</span>}
                    </span>
                    <span aria-hidden="true" className="text-ink-2 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 text-sm">
                    <p><span className="font-semibold">Suggested answer:</span> {q.suggested_answer}</p>
                    <p className="text-ink-2"><span className="font-semibold">Why it&apos;s likely:</span> {q.why}</p>
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </section>

        {brief.risks.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-ink">What could lose it</h2>
            <ul className="list-disc pl-5 text-ink-2">
              {brief.risks.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-6">
        <section className="flex flex-col gap-3 rounded-2xl bg-paper p-5">
          <h2 className="text-sm font-semibold text-ink">About {meeting.company}</h2>
          <p className="text-sm">{brief.company.what_they_do}</p>
          {brief.company.recent_news.length > 0 && (
            <ul className="flex flex-col gap-2 text-sm">
              {brief.company.recent_news.map((n, i) => (
                <li key={i}>
                  {n.date && <span className="font-medium">{n.date}: </span>}
                  <span className="text-ink-2">{n.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {brief.sources.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-ink">Sources</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {brief.sources.map((s) => (
                <li key={s.url} className="truncate">
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-ink-2 underline decoration-line hover:text-ink">
                    {s.title || s.url}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

// Each real attendee's twin (0.27), with an honest status from counts
function TwinButton({ email, name, company, summary, seat }: { email: string; name: string; company: string; summary?: TwinSummary; seat?: { avatar: string; color: number } }) {
  const q = new URLSearchParams({ name, company, ...(seat ? { avatar: seat.avatar, color: String(seat.color) } : {}) });
  const status = !summary
    ? "New: build it from your emails"
    : summary.to_check > 0
      ? `${summary.facts} ${summary.facts === 1 ? "fact" : "facts"}, ${summary.to_check} to check`
      : `${summary.meetings ? `${summary.meetings} ${summary.meetings === 1 ? "meeting" : "meetings"}, ` : ""}${summary.facts} ${summary.facts === 1 ? "fact" : "facts"}`;
  return (
    <Link href={`/people/${encodeURIComponent(email.toLowerCase())}?${q}`} className="mt-1 inline-flex w-fit items-center gap-2 rounded-full border border-line px-3 py-1 text-xs hover:border-ink">
      <span className="font-medium">Twin</span>
      <span className="text-ink-2">{status}</span>
    </Link>
  );
}

// "Email of 3 Oct", "Your note of 22 Sept": the source without its subject, with a short date
const fromLabel = (f: { source: string; date: string }) => {
  const head = f.source.split(":")[0].replace(/\d{4}-\d{2}-\d{2}/, shortDate(f.date));
  return head.charAt(0).toUpperCase() + head.slice(1);
};

// What each person you've met before raised, and what you promised them: facts from their twin, with dates and sources
function SinceLastTimeSection({ since }: { since: SinceLastTime[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-ink">Since last time</h2>
      <ul className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
        {since.map((s) => (
          <li key={s.email} className="flex flex-col gap-2">
            <Link href={`/people/${encodeURIComponent(s.email)}`} className="w-fit font-medium hover:underline">{s.name}</Link>
            {s.raised.length > 0 && (
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-ink-2">Raised</span>
                {s.raised.map((f) => (
                  <span key={f.text}>
                    {f.text} <span className="text-xs text-muted">({fromLabel(f)})</span>
                  </span>
                ))}
              </div>
            )}
            {s.promised.length > 0 && (
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-ink-2">You promised</span>
                {s.promised.map((f) => (
                  <span key={f.text}>
                    {f.text} <span className="text-xs text-muted">({fromLabel(f)})</span>
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
