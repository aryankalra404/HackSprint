import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Bundle, LoggedTurn, Reaction, TurnRequest, TurnResponse } from "./contract";
import { getRoom, updateRoom } from "./room";

// TEMPORARY TEST: a scripted rehearsal, to watch a whole session in VR without speaking. With DRYRUN_SCRIPTED=1 in .env.local,
// POST /api/room/scripted seats the Delhivery panel from the run on 11 Oct (14:51), and /api/turn replays that run's reactions
// with the voices it saved in .audio, without calling n8n. The headset sees `scripted` in the room and stands in for the
// presenter (TurnTaker in the Unity project). Delete this file and every "TEMPORARY TEST" line to remove it.
export const SCRIPTED = process.env.DRYRUN_SCRIPTED === "1";

const SESSION_FILE = path.join(process.cwd(), ".sessions", "smv3l4vbk-mv3m56t5.json");
const SESSION_ID = "scripted-test";

// The bundle lines' voices, matched to the files saved at 14:22 by order and length
const LINE_AUDIO: Record<string, string> = {
  l1: "amv3l4xzab6cd31",
  l2: "amv3l4xzda65f6d",
  l3: "amv3l4xzd9406e5",
  l4: "amv3l4xzddd39da",
  l12: "amv3l4xzg42c0b3",
};

const audio = (file: string) => `/api/audio/${file}.wav`;

type Step = { transcript: string; reactions: Omit<Reaction, "reason">[]; end?: boolean };

const line = (persona_id: string, kind: Reaction["kind"], id: string, text: string) => ({ persona_id, kind, text, raise_hand: false, line_id: id });
const voiced = (persona_id: string, kind: Reaction["kind"], file: string, text: string, raise_hand = false) => ({ persona_id, kind, text, raise_hand, audio_url: audio(file) });

// What happens, turn by turn: the presenter's words are that run's transcript
const OPENING: Step[] = [
  { transcript: "Good morning everyone, thanks for having me, I'm Aryan, founder of RouteIQ.", reactions: [line("p1", "welcome", "l1", "Hi Aryan, thanks for joining us. Please, go ahead with the RouteIQ pitch.")] },
];
const SEGMENTS: Step[] = [
  {
    transcript: "RouteIQ plans your return trips so they come back loaded. In our pilots, empty miles dropped by about a third, and that goes straight to your fuel bill.",
    reactions: [voiced("p3", "question", "amv3m5gfe07af27", "What data inputs are you using to predict load availability that enable this one-third reduction in empty miles?", true)],
  },
  {
    transcript: "At your scale, Delhivery runs tens of thousands of trucks a day, so even a few points of empty miles is crores a year. Our routing learns your lanes in about two weeks.",
    reactions: [voiced("p1", "question", "amv3m5uo0a69b86", "You say the routing learns our lanes in about two weeks. What resources and system changes does that require from our side?", true)],
  },
];
const PITCH_ANSWERS: Step[] = [
  {
    transcript: "In a pilot with 200 trucks over 3 months, empty miles went from 28% to 19%, measured from the fuel cards on the same routes.",
    reactions: [voiced("p3", "follow_up", "amv3m5mi265f28a", "Could you specify which data sources, like load boards, order management system or GPS, feed your prediction model?")],
  },
  { transcript: "GPS from the trucks, your order system and the load board, all through your TMS.", reactions: [] },
  { transcript: "Two people from your ops team for the first two weeks, and read access to the TMS.", reactions: [line("p1", "acknowledge", "l4", "Understood, that helps.")] },
];
const PITCH_END: Step[] = [
  {
    transcript: "It plugs into your existing TMS through an API, so nothing changes for your drivers. We'd like to start a 6-week pilot on one region next month.",
    reactions: [
      line("p1", "open_floor", "l2", "Thank you, Aryan. That was insightful. Let's open the floor to questions from the team."),
      voiced("p3", "question", "amv3m624vec71be", "Could you detail the specific data feeds, load boards, order management system, GPS, that your model consumes?"),
    ],
  },
];
const QUESTION_ANSWERS: Step[] = [
  {
    transcript: "It depends on your setup, but usually it's a few weeks, I'd say.",
    reactions: [voiced("p3", "follow_up", "amv3m6h5u395eac", "I'm asking about the architecture, not the timeline. Which specific data points, GPS pings, order IDs or fleet data, does the model use?")],
  },
  {
    transcript: "GPS pings every 30 seconds, order IDs with pickup windows, and the fleet's capacity per truck.",
    reactions: [line("p5", "acknowledge", "l12", "Thanks for clarifying that."), line("p1", "acknowledge", "l3", "That's a fair point.")],
    end: true,
  },
];

// Seats the scripted panel and briefs the room, keeping the deck that's in it
export async function loadScenario() {
  const saved = JSON.parse(await readFile(SESSION_FILE, "utf8")) as { bundle: Bundle };
  const room = getRoom();
  const images = new Map((room.deck?.slides ?? []).map((s) => [s.index, s.image_url]));
  const bundle: Bundle = {
    ...saved.bundle,
    session_id: SESSION_ID,
    slides: saved.bundle.slides.map((s) => ({ ...s, image_url: images.get(s.index) ?? s.image_url })),
    lines: saved.bundle.lines.map((l) => (LINE_AUDIO[l.id] ? { ...l, audio_url: audio(LINE_AUDIO[l.id]) } : l)),
  };
  const panel = bundle.personas.map(({ id, seat, color, role, role_short, display_name, avatar, difficulty }) => ({ id, seat, color, role, role_short, display_name, avatar, difficulty }));
  return updateRoom({ phase: "briefed", prospect: bundle.prospect, panel, bundle, session_id: SESSION_ID, live: null, slide: 0, debrief: null, scripted: true });
}

// The next scripted step for this turn, counted from the turns already in the feed
export async function scriptedReply(body: TurnRequest, feed: LoggedTurn[]): Promise<TurnResponse> {
  // Long enough for the dashboard to show the turn being worked on
  await new Promise((r) => setTimeout(r, 1200));
  const afterPitch = feed.some((t) => t.mode === "pitch_end");
  const [steps, done] =
    body.mode === "opening" ? [OPENING, feed.filter((t) => t.mode === "opening")]
    : body.mode === "segment" ? [SEGMENTS, feed.filter((t) => t.mode === "segment")]
    : body.mode === "pitch_end" ? [PITCH_END, feed.filter((t) => t.mode === "pitch_end")]
    : afterPitch ? [QUESTION_ANSWERS, feed.slice(feed.findIndex((t) => t.mode === "pitch_end")).filter((t) => t.mode === "answer")]
    : [PITCH_ANSWERS, feed.filter((t) => t.mode === "answer")];
  const step = steps[done.length];
  if (!step) return { transcript: "(scripted test: nothing more on this)", note: "Scripted test: nobody reacts.", reactions: [], answer_verdict: null, end_session: afterPitch };
  return {
    transcript: step.transcript,
    note: "Scripted test, replaying the run of 11 Oct.",
    reactions: step.reactions.map((r) => ({ ...r, reason: "Scripted test" })),
    answer_verdict: body.mode === "answer" ? "partial" : null,
    end_session: step.end ?? false,
  };
}
