import { Suspense } from "react";
import { connection } from "next/server";
import type { AvatarId, ColorIndex, Twin } from "@/lib/contract";
import { N8N_URL } from "@/lib/api";
import { AVATARS } from "@/lib/personas";
import { getTwin, getTwinRun, norm, rememberLook } from "@/lib/twins";
import { TwinPage } from "@/components/twin/TwinPage";

export const metadata = { title: "DryRun twin" };

// One person's twin (contract 0.27). Opened from a brief, it carries how they sit at the practice table (avatar, colour) and what the
// meeting says about them (name, company), for the portrait and a first build.
export default function TwinRoute({ params, searchParams }: PageProps<"/people/[email]">) {
  return (
    <Suspense fallback={<p className="px-8 py-24 text-sm text-muted">Opening the twin…</p>}>
      {Promise.all([params, searchParams]).then(([{ email }, q]) => (
        <Twin email={decodeURIComponent(email)} q={q} />
      ))}
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function Twin({ email, q }: { email: string; q: Record<string, string | string[] | undefined> }) {
  await connection();
  const e = norm(email);
  const stored = await getTwin(e);
  const avatar = AVATARS.some((a) => a.id === one(q.avatar)) ? (one(q.avatar) as AvatarId) : undefined;
  const color = /^[0-5]$/.test(one(q.color)) ? (Number(one(q.color)) as ColorIndex) : undefined;
  if (stored && avatar) await rememberLook(e, { avatar, color });
  const name = one(q.name);
  const company = one(q.company);
  // Nobody DryRun knows yet: an empty twin, ready to build
  const twin: Twin = stored?.twin ?? { email: e, aliases: [], name, company, role: null, sources: [], facts: [], readings: [], meetings: [], predictions: [], build_log: [], updated: "", sample: false };
  return (
    <TwinPage
      initial={twin}
      look={{ avatar: avatar ?? stored?.look?.avatar, color: color ?? stored?.look?.color }}
      n8n={!!N8N_URL}
      ask={{ name: name || twin.name, company: company || twin.company, domain: one(q.domain) }}
      run={getTwinRun(e)}
    />
  );
}
