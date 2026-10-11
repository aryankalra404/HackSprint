import type { Bundle, DraftMember, Persona } from "../contract";
import { AVATARS } from "../personas";
import { demoSession } from "./session";

// Names for people the presenter added, picked to fit their avatar (n8n does this for real)
const NAMES = { female: ["Kavya Iyer", "Meera Kulkarni", "Sana Qureshi"], male: ["Rohan Bhatt", "Karthik Reddy", "Imran Sheikh"] };

// What n8n's /prep would return for an edited panel, for running without n8n:
// people from the sample keep their brief, anyone added gets a short generic one, and the sample's slide times are
// stretched to the pitch length (kept as they are with no time limit).
export function mockPrep(panel: DraftMember[], pitchMinutes: number | null): Bundle {
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
  const pitchSeconds = pitchMinutes ? pitchMinutes * 60 : sample.pitch_seconds;
  const minutes = pitchSeconds / 60;
  const scale = pitchSeconds / sample.pitch_seconds;
  const slides = sample.slides.map((s) => ({ ...s, target_seconds: Math.round(s.target_seconds * scale) }));
  const interrupting = personas.filter((p) => p.manner === "interrupts");
  const during = Math.min(interrupting.length, Math.floor(minutes / 2));
  const plan = {
    during_pitch: during,
    after_pitch: Math.min(personas.length, Math.max(1, Math.ceil(minutes / 3))),
    why: "Sample plan (n8n isn't connected).",
    // Each interrupter's first objection, once they've heard a little of that slide
    interrupts: interrupting.slice(0, during).map((p) => ({ persona_id: p.id, slide_index: Math.max(0, p.objections[0]?.slide_index ?? 0), after_s: 15, about: p.objections[0]?.text ?? "" })),
  };
  const time = pitchMinutes ? { limit_s: pitchSeconds, nudge_at_s: pitchSeconds, cut_at_s: Math.round(pitchSeconds * 1.25), why: "Sample time keeping." } : null;
  return { ...sample, session_id: "room", pitch_seconds: pitchSeconds, time, plan, slides, personas };
}
