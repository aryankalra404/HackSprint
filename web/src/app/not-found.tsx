import Link from "next/link";
import { PageTitle, ReadingPage } from "@/components/shell";
import { btn } from "@/components/ui";

// A meeting, session or person DryRun doesn't know, or a mistyped address
export default function NotFound() {
  return (
    <ReadingPage>
      <PageTitle
        eyebrow="Not found"
        title="Nothing here"
        lead="DryRun doesn't know this meeting, rehearsal or person. It may have been made on the other laptop, or the link is wrong."
      />
      <div className="flex flex-wrap gap-2">
        <Link href="/" className={btn("primary")}>Your meetings</Link>
        <Link href="/people" className={btn("secondary")}>People</Link>
      </div>
    </ReadingPage>
  );
}
