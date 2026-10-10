import type { AvatarId, Persona, PersonaId, Seat } from "./contract";

// Each seat has a fixed colour, shared with the VR nameplates.
// Colour is a secondary cue only: six hues can't all be told apart by colour alone,
// so every mark that uses one also shows the name or role.
const SEAT_COLOR: Record<Seat, string> = {
  0: "#2a78d6",
  1: "#eb6834",
  2: "#c2378a",
  3: "#1baf7a",
  4: "#4a3aa7",
  5: "#008300",
};

// Seat positions in the VR boardroom (world x, z in metres). See Seats and avatars in docs/CONTRACT.md.
export const SEAT_POS: Record<Seat, { x: number; z: number }> = {
  0: { x: -4.79, z: -1.52 },
  1: { x: -5.4, z: -2.75 },
  2: { x: -3.67, z: -2.75 },
  3: { x: -3.67, z: -3.8 },
  4: { x: -5.4, z: -4.9 },
  5: { x: -3.67, z: -6.02 },
};
export const ALL_SEATS: Seat[] = [0, 1, 2, 3, 4, 5];
export const PRESENTER_SEAT = { x: -4.54, z: -7.6 };
export const TABLE = { xMin: -5.1, xMax: -3.98, zMin: -6.95, zMax: -1.74 };

// Head shots rendered from the VR avatars (Unity: Tools > DryRun > Capture Web Shots).
const AVATAR_PORTRAIT: Partial<Record<AvatarId, string>> = {
  business_male_01: "/vr/business_male_01.jpg",
  business_male_02: "/vr/business_male_02.jpg",
  business_male_04: "/vr/business_male_04.jpg",
  business_female_01: "/vr/business_female_01.jpg",
  business_female_02: "/vr/business_female_02.jpg",
};

export const seatColor = (seat: Seat) => SEAT_COLOR[seat];
export const portraitOf = (avatar: AvatarId) => AVATAR_PORTRAIT[avatar];

export function personaById(personas: Persona[], id: PersonaId): Persona | undefined {
  return personas.find((p) => p.id === id);
}

// Short role, full role and seat colour for anything that only holds a persona id
export function personaTag(personas: Persona[], id: PersonaId) {
  const p = personaById(personas, id);
  return {
    name: p?.display_name ?? "Unknown",
    short: p?.role_short ?? "?",
    role: p?.role ?? "",
    color: p ? seatColor(p.seat) : "var(--color-ink)",
  };
}
