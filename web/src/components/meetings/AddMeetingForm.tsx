"use client";

import { useState, useTransition } from "react";
import { addMeetingAction } from "@/app/new/actions";
import { btn } from "../ui";

const FIELD = "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-normal placeholder:text-muted focus:border-ink focus:outline-none";

interface Sample {
  title: string;
  company: string;
  website: string;
  context: string;
  attendees: string;
}

// Add a meeting by hand (most arrive from the calendar). n8n researches it and writes the brief.
export function AddMeetingForm({ sample, ownerEmail }: { sample: Sample; ownerEmail: string }) {
  const [form, setForm] = useState({ title: "", company: "", website: "", context: "", attendees: "", owner_email: ownerEmail });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await addMeetingAction(form);
          if (res && !res.ok) setError(res.error);
        });
      }}
      className="flex flex-col gap-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Company
          <input required value={form.company} onChange={set("company")} placeholder="e.g. Delhivery" className={FIELD} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Website
          <input value={form.website} onChange={set("website")} placeholder="delhivery.com" className={FIELD} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Meeting title
        <input value={form.title} onChange={set("title")} placeholder="e.g. RouteIQ pitch" className={FIELD} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Who&apos;s coming
        <input value={form.attendees} onChange={set("attendees")} placeholder="Priya Nair <priya@delhivery.com>, rajiv@delhivery.com" className={FIELD} />
        <span className="text-xs font-normal text-muted">Their emails let n8n find your recent threads with them.</span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Meeting email or notes
        <textarea rows={6} value={form.context} onChange={set("context")} placeholder="Paste the invite or what you know about the meeting." className={FIELD} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Your email
        <input type="email" value={form.owner_email} onChange={set("owner_email")} placeholder="The brief is sent here" className={FIELD} />
      </label>
      {error && <p role="alert" className="text-sm text-bad-ink">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={btn("primary", "lg")}>
          {pending ? "Handing it to n8n…" : "Prepare this meeting"}
        </button>
        <button type="button" onClick={() => setForm({ ...form, ...sample })} className={btn("quiet", "lg")}>
          Use the {sample.company} sample
        </button>
      </div>
    </form>
  );
}
