import type { Bundle, Deck, Meeting, MeetingDetail, PanelMember, Persona, Reaction, Slide } from "../contract";

// The sample meeting: always on the home page, and nothing in it calls n8n or an AI. Its brief and panel are written here, its
// slides and voices are files in public/sample/ (the voices were recorded from a real n8n rehearsal), and a run in the headset
// follows SCRIPT below, turn by turn, with the headset standing in for the presenter (the room's `scripted`).
export const SAMPLE_ID = "sample";

const inTwoDays = new Date(Date.now() + 2 * 86400000);
inTwoDays.setHours(15, 0, 0, 0);

export const sampleMeeting: Meeting = {
  id: SAMPLE_ID,
  title: "RouteIQ pitch (sample)",
  start: inTwoDays.toISOString(),
  company: "Kaveri Freight",
  why: "A sample to try DryRun end to end without speaking: the brief, the practice panel and a scripted rehearsal in VR. Nothing in it calls n8n or an AI.",
  status: "ready",
  attendees: [
    { name: "Priya Nair", email: "priya.nair@kaverifreight.in" },
    { name: "Rajiv Menon", email: "rajiv.menon@kaverifreight.in" },
  ],
};

const SLIDES: Omit<Slide, "image_url">[] = [
  { index: 0, title: "RouteIQ for Kaveri Freight", key_points: ["Fill the empty return legs"], target_seconds: 20, rescue: { calm: "Take a breath. You know this.", keyword: "Empty miles", bridge: "Let me start with what an empty return leg costs you." }, notes: null },
  { index: 1, title: "Empty miles today", key_points: ["400 trucks, about 28% of kilometres run empty", "Fuel is the biggest cost after drivers"], target_seconds: 25, rescue: { calm: "Pause, then the number.", keyword: "28%", bridge: "Here's where your fleet is today." }, notes: null },
  { index: 2, title: "How RouteIQ works", key_points: ["Learns your lanes in about two weeks", "Plugs into your TMS through an API"], target_seconds: 25, rescue: { calm: "Slow down, one idea at a time.", keyword: "Return trips", bridge: "So how do we fill those trucks?" }, notes: null },
  { index: 3, title: "Payback", key_points: ["About 7 months at 400 trucks", "Pilot: empty miles from 28% to 19%"], target_seconds: 25, rescue: { calm: "The number first.", keyword: "7 months", bridge: "What this means for your fuel bill." }, notes: null },
  { index: 4, title: "Next steps", key_points: ["A 6-week pilot on one region", "Two people from your ops team"], target_seconds: 20, rescue: { calm: "Finish with the ask.", keyword: "Pilot", bridge: "Here's what we'd like to do next." }, notes: null },
];

export const sampleDeck: Deck = {
  id: SAMPLE_ID,
  name: "RouteIQ sample deck",
  slides: SLIDES.map((s) => ({ index: s.index, image_url: `/sample/deck/${s.index + 1}.jpg`, width: 1920, height: 1080 })),
};

const PERSONAS: Persona[] = [
  { id: "p1", seat: 0, color: 0, role: "VP Operations", role_short: "VP Ops", avatar: "business_female_01", display_name: "Priya Nair", priorities: ["Fewer empty kilometres", "No disruption to dispatch"], objections: [{ slide_index: 2, text: "What does the two-week learning period need from my team?", source: "deck" }], difficulty: 2, manner: "interrupts", chair: true, voice: "priya" },
  { id: "p2", seat: 1, color: 1, role: "Chief Financial Officer", role_short: "CFO", avatar: "business_male_01", display_name: "Rajiv Menon", priorities: ["Payback period", "Total cost of ownership"], objections: [{ slide_index: 3, text: "What fuel price is the payback based on?", source: "deck" }], difficulty: 2, manner: "waits", chair: false, voice: "rahul" },
  { id: "p3", seat: 5, color: 2, role: "Chief Technology Officer", role_short: "CTO", avatar: "business_male_02", display_name: "Rohan Sharma", priorities: ["Which data the model needs", "Integration with the TMS"], objections: [{ slide_index: 0, text: "What data predicts the return loads?", source: "deck" }], difficulty: 3, manner: "interrupts", chair: false, voice: "aditya" },
  { id: "p4", seat: 2, color: 3, role: "Head of Fleet", role_short: "Fleet", avatar: "business_female_02", display_name: "Sanjana Rao", priorities: ["Driver adoption", "Route changes mid-trip"], objections: [{ slide_index: 2, text: "How does a driver get a changed route?", source: "deck" }], difficulty: 1, manner: "waits", chair: false, voice: "kavya" },
  { id: "p5", seat: 6, color: 4, role: "Head of Procurement", role_short: "Procurement", avatar: "business_male_03", display_name: "Anil Kapoor", priorities: ["Contract terms", "Support after the pilot"], objections: [{ slide_index: 4, text: "What does support cost after the pilot?", source: "deck" }], difficulty: 1, manner: "waits", chair: false, voice: "rohan" },
];

