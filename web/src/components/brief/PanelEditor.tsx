"use client";

import { useState } from "react";
import type { DraftMember, PanelProposal } from "@/lib/contract";
import { PersonaAvatar } from "../ui";
import { SOURCE_LABEL, type Selection } from "./PanelTable";

const TOUGHNESS: { value: DraftMember["difficulty"]; label: string }[] = [
  { value: 1, label: "Easy" },
  { value: 2, label: "Normal" },
  { value: 3, label: "Tough" },
];

// A short label for the timeline chips, from a role the presenter typed: "Head of IT Security" → "HITS"
export function shortRole(role: string): string {
  const r = role.trim();
  if (r.length <= 12) return r;
  return r
    .split(/\s+/)
    .filter((w) => !["of", "and", "the", "&"].includes(w.toLowerCase()))
    .map((w) => w[0].toUpperCase())
    .join("")
    .slice(0, 5);
}

interface Props {
  company: string;
  members: DraftMember[];
  suggestions: PanelProposal["suggestions"];
  selection: Selection;
  onSelect: (s: Selection) => void;
  onChange: (id: string, patch: Partial<DraftMember>) => void;
  onRemove: (id: string) => void;
  onAdd: (role: string, roleShort: string, why?: string) => void;
}

// The side column of the Brief screen: the panel overview, or an editor for whoever is selected on the table
export function PanelEditor(props: Props) {
  const { selection } = props;
  if (selection?.kind === "person") {
    const member = props.members.find((m) => m.id === selection.id);
    if (member) return <PersonEditor {...props} member={member} />;
  }
  if (selection?.kind === "seat") return <AddToSeat {...props} />;
  return <Overview {...props} />;
}

function Overview({ company, members, suggestions, onSelect, onAdd }: Props) {
  const full = members.length >= 6;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-xl">The panel</h2>
        <p className="mt-1 text-sm text-ink-2">
          Who will be in the room at {company}, as n8n reads it. Edit anyone, remove them, or add someone in an empty seat.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {[...members].sort((a, b) => a.seat - b.seat).map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => onSelect({ kind: "person", id: m.id })} className="flex w-full items-start gap-3 py-3 text-left hover:bg-paper">
              <PersonaAvatar persona={m} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{m.display_name || "Named by n8n"}</span>
                <span className="block text-xs text-muted">{m.role}</span>
                {m.why && <span className="mt-1 block text-xs text-ink-2">{m.why}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {suggestions.length > 0 && !full && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-ink-2">n8n also suggests</h3>
          <Suggestions suggestions={suggestions} members={members} onAdd={onAdd} />
        </div>
      )}
    </div>
  );
}

function Suggestions({ suggestions, members, onAdd }: Pick<Props, "suggestions" | "members" | "onAdd">) {
  const open = suggestions.filter((s) => !members.some((m) => m.role.toLowerCase() === s.role.toLowerCase()));
  if (open.length === 0) return <p className="text-sm text-muted">Everyone n8n suggested is already seated.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {open.map((s) => (
        <li key={s.role}>
          <button
            type="button"
            onClick={() => onAdd(s.role, s.role_short, s.why)}
            className="flex w-full items-start gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:border-ink"
          >
            <span aria-hidden="true" className="mt-0.5 text-lg leading-none">+</span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{s.role}</span>
              <span className="block text-xs text-ink-2">{s.why}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function AddToSeat({ suggestions, members, onAdd, onSelect }: Props) {
  const [role, setRole] = useState("");
  return (
    <div className="flex flex-col gap-5">
      <BackLink onSelect={onSelect} />
      <div>
        <h2 className="font-display text-xl">Add someone</h2>
        <p className="mt-1 text-sm text-ink-2">Pick one of n8n&apos;s suggestions, or name the role yourself. n8n gives them a name and a brief.</p>
      </div>
      <Suggestions suggestions={suggestions} members={members} onAdd={onAdd} />
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (role.trim()) onAdd(role.trim(), shortRole(role));
        }}
      >
        <label htmlFor="custom-role" className="text-xs font-semibold text-ink-2">
          Another role
        </label>
        <div className="flex gap-2">
          <input
            id="custom-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Head of Legal"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none"
          />
          <button type="submit" disabled={!role.trim()} className="rounded-lg bg-ink px-4 py-2 text-sm text-surface disabled:opacity-40">
            Add
          </button>
        </div>
      </form>
    </div>
  );
}

function PersonEditor({ member, onChange, onRemove, onSelect }: Props & { member: DraftMember }) {
  const field = "rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none";
  return (
    <div className="flex flex-col gap-5">
      <BackLink onSelect={onSelect} />
      <div className="flex items-center gap-3">
        <PersonaAvatar persona={member} size={56} />
        <div className="min-w-0">
          <h2 className="truncate font-display text-xl">{member.display_name || "Named by n8n"}</h2>
          <p className="truncate text-sm text-muted">{member.role}</p>
        </div>
      </div>

      {member.why && (
        <div className="rounded-xl bg-paper p-3">
          <p className="text-xs font-semibold text-ink-2">Why n8n seated them{member.source && `: ${SOURCE_LABEL[member.source].toLowerCase()}`}</p>
          <p className="mt-1 text-sm">{member.why}</p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="m-name" className="text-xs font-semibold text-ink-2">Name</label>
        <input
          id="m-name"
          value={member.display_name}
          onChange={(e) => onChange(member.id, { display_name: e.target.value })}
          placeholder="Leave empty and n8n picks one"
          className={field}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="m-role" className="text-xs font-semibold text-ink-2">Role</label>
        <input
          id="m-role"
          value={member.role}
          onChange={(e) => onChange(member.id, { role: e.target.value, role_short: shortRole(e.target.value) })}
          className={field}
        />
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs font-semibold text-ink-2">How hard they push</legend>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-paper p-1">
          {TOUGHNESS.map((t) => (
            <label key={t.value} className="cursor-pointer">
              <input
                type="radio"
                name="toughness"
                value={t.value}
                checked={member.difficulty === t.value}
                onChange={() => onChange(member.id, { difficulty: t.value })}
                className="peer sr-only"
              />
              <span className="block rounded-md px-2 py-1.5 text-center text-sm text-ink-2 peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-sm peer-focus-visible:outline-2">
                {t.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={() => onRemove(member.id)}
        className="self-start rounded-lg border border-bad/40 px-3 py-2 text-sm text-bad-ink hover:border-bad"
      >
        Remove from the panel
      </button>
    </div>
  );
}

function BackLink({ onSelect }: Pick<Props, "onSelect">) {
  return (
    <button type="button" onClick={() => onSelect(null)} className="self-start text-sm text-ink-2 hover:text-ink">
      ← The whole panel
    </button>
  );
}
