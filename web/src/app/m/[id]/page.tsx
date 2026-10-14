import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMeeting, n8nProblem, n8nRunUrl } from "@/lib/api";
import type { MeetingDetail } from "@/lib/contract";
import { hasStarted, meetingWhen, stillResearching, untilLabel } from "@/lib/format";
import { PersonaAvatar, SectionHead, StatusIcon, btn } from "@/components/ui";
import { Loading, PageTitle, ReadingPage } from "@/components/shell";
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
import { twinSummaries } from "@/lib/twins";
import { shortDate } from "@/lib/twinView";
import type { SinceLastTime, TwinSummary } from "@/lib/contract";

export const metadata = { title: "DryRun brief" };

export default function MeetingPage({ params }: PageProps<"/m/[id]">) {
  return (
    <ReadingPage active="meetings">
      <Suspense fallback={<Loading>Reading the brief…</Loading>}>
        {params.then(({ id }) => (
          <Meeting id={decodeURIComponent(id)} />
        ))}
      </Suspense>
    </ReadingPage>
  );
}

async function Meeting({ id }: { id: string }) {
  let detail: MeetingDetail | null;
  try {
    detail = await getMeeting(id);
  } catch (err) {
    return (
      <p role="alert" className="rounded-2xl border border-line bg-surface p-5 text-sm text-ink-2">
        Couldn&apos;t reach n8n for this meeting. {n8nProblem(err)}
      </p>
    );
  }
  // A meeting just added from the web app takes a few seconds to reach n8n's table
  if (!detail && id.startsWith("web-")) return <JustAdded />;
  if (!detail) notFound();
  const { meeting, brief, proposal } = detail;
  const [profile, twins] = await Promise.all([getProfile(), twinSummaries(meeting.attendees)]);
  // After the real meeting has started (0.28): "How did it go?", then what n8n found
  const happened = meeting.status !== "researching" && hasStarted(meeting.start);
  return (
    <>
      <div className="flex flex-col gap-4">
        <PageTitle
          crumbs={[{ label: "Meetings", href: "/" }]}
          eyebrow={`${meeting.company !== meeting.title ? `${meeting.company}, ` : ""}${meetingWhen(meeting.start)} (${untilLabel(meeting.start)})`}
          title={meeting.title}
          lead={meeting.why}
          aside={
            <>
              <MeetingStatus status={meeting.status} />
              {brief && proposal && (
                <a href="#practise" className={btn("primary")}>
                  {meeting.practice ? "Practise again" : "Practise"}
                </a>
              )}
            </>
          }
        />
        {brief && meeting.progress && meeting.progress.length > 0 && <HowPrepared meeting={meeting} />}
      </div>

      {meeting.after ? (
        <HowItWent after={meeting.after} runUrl={n8nRunUrl(meeting.after.run)} />
      ) : (
        happened && <HowDidItGo meetingId={meeting.id} names={meeting.attendees.map((a) => a.name.split(" ")[0]).filter(Boolean)} />
      )}

      {brief && proposal && (
        <YourSide meetingId={meeting.id} guess={proposal.goal ?? null} own={profile.goals[meeting.id] ?? ""} offer={profile.offer} />
      )}

      {detail.sessions && detail.sessions.length > 0 && <Rehearsals sessions={detail.sessions} />}

      {meeting.status === "skipped" ? (
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-ink bg-surface p-5 sm:p-6">
          <h2 className="font-display text-xl">n8n skipped this one</h2>
          <p className="max-w-2xl text-sm text-ink-2">
            It read the invite and decided it isn&apos;t worth a brief or a rehearsal, for the reason above. If it matters to you, n8n will
            research it and brief you like any other meeting.
          </p>
          <PrepareAnyway meetingId={meeting.id} className={btn("primary")} />
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
        <section id="practise" className="flex scroll-mt-6 flex-col gap-5 rounded-2xl border border-ink bg-surface p-5 sm:p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-xl">{meeting.practice ? "Practise it again" : "Practise this meeting"}</h2>
            <p className="max-w-xl text-sm text-ink-2">
              Rehearse against the people coming, plus practice roles that usually weigh in on a decision like this. You can change anyone
              before you start. The practice roles are hypothetical and never appear in your brief.
            </p>
            <ul className="flex flex-wrap gap-2">
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
    </>
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
    <Researching company="the company" />
  );
}

function Researching({ company }: { company: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <RefreshWhileResearching />
      <h2 className="flex items-center gap-3 font-display text-xl">
        <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-line border-t-ink" />
        n8n is preparing this meeting
      </h2>
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
  // From n8n: GET /meeting joins the attendees' twins
  const since: SinceLastTime[] = brief.since_last_time ?? [];
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
      <div className="flex min-w-0 flex-col gap-12">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-ink-2">In short</h2>
          <p className="text-pretty text-xl leading-relaxed">{brief.summary}</p>
        </section>

        <section className="flex flex-col gap-4">
          <SectionHead title={"Who's coming"} count={brief.attendees.length} />
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

        <section className="flex flex-col gap-4">
          <SectionHead title="Questions likely to come up" note="Open one for a suggested answer and why n8n expects it." />
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
          <section className="flex flex-col gap-4">
            <SectionHead title="What could lose it" />
            <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
              {brief.risks.map((r) => (
                <li key={r} className="flex items-start gap-3 p-4">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-warn/15 text-warn-ink">
                    <StatusIcon tone="warn" className="size-3.5" />
                  </span>
                  {r}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-8 lg:sticky lg:top-6 lg:self-start">
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-base">About {meeting.company}</h2>
          <p className="text-sm">{brief.company.what_they_do}</p>
          {brief.company.recent_news.length > 0 && (
            <ul className="flex flex-col gap-2 text-sm">
              {brief.company.recent_news.map((n, i) => (
                <li key={i} className="flex flex-col gap-0.5 border-t border-line pt-2">
                  {n.date && <span className="text-xs font-medium text-ink-2">{n.date}</span>}
                  <span>{n.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {brief.sources.length > 0 && (
          <section className="flex flex-col gap-2 px-1">
            <h2 className="text-sm font-medium text-ink-2">Sources</h2>
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
      <SectionHead title="Since last time" note={"What each person you've met before raised, and what you promised them."} />
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
