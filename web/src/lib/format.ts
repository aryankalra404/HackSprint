export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function slideLabel(index: number): string {
  return `Slide ${index + 1}`;
}

export function momentLabel(t: number, slideIndex: number): string {
  return `${slideLabel(slideIndex)} at ${clock(t)}`;
}

// Whether n8n is still working on a meeting: researching, and started in the last few minutes (a run takes under a minute).
// A run that never finished stays "researching" in the table; pages stop re-reading it rather than call n8n forever.
export function stillResearching(m: { status: string; started_at?: string | null }): boolean {
  if (m.status !== "researching") return false;
  if (!m.started_at) return true;
  return Date.now() - Date.parse(m.started_at) < 5 * 60_000;
}

// "Thu 16 Oct, 3:00 pm", in Indian time
export function meetingWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

// The meeting has started (or is over)
export function hasStarted(iso: string, now = Date.now()): boolean {
  return Date.parse(iso) <= now;
}

// "today", "tomorrow", "in 3 days", "2 days ago"
export function untilLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = (t: number) => Math.floor((t + 5.5 * 3600000) / 86400000);
  const diff = day(d.getTime()) - day(now);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}
