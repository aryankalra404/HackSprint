import type { PersonaId } from "./contract";

// Fixed identity per stakeholder, shared with the VR nameplates.
// Colour is a secondary cue only: five hues can't all be told apart by colour alone,
// so every mark that uses one also shows the role label.
export const PERSONA_STYLE: Record<PersonaId, { role: string; short: string; color: string }> = {
  cfo: { role: "Chief Financial Officer", short: "CFO", color: "#2a78d6" },
  cto: { role: "Chief Technology Officer", short: "CTO", color: "#1baf7a" },
  procurement: { role: "Head of Procurement", short: "PROC", color: "#eb6834" },
  vp_ops: { role: "VP Operations", short: "OPS", color: "#4a3aa7" },
  end_user_lead: { role: "End User Lead", short: "USER", color: "#008300" },
};

// Seat positions from the VR boardroom (world x, z in metres). See docs/VR_CLIENT.md.
export const SEATS: Record<PersonaId, { x: number; z: number }> = {
  cfo: { x: -4.79, z: -1.52 },
  cto: { x: -3.67, z: -3.8 },
  procurement: { x: -5.4, z: -2.75 },
  vp_ops: { x: -5.4, z: -4.9 },
  end_user_lead: { x: -3.67, z: -6.02 },
};
export const PRESENTER_SEAT = { x: -4.54, z: -7.6 };
export const TABLE = { xMin: -5.1, xMax: -3.98, zMin: -6.95, zMax: -1.74 };
