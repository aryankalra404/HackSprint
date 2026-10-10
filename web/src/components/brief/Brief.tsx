"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { BriefInput, DraftMember, PanelProposal, Seat } from "@/lib/contract";
import { ALL_SEATS } from "@/lib/personas";
import { briefPanelAction, proposePanelAction } from "@/app/new/actions";
import { PanelTable, type Selection } from "./PanelTable";
import { PanelEditor } from "./PanelEditor";

interface Props {
  sample: { company: string; website: string; context: string };
}

// New rehearsal: describe the meeting, let n8n propose the panel, edit it on the table, then brief it.
export function Brief({ sample }: Props) {
  const [form, setForm] = useState({ company: "", website: "", context: "", name: "", email: "" });
  const [proposal, setProposal] = useState<PanelProposal | null>(null);
  const [members, setMembers] = useState<DraftMember[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposing, startProposing] = useTransition();
  const [briefing, startBriefing] = useTransition();

  const input: BriefInput = {
    presenter: { name: form.name, email: form.email },
    deck: { pdf_url: "", slide_image_urls: [] },
    prospect: { company: form.company, website: form.website, context: form.context },
  };

  function propose(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startProposing(async () => {
      const res = await proposePanelAction(input);
      if (!res.ok) return setError(res.error);
      setProposal(res.value);
      setMembers(res.value.members.map((m) => ({ ...m, difficulty: 2 })));
    });
  }

  function brief() {
    if (!proposal) return;
    setError(null);
    startBriefing(async () => {
      const res = await briefPanelAction(input, proposal.draft_id, members);
      if (!res.ok) setError(res.error);
    });
  }

  function add(role: string, roleShort: string, why?: string) {
    const seat: Seat | undefined =
      selection?.kind === "seat" ? selection.seat : ALL_SEATS.find((s) => !members.some((m) => m.seat === s));
    if (seat == null) return;
    const id = `p${Math.max(0, ...members.map((m) => Number(m.id.slice(1)) || 0)) + 1}`;
    setMembers((ms) => [...ms, { id, seat, role, role_short: roleShort, display_name: "", difficulty: 2, why }]);
    setSelection({ kind: "person", id });
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <Link href="/" className="font-display text-2xl">DryRun</Link>
          <span className="text-sm text-ink-2">{proposal ? `Pitch to ${form.company}` : "New rehearsal"}</span>
        </div>
        {proposal && (
          <button type="button" onClick={() => { setProposal(null); setSelection(null); }} className="text-sm text-ink-2 hover:text-ink">
            ← Change the meeting details
          </button>
        )}
      </header>

      {!proposal ? (
        <main className="mx-auto w-full max-w-2xl py-6">
          <h1 className="font-display text-4xl leading-tight">Who are you pitching to?</h1>
          <p className="mt-2 text-ink-2">
            n8n researches the company, reads your deck and the meeting email, and proposes who will be in the room. You can change anyone before you rehearse.
          </p>
          <form onSubmit={propose} className="mt-8 flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Company" id="company" required value={form.company} onChange={(v) => setForm({ ...form, company: v })} placeholder="e.g. Kaveri Freight" />
              <Field label="Website" id="website" value={form.website} onChange={(v) => setForm({ ...form, website: v })} placeholder="kaverifreight.in" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="context" className="text-sm font-medium">Meeting email or notes</label>
              <textarea
                id="context"
                rows={7}
                value={form.context}
                onChange={(e) => setForm({ ...form, context: e.target.value })}
                placeholder="Paste the invite. Anyone named in it gets a seat at the table."
                className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-ink focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="deck" className="text-sm font-medium">Your deck (PDF)</label>
              <input id="deck" type="file" accept="application/pdf" className="text-sm file:mr-3 file:rounded-full file:border file:border-line file:bg-surface file:px-4 file:py-2 file:text-sm" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Your name" id="name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label="Your email" id="email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} hint="The report is sent here." />
            </div>
            {error && <p role="alert" className="text-sm text-bad-ink">{error}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={proposing} className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-surface disabled:opacity-60">
                {proposing ? "n8n is working out who'll be in the room…" : "Propose the panel"}
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, ...sample })}
                className="rounded-full border border-line bg-surface px-5 py-3 text-sm hover:border-ink"
              >
                Use the {sample.company} sample
              </button>
            </div>
          </form>
        </main>
      ) : (
        <main className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="flex min-h-0 flex-col rounded-2xl border border-line bg-surface p-4" aria-label="The table">
            <div className="hidden min-h-0 flex-1 md:block">
              <PanelTable members={members} selection={selection} onSelect={setSelection} />
            </div>
          </section>
          <aside className="flex min-h-0 flex-col rounded-2xl border border-line bg-surface">
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <PanelEditor
                company={form.company}
                members={members}
                suggestions={proposal.suggestions}
                selection={selection}
                onSelect={setSelection}
                onChange={(id, patch) => setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)))}
                onRemove={(id) => {
                  setMembers((ms) => ms.filter((m) => m.id !== id));
                  setSelection(null);
                }}
                onAdd={add}
              />
            </div>
            <footer className="flex flex-col gap-2 border-t border-line p-5">
              {error && <p role="alert" className="text-sm text-bad-ink">{error}</p>}
              <button
                type="button"
                onClick={brief}
                disabled={briefing || members.length === 0 || members.some((m) => !m.role.trim())}
                className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-surface disabled:opacity-50"
              >
                {briefing ? "Briefing the panel…" : `Brief the panel (${members.length})`}
              </button>
              <p className="text-xs text-muted">n8n writes each person&apos;s priorities and objections, then gives you a join code for the headset.</p>
            </footer>
          </aside>
        </main>
      )}
    </div>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  placeholder,
  hint,
  type = "text",
  required = false,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-ink focus:outline-none"
      />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
