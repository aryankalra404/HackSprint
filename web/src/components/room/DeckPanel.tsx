"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Room } from "@/lib/contract";

const ACCEPT = ".pdf,.pptx,.ppt,.key,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint";

// The presenter's deck in the room: it's on the TV in the headset, and the confidence monitor shows it as a speaker view.
// The practice page uploads, replaces and pages through it; the dashboard has the compact version, which also takes a
// presentation clicker (Page Down, Page Up and the arrow keys). Follows the room, so the headset's triggers show here too.
export function DeckPanel({ room, compact = false }: { room: Room; compact?: boolean }) {
  const { deck } = room;
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The slide just asked for, shown at once until the room catches up
  const [asked, setAsked] = useState<{ index: number; version: number } | null>(null);
  const slide = asked && asked.version === room.version ? asked.index : room.slide;
  const count = deck?.slides.length ?? 0;

  async function go(index: number) {
    if (!deck) return;
    const next = Math.max(0, Math.min(count - 1, index));
    if (next === slide) return;
    setAsked({ index: next, version: room.version });
    try {
      const res = await fetch("/api/room/slide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index: next, by: "web" }) });
      if (!res.ok) setAsked(null);
    } catch {
      setAsked(null);
    }
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
    if (["PageDown", "ArrowRight"].includes(e.key)) go(slide + 1);
    else if (["PageUp", "ArrowLeft"].includes(e.key)) go(slide - 1);
    else return;
    e.preventDefault();
  });
  const hasDeck = deck != null;
  useEffect(() => {
    if (!compact || !hasDeck) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact, hasDeck]);

  async function upload(file: File) {
    setError(null);
    setUploading(file.name);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/room/deck", { method: "POST", body });
      if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't turn that file into slides.");
    } catch {
      setError("Couldn't reach the laptop.");
    } finally {
      setUploading(null);
    }
  }

  async function remove() {
    setError(null);
    await fetch("/api/room/deck", { method: "DELETE" }).catch(() => setError("Couldn't reach the laptop."));
  }

  const current = deck?.slides[slide];
  const pager = deck && (
    <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface p-0.5 text-xs">
      <button type="button" onClick={() => go(slide - 1)} disabled={slide === 0} aria-label="Previous slide" className="rounded-full px-2.5 py-1 hover:bg-paper disabled:opacity-40">
        ‹
      </button>
      <span className="px-1 tabular-nums" aria-live="polite">
        Slide {slide + 1} of {count}
      </span>
      <button type="button" onClick={() => go(slide + 1)} disabled={slide >= count - 1} aria-label="Next slide" className="rounded-full px-2.5 py-1 hover:bg-paper disabled:opacity-40">
        ›
      </button>
    </div>
  );

  if (compact) {
    if (!deck) return null;
    return (
      <div className="flex items-center gap-2">
        {current && (
          // eslint-disable-next-line @next/next/no-img-element -- slide images come from the laptop, sized by the parent
          <img src={current.image_url} alt={`Slide ${slide + 1}`} className="h-8 rounded-sm border border-line bg-paper object-contain" style={{ aspectRatio: `${current.width} / ${current.height}` }} />
        )}
        {pager}
      </div>
    );
  }

  return (
    <section aria-label="Deck" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      {deck && !uploading ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {current && (
            // eslint-disable-next-line @next/next/no-img-element -- slide images come from the laptop, sized by the parent
            <img src={current.image_url} alt={`Slide ${slide + 1}, on the TV in the headset`} className="w-full rounded-md border border-line bg-paper object-contain sm:w-52" style={{ aspectRatio: `${current.width} / ${current.height}` }} />
          )}
          <div className="flex min-w-0 shrink-0 flex-col gap-2 sm:w-52">
            <p className="truncate text-sm font-medium" title={deck.name}>
              {deck.name}
            </p>
            {pager}
            <div className="flex gap-3 text-xs text-ink-2">
              <FilePicker onFile={upload} className="hover:text-ink">
                Replace
              </FilePicker>
              <button type="button" onClick={remove} className="hover:text-ink">
                Remove
              </button>
            </div>
          </div>
          <ol className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1" aria-label="All slides">
            {deck.slides.map((s) => (
              <li key={s.index} className="shrink-0">
                <button
                  type="button"
                  onClick={() => go(s.index)}
                  aria-current={s.index === slide ? "true" : undefined}
                  aria-label={`Show slide ${s.index + 1}`}
                  className={`block rounded-sm border-2 ${s.index === slide ? "border-ink" : "border-transparent hover:border-axis"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- slide images come from the laptop */}
                  <img src={s.image_url} alt="" loading="lazy" className="h-14 rounded-[2px] bg-paper object-contain" style={{ aspectRatio: `${s.width} / ${s.height}` }} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <DropZone uploading={uploading} onFile={upload} />
      )}
      {error && (
        <p role="alert" className="text-sm text-bad-ink">
          {error}
        </p>
      )}
    </section>
  );
}

// Drop a file here, or choose one
function DropZone({ uploading, onFile }: { uploading: string | null; onFile: (file: File) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file && !uploading) onFile(file);
      }}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-dashed px-4 py-3 ${over ? "border-ink bg-paper" : "border-line"}`}
    >
      {uploading ? (
        <p className="flex items-center gap-2 text-sm" aria-live="polite">
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-warn" />
          Turning {uploading} into slides…
        </p>
      ) : (
        <>
          <div>
            <p className="text-sm font-medium">Add your deck</p>
            <p className="text-xs text-muted">PDF, PowerPoint or Keynote. It goes on the TV in the headset, with a speaker view on the monitor.</p>
          </div>
          <FilePicker onFile={onFile} className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-surface">
            Choose a file
          </FilePicker>
        </>
      )}
    </div>
  );
}

function FilePicker({ onFile, className, children }: { onFile: (file: File) => void; className: string; children: React.ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} className={className}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}
