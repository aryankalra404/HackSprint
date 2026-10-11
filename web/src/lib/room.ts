import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BriefInput, Deck, DraftMember, PanelProposal, PitchSuggestion, Room, SessionAction, SessionActor } from "./contract";
import { removeDeckFiles } from "./deck";
import { ALL_COLORS, ALL_SEATS, AVATARS, MAX_PANEL } from "./personas";

// The one room, held by the laptop (contract: Room API). Kept in memory, saved to .room.json so a restart
// doesn't lose it. The headset long-polls it; every change bumps `version` and wakes the waiting polls.
const FILE = path.join(process.cwd(), ".room.json");

interface Store {
  room: Room;
  // What the Brief screen needs to pick up where it left off; not part of the room the headset sees
  brief: { input: BriefInput; draft_id: string; suggestions: PanelProposal["suggestions"]; pitch?: PitchSuggestion } | null;
  waiters: Set<() => void>;
  // When the headset last had a poll open (it renews every 25 s)
  headsetSeen: number;
  headsetPolling: number;
  headsetVia: "wifi" | "usb";
  // The slide changes during the live run, for the debrief (contract: POST /debrief events); not part of the room
  slideLog: { startedAt: string; events: { t: number; type: "slide"; slide_index: number }[] } | null;
}

const EMPTY: Room = { version: 0, phase: "empty", prospect: null, panel: [], bundle: null, session_id: null, name_cards: false, live: null, deck: null, slide: 0, height_offset: 0, pitch_minutes: 5, debrief: null };

// On globalThis so dev-mode reloads keep one store
const g = globalThis as { __dryrunRoom?: Store };

function store(): Store {
  if (!g.__dryrunRoom) {
    let saved: Pick<Store, "room" | "brief"> = { room: EMPTY, brief: null };
    try {
      saved = JSON.parse(readFileSync(FILE, "utf8"));
    } catch {
      // No saved room yet
    }
    // A room saved by an older version may lack newer fields
    g.__dryrunRoom = { ...saved, room: { ...EMPTY, ...saved.room }, waiters: new Set(), headsetSeen: 0, headsetPolling: 0, headsetVia: "usb", slideLog: null };
  }
  return g.__dryrunRoom;
}

export function getRoom(): Room {
  return store().room;
}

export function getBrief(): Store["brief"] {
  return store().brief;
}

export function updateRoom(patch: Partial<Omit<Room, "version">>, brief?: Store["brief"]): Room {
  const s = store();
  s.room = { ...s.room, ...patch, version: s.room.version + 1 };
  if (brief !== undefined) s.brief = brief;
  try {
    writeFileSync(FILE, JSON.stringify({ room: s.room, brief: s.brief }));
  } catch {
    // Saving is a convenience; the room still works in memory
  }
  for (const wake of s.waiters) wake();
  s.waiters.clear();
  return s.room;
}

// Resolves with the room once its version passes `since`, or after `timeoutMs` with the room unchanged
export function waitForChange(since: number, timeoutMs: number, signal?: AbortSignal): Promise<Room> {
  const s = store();
  if (s.room.version > since) return Promise.resolve(s.room);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      s.waiters.delete(done);
      resolve(s.room);
    };
    const timer = setTimeout(done, timeoutMs);
    s.waiters.add(done);
    signal?.addEventListener("abort", done);
  });
}

// The headset counts as connected while it has a poll open, or polled in the last 30 s
export async function trackHeadset<T>(via: "wifi" | "usb", poll: () => Promise<T>): Promise<T> {
  const s = store();
  s.headsetVia = via;
  s.headsetPolling++;
  s.headsetSeen = Date.now();
  try {
    return await poll();
  } finally {
    s.headsetPolling--;
    s.headsetSeen = Date.now();
  }
}

// Whether the headset is following the room, and over which link
export function headsetStatus(): { connected: boolean; via: "wifi" | "usb" } {
  const s = store();
  return { connected: s.headsetPolling > 0 || Date.now() - s.headsetSeen < 30_000, via: s.headsetVia };
}

