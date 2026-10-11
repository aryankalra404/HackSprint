import { redirect } from "next/navigation";

// Temporary shortcut to the sample dashboard after a session (its "Open full report" goes to the report), until real sessions get a debrief
export default function ReportShortcut() {
  redirect("/s/demo");
}
