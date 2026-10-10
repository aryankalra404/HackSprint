import type { Meeting } from "@/lib/contract";

const LOOK: Record<Meeting["status"], { label: string; dot: string }> = {
  researching: { label: "n8n is researching", dot: "animate-pulse bg-warn" },
  ready: { label: "Brief ready", dot: "bg-good" },
  practised: { label: "Practised", dot: "bg-ink" },
  done: { label: "Done", dot: "bg-axis" },
  failed: { label: "Couldn't prepare", dot: "bg-bad" },
};

export function MeetingStatus({ status }: { status: Meeting["status"] }) {
  const look = LOOK[status] ?? LOOK.ready;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs whitespace-nowrap">
      <span aria-hidden="true" className={`size-2 rounded-full ${look.dot}`} />
      {look.label}
    </span>
  );
}