// Starts or ends the rehearsal (contract: POST /api/room/session). Only briefed → live → done is allowed,
// so a second "start" from the headset and the web at the same moment changes nothing.
export function changeSession(action: SessionAction, by: SessionActor): { ok: true; room: Room } | { ok: false; error: string; room: Room } {
  const room = getRoom();
  const now = new Date().toISOString();
  if (action === "start") {
    if (room.phase !== "briefed") return { ok: false, error: `Can't start: the room is ${room.phase}, not briefed.`, room };
    store().slideLog = { startedAt: now, events: [{ t: 0, type: "slide", slide_index: 0 }] };
    return { ok: true, room: updateRoom({ phase: "live", slide: 0, debrief: null, live: { started_at: now, started_by: by, ended_at: null, ended_by: null, stage: "opening", feed: [] } }) };
  }
  if (action === "restart") {
    // Go again with the same panel and bundle
    if (room.phase !== "done") return { ok: false, error: `Can't restart: the room is ${room.phase}, not done.`, room };
    return { ok: true, room: updateRoom({ phase: "briefed", slide: 0, live: null, debrief: null }) };
  }
  if (room.phase !== "live" || !room.live) return { ok: false, error: `Can't end: the room is ${room.phase}, not live.`, room };
  return { ok: true, room: updateRoom({ phase: "done", live: { ...room.live, ended_at: now, ended_by: by } }) };
}

// Puts a new deck in the room (or none), back on its first slide, and deletes the old one's images
export function setDeck(deck: Deck | null): Room {
  const old = getRoom().deck;
  const room = updateRoom({ deck, slide: 0 });
  if (old && old.id !== deck?.id) void removeDeckFiles(old.id);
  return room;
}

// Shows a slide, from the headset or the web (contract: POST /api/room/slide); the index is clamped to the deck
export function setSlide(index: number): { ok: true; room: Room } | { ok: false; error: string; room: Room } {
  const room = getRoom();
  if (!room.deck) return { ok: false, error: "There's no deck in the room.", room };
  const slide = Math.max(0, Math.min(room.deck.slides.length - 1, Math.trunc(index)));
  if (slide === room.slide) return { ok: true, room };
  // During a run, each change goes in the debrief's slide log, timed from the start
  const log = store().slideLog;
  if (room.phase === "live" && room.live && log?.startedAt === room.live.started_at)
    log.events.push({ t: Math.round((Date.now() - Date.parse(room.live.started_at)) / 100) / 10, type: "slide", slide_index: slide });
  return { ok: true, room: updateRoom({ slide }) };
}

// Why a panel can't be saved, or null if it's fine
export function panelProblem(panel: DraftMember[]): string | null {
  if (!Array.isArray(panel)) return "The panel must be a list.";
  if (panel.length > MAX_PANEL) return `The panel is at most ${MAX_PANEL} people.`;
  const unique = (xs: unknown[]) => new Set(xs).size === xs.length;
  if (!unique(panel.map((m) => m.id))) return "Each person needs their own id.";
  if (!unique(panel.map((m) => m.seat)) || panel.some((m) => !ALL_SEATS.includes(m.seat))) return "Each person needs their own seat.";
  if (!unique(panel.map((m) => m.color)) || panel.some((m) => !ALL_COLORS.includes(m.color))) return "Each person needs their own colour.";
  if (!unique(panel.map((m) => m.avatar)) || panel.some((m) => !AVATARS.some((a) => a.id === m.avatar))) return "Each person needs their own face.";
  return null;
}

// The slide changes of a run, oldest first (for the debrief)
export function slideLog(startedAt: string): { t: number; type: "slide"; slide_index: number }[] {
  const log = store().slideLog;
  return log?.startedAt === startedAt ? log.events : [{ t: 0, type: "slide", slide_index: 0 }];
}
