import type { LoggedTurn, TurnRequest, TurnResponse } from "./contract";
import { SAMPLE_ID, SCRIPT, sampleBundle, sampleDeck } from "./mock/sample";
import { setDeck, updateRoom } from "./room";

// The sample meeting's rehearsal, all on the laptop (see mock/sample.ts): briefing it seats the fixed panel with no n8n call, and
// its turns are answered from the script. The room's `scripted` tells the headset to stand in for the presenter, so it's always
// rehearsed in VR.

// Briefs the room with the sample's panel, slides and voices. The panel is the sample's whatever was edited on the practice page,
// since the script and the voices belong to those five.
export function briefSample(): string {
  setDeck(sampleDeck);
  const panel = sampleBundle.personas.map(({ id, seat, color, role, role_short, display_name, avatar, difficulty }) => ({ id, seat, color, role, role_short, display_name, avatar, difficulty }));
  updateRoom({ phase: "briefed", prospect: sampleBundle.prospect, panel, bundle: sampleBundle, session_id: SAMPLE_ID, live: null, slide: 0, debrief: null, scripted: true, rehearse_in: "vr" });
  return SAMPLE_ID;
}

// The script's next step for this turn, counted from the turns already in the feed
export async function sampleReply(body: TurnRequest, feed: LoggedTurn[]): Promise<TurnResponse> {
  // Long enough for the dashboard to show the turn being worked on
  await new Promise((r) => setTimeout(r, 1200));
  const pitchEnd = feed.findIndex((t) => t.mode === "pitch_end");
  const count = (mode: LoggedTurn["mode"], from = 0) => feed.slice(from).filter((t) => t.mode === mode).length;
  const [steps, done] =
    body.mode === "answer"
      ? pitchEnd >= 0
        ? [SCRIPT.question_answer, count("answer", pitchEnd)]
        : [SCRIPT.pitch_answer, count("answer")]
      : [SCRIPT[body.mode], count(body.mode)];
  const step = steps[done];
  if (!step) return { transcript: "", note: "Sample: nobody reacts here.", reactions: [], answer_verdict: null, end_session: false };
  return {
    transcript: step.transcript,
    note: "Sample: scripted, no n8n call.",
    reactions: step.reactions.map((r) => ({ ...r, reason: "Sample script" })),
    answer_verdict: body.mode === "answer" ? "partial" : null,
    end_session: step.end ?? false,
  };
}
