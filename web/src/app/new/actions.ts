"use server";

import { redirect } from "next/navigation";
import { addMeeting } from "@/lib/api";

type Result = { ok: false; error: string };

// Hands the meeting to n8n, then opens its brief page, which fills in once n8n has researched it (about a minute)
export async function addMeetingAction(form: {
  title: string;
  company: string;
  website: string;
  context: string;
  attendees: string;
  owner_email: string;
}): Promise<Result> {
  if (!form.company.trim()) return { ok: false, error: "Name the company you're meeting." };
  const id = `web-${Date.now().toString(36)}`;
  // "Priya Nair <priya@kaveri.in>, rajiv@kaveri.in" → [{ name, email }]
  const attendees = form.attendees
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.*?)\s*<([^>]+)>$/);
      const email = (m ? m[2] : s).trim();
      const name = (m ? m[1] : email.split("@")[0].replace(/[._]/g, " ")).trim();
      return { name, email };
    });
  try {
    await addMeeting({
      id,
      title: form.title.trim() || `Meeting with ${form.company.trim()}`,
      company: form.company.trim(),
      website: form.website.trim(),
      context: form.context.trim(),
      attendees,
      owner_email: form.owner_email.trim() || process.env.DRYRUN_OWNER_EMAIL || "",
    });
  } catch {
    return { ok: false, error: "n8n didn't take the meeting. Check that the DryRun prep workflow is active, then try again." };
  }
  redirect(`/m/${process.env.DRYRUN_N8N_URL ? id : "demo-meeting"}`);
}