const voice = (file: string) => `/sample/voices/${file}.wav`;

export const sampleBundle: Bundle = {
  session_id: SAMPLE_ID,
  prospect: { company: "Kaveri Freight" },
  pitch_seconds: 115,
  plan: { during_pitch: 2, after_pitch: 1, why: "Sample plan: Rohan and Priya interrupt on the first two slides, then Rohan presses on the data after the pitch." },
  rescue_after_s: [3, 6, 10],
  slides: SLIDES.map((s) => ({ ...s, image_url: sampleDeck.slides[s.index].image_url })),
  personas: PERSONAS,
  lines: [
    { id: "l1", persona_id: "p1", kind: "welcome", text: "Hi Aryan, thanks for joining us. Please, go ahead with the RouteIQ pitch.", audio_url: voice("priya-welcome") },
    { id: "l2", persona_id: "p1", kind: "open_floor", text: "Thank you, Aryan. That was insightful. Let's open the floor to questions from the team.", audio_url: voice("priya-open-floor") },
    { id: "l3", persona_id: "p1", kind: "acknowledge", text: "That's a fair point.", audio_url: voice("priya-fair-point") },
    { id: "l4", persona_id: "p1", kind: "acknowledge", text: "Understood, that helps.", audio_url: voice("priya-understood") },
    { id: "l5", persona_id: "p5", kind: "acknowledge", text: "Thanks for clarifying that.", audio_url: voice("anil-thanks") },
  ],
  drill: null,
};

const WHY: Record<string, Pick<PanelMember, "why" | "source" | "gender">> = {
  p1: { why: "On the invite; owns dispatch and would run the pilot", source: "email", gender: "female" },
  p2: { why: "On the invite; signs off on the spend", source: "email", gender: "male" },
  p3: { why: "Any new system has to plug into Kaveri's TMS", source: "typical", gender: "male" },
  p4: { why: "Her drivers would follow the new routes every day", source: "typical", gender: "female" },
  p5: { why: "Vendor contracts go through procurement", source: "typical", gender: "male" },
};

export const sampleDetail: MeetingDetail = {
  meeting: sampleMeeting,
  brief: {
    summary: "A sample brief for a made-up meeting: a pitch of RouteIQ to Kaveri Freight's operations and finance leads, decided on whether it cuts empty return legs and pays back inside a year.",
    company: {
      what_they_do: "Kaveri Freight (made up for the sample) runs a 400-truck line-haul fleet across South India.",
      recent_news: [{ text: "Sample data: no research runs for the sample.", date: "" }],
    },
    attendees: [
      { name: "Priya Nair", email: "priya.nair@kaverifreight.in", role: "VP Operations", likely_focus: "What the pilot needs from her team, and how it fits dispatch." },
      { name: "Rajiv Menon", email: "rajiv.menon@kaverifreight.in", role: "CFO", likely_focus: "Payback period at their fleet size." },
    ],
    questions: [
      { question: "What data predicts the return loads?", asked_by: "Rohan Sharma (practice panel)", why: "The deck claims a one-third cut in empty miles without its inputs.", suggested_answer: "Name the feeds: GPS pings, order IDs with pickup windows, truck capacity." },
      { question: "What does the two-week learning period need from us?", asked_by: "Priya Nair", why: "Her team is the one that would run the pilot.", suggested_answer: "Two people from ops for two weeks, and read access to the TMS." },
    ],
    risks: ["The data behind the one-third claim isn't on a slide", "The pilot's ask of the ops team is vague"],
    sources: [],
  },
  proposal: {
    draft_id: SAMPLE_ID,
    members: PERSONAS.map(({ id, seat, color, role, role_short, display_name, avatar }) => ({ id, seat, color, role, role_short, display_name, avatar, ...WHY[id] })),
    suggestions: [],
    goal: { text: "A paid 3-month pilot of RouteIQ on Kaveri's Delhi to Mumbai lane", why: "Sample: the invite asks for a pilot proposal." },
  },
};

