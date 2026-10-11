import type { Bundle, DraftMember, Persona } from "../contract";
import { AVATARS } from "../personas";
import { demoSession } from "./session";

// Names for people the presenter added, picked to fit their avatar (n8n does this for real)
const NAMES = { female: ["Kavya Iyer", "Meera Kulkarni", "Sana Qureshi"], male: ["Rohan Bhatt", "Karthik Reddy", "Imran Sheikh"] };

// What n8n's /prep would return for an edited panel, for running without n8n:
// people from the sample keep their brief, anyone added gets a short generic one.
export function mockPrep(panel: DraftMember[]): Bundle {
  const sample = demoSession.bundle;
  const used = { female: 0, male: 0 };
  const personas: Persona[] = panel.map((m) => {
    const known = sample.personas.find((p) => p.id === m.id);
    const gender = AVATARS.find((a) => a.id === m.avatar)?.gender ?? "female";
    const name = m.display_name || NAMES[gender][used[gender]++ % NAMES[gender].length];
    return {
      id: m.id,
      seat: m.seat,
      color: m.color,
      role: m.role,
      role_short: m.role_short,
      avatar: m.avatar,
      display_name: name,
      priorities: known?.priorities ?? [`What the deal means for the ${m.role.toLowerCase()}`],
      objections: m.will_push_on
        ? [{ slide_index: 3, text: m.will_push_on, source: "research" }]
        : (known?.objections ?? [{ slide_index: 3, text: `How does this affect my team as ${m.role}?`, source: "deck" }]),
      difficulty: m.difficulty,
      manner: known?.manner ?? (m.difficulty >= 3 ? "interrupts" : "waits"),
      // The person at the head of the table chairs
      chair: m.seat === 0,
      voice: known?.voice ?? "en-IN-neutral-1",
    };
  });
  return { ...sample, session_id: "room", personas };
}
