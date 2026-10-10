import type { AvatarId, ColorIndex, Persona, PersonaId, Seat } from "./contract";

// One colour per person, kept wherever they sit, shared with the VR nameplates.
// Colour is a secondary cue only: six hues can't all be told apart by colour alone,
// so every mark that uses one also shows the name or role.
const COLORS: Record<ColorIndex, string> = {
  0: "#2a78d6",
  1: "#eb6834",
  2: "#c2378a",
  3: "#1baf7a",
  4: "#4a3aa7",
  5: "#008300",
};
export const ALL_COLORS: ColorIndex[] = [0, 1, 2, 3, 4, 5];
export const colorOf = (c: ColorIndex) => COLORS[c];
export const MAX_PANEL = 6;

// Every chair at the table (VR world x, z in metres). See Seats, avatars and colours in docs/CONTRACT.md.
export const SEAT_POS: Record<Seat, { x: number; z: number }> = {
  0: { x: -4.79, z: -1.52 },
  1: { x: -5.4, z: -2.75 },
  2: { x: -5.4, z: -3.8 },
  3: { x: -5.4, z: -4.9 },
  4: { x: -5.4, z: -6.02 },
  5: { x: -3.67, z: -2.75 },
  6: { x: -3.67, z: -3.8 },
  7: { x: -3.67, z: -4.9 },
  8: { x: -3.67, z: -6.02 },
};
export const ALL_SEATS: Seat[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];
export const PRESENTER_SEAT = { x: -4.54, z: -7.6 };
export const TABLE = { xMin: -5.1, xMax: -3.98, zMin: -6.95, zMax: -1.74 };

// The avatar pool: the 11 Rocketbox business models, all in the VR project.
// Portraits are rendered from VR (Unity: Tools > DryRun > Capture Web Shots), each in the same chair and light.
export const AVATARS: { id: AvatarId; gender: "female" | "male"; portrait?: string }[] = [
  { id: "business_female_01", gender: "female", portrait: "/vr/business_female_01.jpg" },
  { id: "business_female_02", gender: "female", portrait: "/vr/business_female_02.jpg" },
  { id: "business_female_03", gender: "female", portrait: "/vr/business_female_03.jpg" },
  { id: "business_female_04", gender: "female", portrait: "/vr/business_female_04.jpg" },
  { id: "business_male_01", gender: "male", portrait: "/vr/business_male_01.jpg" },
  { id: "business_male_02", gender: "male", portrait: "/vr/business_male_02.jpg" },
  { id: "business_male_03", gender: "male", portrait: "/vr/business_male_03.jpg" },
  { id: "business_male_04", gender: "male", portrait: "/vr/business_male_04.jpg" },
  { id: "business_male_05", gender: "male", portrait: "/vr/business_male_05.jpg" },
  { id: "business_male_06", gender: "male", portrait: "/vr/business_male_06.jpg" },
  { id: "business_male_07", gender: "male", portrait: "/vr/business_male_07.jpg" },
];
export const portraitOf = (avatar: AvatarId) => AVATARS.find((a) => a.id === avatar)?.portrait;

export function personaById(personas: Persona[], id: PersonaId): Persona | undefined {
  return personas.find((p) => p.id === id);
}

// Short role, full role and colour for anything that only holds a persona id
export function personaTag(personas: Persona[], id: PersonaId) {
  const p = personaById(personas, id);
  return {
    name: p?.display_name ?? "Unknown",
    short: p?.role_short ?? "?",
    role: p?.role ?? "",
    color: p ? colorOf(p.color) : "var(--color-ink)",
  };
}