// The run, turn by turn: what the stand-in presenter "says" and who reacts. The presenter's words are made up; the panel's are
// the recorded voices.
type Step = { transcript: string; reactions: Omit<Reaction, "reason">[]; end?: boolean };

const line = (persona_id: string, kind: Reaction["kind"], id: string) => {
  const l = sampleBundle.lines.find((x) => x.id === id)!;
  return { persona_id, kind, text: l.text, raise_hand: false, line_id: id, audio_url: l.audio_url };
};
const say = (persona_id: string, kind: Reaction["kind"], file: string, text: string, raise_hand = false) => ({ persona_id, kind, text, raise_hand, audio_url: voice(file) });

export const SCRIPT: Record<"opening" | "segment" | "pitch_answer" | "pitch_end" | "question_answer", Step[]> = {
  opening: [{ transcript: "Good afternoon everyone, thanks for having me. I'm here to show you RouteIQ.", reactions: [line("p1", "welcome", "l1")] }],
  segment: [
    {
      transcript: "RouteIQ plans your return trips so they come back loaded. In our pilots, empty miles dropped by about a third, and that goes straight to your fuel bill.",
      reactions: [say("p3", "question", "rohan-data-inputs", "What data inputs are you using to predict load availability that enable this one-third reduction in empty miles?", true)],
    },
    {
      transcript: "At 400 trucks, even a few points of empty miles is lakhs a month. Our routing learns your lanes in about two weeks.",
      reactions: [say("p1", "question", "priya-two-weeks", "You say the routing learns our lanes in about two weeks. What resources and system changes does that require from our side?", true)],
    },
  ],
  pitch_answer: [
    {
      transcript: "In a pilot with 200 trucks over 3 months, empty miles went from 28% to 19%, measured from the fuel cards on the same routes.",
      reactions: [say("p3", "follow_up", "rohan-data-sources", "Could you specify which data sources, like load boards, order management system or GPS, feed your prediction model?")],
    },
    { transcript: "GPS from the trucks, your order system and the load board, all through your TMS.", reactions: [] },
    { transcript: "Two people from your ops team for the first two weeks, and read access to the TMS.", reactions: [line("p1", "acknowledge", "l4")] },
  ],
  pitch_end: [
    {
      transcript: "It plugs into your existing TMS through an API, so nothing changes for your drivers. We'd like to start a 6-week pilot on one region next month.",
      reactions: [line("p1", "open_floor", "l2"), say("p3", "question", "rohan-data-feeds", "Could you detail the specific data feeds, load boards, order management system, GPS, that your model consumes?")],
    },
  ],
  question_answer: [
    {
      transcript: "It depends on your setup, but usually it's a few weeks, I'd say.",
      reactions: [say("p3", "follow_up", "rohan-architecture", "I'm asking about the architecture, not the timeline. Which specific data points, GPS pings, order IDs or fleet data, does the model use?")],
    },
    {
      transcript: "GPS pings every 30 seconds, order IDs with pickup windows, and each truck's capacity.",
      reactions: [line("p5", "acknowledge", "l5"), line("p1", "acknowledge", "l3")],
      end: true,
    },
  ],
};
