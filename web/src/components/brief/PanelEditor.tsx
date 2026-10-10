"use client";

import { useState } from "react";
import Image from "next/image";
import type { DraftMember, PanelProposal, Seat } from "@/lib/contract";
import { ALL_SEATS, AVATARS, MAX_PANEL } from "@/lib/personas";
import { PersonaAvatar } from "../ui";
import { SOURCE_LABEL, seatLabel, type Selection } from "./PanelTable";

const TOUGHNESS: { value: DraftMember["difficulty"]; label: string }[] = [
  { value: 1, label: "Easy" },
  { value: 2, label: "Normal" },
  { value: 3, label: "Tough" },
];

const FIELD = "rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none";

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
  onMove: (id: string, seat: Seat) => void;
  onRemove: (id: string) => void;
  onAdd: (role: string, roleShort: string, why?: string) => void;
}

// The side column of the Brief screen: the panel overview, or an editor for whatever is selected on the table
export function PanelEditor(props: Props) {
  const { selection } = props;
  if (selection?.kind === "person") {
    const member = props.members.find((m) => m.id === selection.id);
    if (member) return <PersonEditor {...props} member={member} />;
  }
  if (selection?.kind === "seat") return <AddToSeat {...props} seat={selection.seat} />;
  return <Overview {...props} />;
}

function Overview({ company, members, suggestions, onSelect, onAdd }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-xl">The panel</h2>
        <p className="mt-1 text-sm text-ink-2">
          The people coming from {company}, plus practice roles to rehearse against. Click anyone to edit them, drag them to another chair,
          or press + on an empty chair to add someone. Up to {MAX_PANEL} people.
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
      {members.length < MAX_PANEL && suggestions.length > 0 && (
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

function AddToSeat({ suggestions, members, onAdd, onSelect, seat }: Props & { seat: Seat }) {
  const [role, setRole] = useState("");
  if (members.length >= MAX_PANEL) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink onSelect={onSelect} />
        <h2 className="font-display text-xl">The table is full</h2>
        <p className="text-sm text-ink-2">
          A panel is at most {MAX_PANEL} people, so every voice gets a turn. Remove someone first, or drag someone into this chair.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <BackLink onSelect={onSelect} />
      <div>
        <h2 className="font-display text-xl">Add someone</h2>
        <p className="mt-1 text-sm text-ink-2">
          {seatLabel(seat)}. Pick one of n8n&apos;s suggestions, or name the role yourself. n8n writes their brief.
        </p>
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
          <input id="custom-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Head of Legal" className={`min-w-0 flex-1 ${FIELD}`} />
          <button type="submit" disabled={!role.trim()} className="rounded-lg bg-ink px-4 py-2 text-sm text-surface disabled:opacity-40">
            Add
          </button>
        </div>
      </form>
    </div>
  );
}

function PersonEditor({ member, members, onChange, onMove, onRemove, onSelect }: Props & { member: DraftMember }) {
  const taken = new Set(members.filter((m) => m.id !== member.id).map((m) => m.avatar));
  const faces = AVATARS.filter((a) => a.portrait);
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
          <p className="text-xs font-semibold text-ink-2">{member.source ? SOURCE_LABEL[member.source] : "Why they're here"}</p>
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
          className={FIELD}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="m-role" className="text-xs font-semibold text-ink-2">Role</label>
        <input id="m-role" value={member.role} onChange={(e) => onChange(member.id, { role: e.target.value, role_short: shortRole(e.target.value) })} className={FIELD} />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold text-ink-2">Face</legend>
        <div className="grid grid-cols-5 gap-2">
          {faces.map((a) => {
            const mine = member.avatar === a.id;
            const used = taken.has(a.id);
            return (
              <label key={a.id} className={used ? "cursor-not-allowed" : "cursor-pointer"} title={used ? "Someone else has this face" : undefined}>
                <input
                  type="radio"
                  name="face"
                  value={a.id}
                  checked={mine}
                  disabled={used}
                  onChange={() => onChange(member.id, { avatar: a.id })}
                  className="peer sr-only"
                />
                <span
                  className={`relative block aspect-square overflow-hidden rounded-full ring-2 peer-focus-visible:outline-2 ${mine ? "ring-ink" : "ring-transparent"} ${used ? "opacity-30 grayscale" : "hover:ring-axis"}`}
                >
                  <Image src={a.portrait!} alt={`${a.gender} avatar`} fill sizes="56px" className="object-cover" />
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted">The same face sits in the VR room.</p>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="m-seat" className="text-xs font-semibold text-ink-2">Seat</label>
        <select id="m-seat" value={member.seat} onChange={(e) => onMove(member.id, Number(e.target.value) as Seat)} className={FIELD}>
          {ALL_SEATS.map((s) => {
            const who = members.find((m) => m.seat === s && m.id !== member.id);
            return (
              <option key={s} value={s}>
                {seatLabel(s)}
                {who ? ` (swap with ${who.display_name || who.role})` : ""}
              </option>
            );
          })}
        </select>
      </div>

      <fieldset>
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

      <button type="button" onClick={() => onRemove(member.id)} className="self-start rounded-lg border border-bad/40 px-3 py-2 text-sm text-bad-ink hover:border-bad">
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
