import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BriefInput, DraftMember, PanelProposal, Room } from "./contract";
import { ALL_COLORS, ALL_SEATS, AVATARS, MAX_PANEL } from "./personas";

// The one room, held by the laptop (contract: Room API). Kept in memory, saved to .room.json so a restart
// doesn't lose it. The headset long-polls it; every change bumps `version` and wakes the waiting polls.
const FILE = path.join(process.cwd(), ".room.json");

interface Store {
  room: Room;
  // What the Brief screen needs to pick up where it left off; not part of the room the headset sees
  brief: { input: BriefInput; draft_id: string; suggestions: PanelProposal["suggestions"] } | null;
  waiters: Set<() => void>;
  // When the headset last had a poll open (it renews every 25 s)
  headsetSeen: number;
  headsetPolling: number;
}

const EMPTY: Room = { version: 0, phase: "empty", prospect: null, panel: [], bundle: null, session_id: null };

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
    g.__dryrunRoom = { ...saved, waiters: new Set(), headsetSeen: 0, headsetPolling: 0 };
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
export async function trackHeadset<T>(poll: () => Promise<T>): Promise<T> {
  const s = store();
  s.headsetPolling++;
  s.headsetSeen = Date.now();
  try {
    return await poll();
  } finally {
    s.headsetPolling--;
    s.headsetSeen = Date.now();
  }
}

export function headsetConnected(): boolean {
  const s = store();
  return s.headsetPolling > 0 || Date.now() - s.headsetSeen < 30_000;
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
