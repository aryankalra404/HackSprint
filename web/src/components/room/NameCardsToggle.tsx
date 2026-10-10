"use client";

import { useState } from "react";

// Switches the tent cards with each person's name on or off in the headset
export function NameCardsToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next);
    setSaving(true);
    try {
      const res = await fetch("/api/room/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name_cards: next }) });
      if (!res.ok) setOn(!next);
    } catch {
      setOn(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      disabled={saving}
      className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs hover:border-ink disabled:opacity-60"
    >
      <span aria-hidden="true" className={`relative h-3.5 w-6 rounded-full transition-colors ${on ? "bg-ink" : "bg-axis"}`}>
        <span className={`absolute top-0.5 size-2.5 rounded-full bg-surface transition-all ${on ? "left-3" : "left-0.5"}`} />
      </span>
      Name cards in VR
    </button>
  );
}
