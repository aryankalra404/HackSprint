import type { PanelMember, PanelProposal } from "../contract";
import { demoSession } from "./session";

// What n8n's /panel proposes for the sample prospect, built from the sample session's panel
const WHY: Record<string, Pick<PanelMember, "why" | "source" | "gender">> = {
  p1: { why: "cc'd on the meeting email; signs off on anything over ₹50 lakh", source: "email", gender: "male" },
  p2: { why: "Kaveri routes vendor contracts over ₹1 crore through central procurement", source: "research", gender: "male" },
  p3: { why: "Kaveri is mid-migration to SAP S/4HANA, so any new system has to integrate", source: "research", gender: "female" },
  p4: { why: "Sent the meeting invite and owns the rollout", source: "email", gender: "female" },
  p5: { why: "Runs the 1,200 drivers who would use the product every day", source: "typical", gender: "male" },
};

export const demoProposal: PanelProposal = {
  draft_id: "draft-demo",
  members: demoSession.bundle.personas.map((p) => ({
    id: p.id,
    seat: p.seat,
    color: p.color,
    role: p.role,
    role_short: p.role_short,
    display_name: p.display_name,
    avatar: p.avatar,
    ...WHY[p.id],
  })),
  suggestions: [
    { role: "Head of IT Security", role_short: "CISO", why: "Route and driver data would leave Kaveri's network" },
    { role: "Head of Sustainability", role_short: "Sustainability", why: "Kaveri committed to cutting fleet emissions 30% by 2030" },
    { role: "Chief Executive Officer", role_short: "CEO", why: "A company-wide rollout this size usually reaches the CEO" },
  ],
};
