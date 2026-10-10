import Link from "next/link";
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

export default function NewMeetingPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex items-baseline gap-4">
        <Link href="/" className="font-display text-2xl">DryRun</Link>
        <Link href="/" className="text-sm text-ink-2 hover:text-ink">← Your meetings</Link>
      </header>
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-4xl leading-tight">Add a meeting</h1>
        <p className="text-ink-2">
          Meetings on your Google Calendar are picked up by themselves. Use this for one that isn&apos;t there: n8n researches it and writes
          your brief in about a minute.
        </p>
      </section>
      <AddMeetingForm sample={SAMPLE} ownerEmail={process.env.DRYRUN_OWNER_EMAIL ?? ""} />
    </div>
  );
}
