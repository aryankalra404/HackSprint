import Link from "next/link";
import { Fragment, type ReactNode } from "react";

// The frame every page shares: one header (logo, where you are, the page's actions) and two widths. Reading pages (home, people,
// add a meeting, the brief, a twin, the report) sit in one column; workspace pages (practice, dashboard, rehearsal) fill the screen.

export type Section = "meetings" | "people" | "about";
export interface Crumb {
  label: string;
  href?: string;
}

const NAV: { id: Section; label: string; href: string }[] = [
  { id: "meetings", label: "Meetings", href: "/" },
  { id: "people", label: "People", href: "/people" },
  { id: "about", label: "About", href: "/about" },
];

// Reading pages show the app's sections; workspace pages show the trail to where you are instead, to keep the screen for the room
export function AppHeader({ active, trail, actions, className = "" }: { active?: Section; trail?: Crumb[]; actions?: ReactNode; className?: string }) {
  return (
    <header className={`flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line py-3 print:hidden ${className}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-1">
        <Link href="/" className="font-display text-xl">
          DryRun
        </Link>
        {trail ? (
          <Trail crumbs={trail} />
        ) : (
          <nav aria-label="DryRun" className="-ml-2 flex items-center text-sm">
            {NAV.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                aria-current={n.id === active ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 ${n.id === active ? "font-medium text-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// "Meetings / RouteIQ pitch / Practice": every crumb but the last is a link
export function Trail({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Where you are" className="min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
        {crumbs.map((c, i) => (
          <li key={i} className="flex min-w-0 items-center gap-2">
            {i > 0 && (
              <span aria-hidden="true" className="text-axis">
                /
              </span>
            )}
            {c.href ? (
              <Link href={c.href} className="truncate text-ink-2 hover:text-ink">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate font-medium">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function ReadingPage({ active, actions, children }: { active?: Section; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-8 print:max-w-none print:px-0">
      <AppHeader active={active} actions={actions} />
      <main className="flex flex-1 flex-col gap-12 pt-8 pb-16 sm:pt-12">{children}</main>
      <footer className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-line py-6 text-xs text-muted print:hidden">
        <span>DryRun: n8n prepares the meeting, you rehearse it.</span>
        <span className="flex gap-4">
          <Link href="/about" className="hover:text-ink">How it works</Link>
          <a href="https://github.com/aryankalra404/HackSprint" target="_blank" rel="noreferrer" className="hover:text-ink">Source</a>
        </span>
      </footer>
    </div>
  );
}

// The top of a reading page: the way back and a line of context, the title, what it's for. `aside` sits on the right (a status, an action).
export function PageTitle({
  crumbs,
  eyebrow,
  title,
  lead,
  aside,
}: {
  crumbs?: { label: string; href: string }[];
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="flex max-w-3xl min-w-0 flex-col gap-3">
        {(crumbs || eyebrow) && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
            {crumbs?.map((c) => (
              <Fragment key={c.href}>
                <Link href={c.href} className="underline-offset-4 hover:text-ink hover:underline">
                  {c.label}
                </Link>
                <span aria-hidden="true" className="text-axis">
                  /
                </span>
              </Fragment>
            ))}
            {eyebrow && <span>{eyebrow}</span>}
          </p>
        )}
        <h1 className="text-balance font-display text-3xl leading-[1.1] sm:text-4xl">{title}</h1>
        {lead && <p className="max-w-2xl text-pretty text-ink-2">{lead}</p>}
      </div>
      {aside && <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div>}
    </div>
  );
}

// What a page shows while it loads, or when it can't show what was asked for
export function Loading({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted" role="status">
      <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />
      {children}
    </p>
  );
}
