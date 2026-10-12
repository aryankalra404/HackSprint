import { PageTitle, ReadingPage } from "@/components/shell";
import { AddMeetingForm } from "@/components/meetings/AddMeetingForm";

export const metadata = { title: "Add a meeting" };

const SAMPLE = {
  title: "RouteIQ pitch",
  company: "Delhivery",
  website: "delhivery.com",
  attendees: "Priya Nair <priya.nair@delhivery.com>, Rajiv Menon <rajiv.menon@delhivery.com>",
  context:
    "Demo of RouteIQ (AI route planning for truck fleets) for their ops and finance team. Priya (VP Operations) set it up; Rajiv from finance wants payback numbers at their fleet size.",
};

// What n8n does with it, in the order its progress shows on the brief
const STEPS = [
  ["Decide", "Reads the invite and decides if it's worth preparing, and says why."],
  ["Emails", "Reads your recent threads with the people coming."],
  ["Research", "The company's news and website, and the web if the news is thin."],
  ["Brief", "Who's coming, what they care about, what they'll ask, where you're exposed."],
  ["Panel", "Proposes a practice panel for the rehearsal."],
  ["Email", "Sends the brief to your inbox."],
];

export default function NewMeetingPage() {
  return (
    <ReadingPage active="meetings">
      <PageTitle
        crumbs={[{ label: "Meetings", href: "/" }]}
        title="Add a meeting"
        lead="Meetings on your Google Calendar are picked up by themselves. Use this for one that isn't there: n8n researches it and writes your brief in about a minute."
      />
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-16">
        <AddMeetingForm sample={SAMPLE} ownerEmail={process.env.DRYRUN_OWNER_EMAIL ?? ""} />
        <aside className="flex flex-col gap-4 lg:pt-1">
          <h2 className="text-sm font-medium text-ink-2">What n8n does next</h2>
          <ol className="flex flex-col">
            {STEPS.map(([label, line], i) => (
              <li key={label} className="relative flex gap-3 pb-5 last:pb-0">
                {i < STEPS.length - 1 && <span aria-hidden="true" className="absolute top-6 bottom-0 left-[11px] w-px bg-line" />}
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-xs text-ink-2">{i + 1}</span>
                <span className="flex flex-col gap-0.5 pt-0.5 text-sm">
                  <span className="font-medium">{label}</span>
                  <span className="text-ink-2">{line}</span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </ReadingPage>
  );
}
