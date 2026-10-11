import type { Bundle, LiveSession, LoggedTurn, Reaction, ThinkingTurn, TurnContext, TurnRequest, TurnResponse } from "./contract";
import { postToN8n } from "./api";
import { compressSpeech, saveAudio } from "./audio";
import { getRoom, updateRoom } from "./room";
import { SCRIPTED, scriptedReply } from "./scripted";

// The laptop's side of a turn (contract: POST /turn). The headset sends what the presenter said; the laptop adds what n8n needs to
// decide (the bundle, the turns so far, the questions still open), so n8n keeps no state. n8n's voices are saved here and handed to
// the headset as paths on the laptop, and the turn goes into the room's live feed for the dashboard.

export class TurnError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 502,
  ) {
    super(message);
  }
}

// The bundle without audio: the lines' voices stay on the laptop
function withoutAudio(bundle: Bundle): Bundle {
  return { ...bundle, lines: bundle.lines.map(({ audio_base64: _a, audio_url: _u, ...l }) => l) };
}

// Questions nobody has answered yet: a question stays open until an answer with that person's asked_by arrives
export function pendingQuestions(feed: LoggedTurn[]): TurnContext["pending"] {
  const open: TurnContext["pending"] = [];
  for (const turn of feed) {
    if (turn.mode === "answer") {
      const i = open.findIndex((q) => q.persona_id === turn.asked_by);
      if (i >= 0) open.splice(i, 1);
    }
    for (const r of turn.reactions) {
      if (r.kind !== "question" && r.kind !== "follow_up") continue;
      // A follow-up replaces that person's open question
      const i = open.findIndex((q) => q.persona_id === r.persona_id);
      if (i >= 0) open.splice(i, 1);
      open.push({ persona_id: r.persona_id, text: r.text, slide_index: turn.slide_index });
    }
  }
  return open;
}

// Where the session is, from its turns: opening until the first slide, pitch until the pitch ends, then questions, then closing
function stageAfter(stage: LiveSession["stage"], turn: LoggedTurn): LiveSession["stage"] {
  if (turn.reactions.some((r) => r.kind === "closing")) return "closing";
  if (turn.mode === "pitch_end") return "questions";
  if (turn.mode === "segment" && stage === "opening") return "pitch";
  return stage;
}

export async function takeTurn(body: TurnRequest): Promise<TurnResponse> {
  if (!body || !["opening", "segment", "answer", "pitch_end"].includes(body.mode)) throw new TurnError("mode must be opening, segment, answer or pitch_end", 400);
  const room = getRoom();
  if (room.phase !== "live" || !room.live || !room.bundle) throw new TurnError(`The room is ${room.phase}, not live.`, 409);
  if (body.session_id && room.session_id && body.session_id !== room.session_id) throw new TurnError("That turn is for another session.", 409);

  const thinking: ThinkingTurn = { id: `${room.live.started_at}:${body.t}:${body.mode}`, mode: body.mode, slide_index: body.slide_index, t: body.t, ...(body.asked_by ? { asked_by: body.asked_by } : {}) };
  setThinking(room.live.started_at, (list) => [...list, thinking]);
  try {
    return await forward(body, room as typeof room & { live: LiveSession; bundle: Bundle });
  } finally {
    setThinking(room.live.started_at, (list) => list.filter((x) => x.id !== thinking.id));
  }
}

// Marks a turn as waiting on n8n (or not), for the dashboard, as long as the room is still on the same run
function setThinking(startedAt: string, change: (list: ThinkingTurn[]) => ThinkingTurn[]) {
  const now = getRoom();
  if (!now.live || now.live.started_at !== startedAt) return;
  updateRoom({ live: { ...now.live, thinking: change(now.live.thinking ?? []) } });
}

async function forward(body: TurnRequest, room: ReturnType<typeof getRoom> & { live: LiveSession; bundle: Bundle }): Promise<TurnResponse> {
  const { audio_wav_base64, ...rest } = body;
  const speech = await compressSpeech(audio_wav_base64 ?? "");
  const feed = room.live.feed ?? [];
  const context: TurnContext = { bundle: withoutAudio(room.bundle), elapsed_s: body.t, turns: feed, pending: pendingQuestions(feed) };
  let reply: TurnResponse;
  try {
    // TEMPORARY TEST: a scripted room replays its run instead of asking n8n
    reply = SCRIPTED && room.scripted ? await scriptedReply(body, feed) : await postToN8n<TurnResponse>("/turn", { ...rest, audio_base64: speech.base64, audio_format: speech.format, context });
  } catch (err) {
    throw new TurnError(err instanceof Error ? err.message : "n8n failed", 502);
  }

  // Each voice becomes a path on the laptop: new lines are saved, lines voiced in /prep already have one
  const lines = new Map(room.bundle.lines.map((l) => [l.id, l.audio_url]));
  const reactions: Reaction[] = await Promise.all(
    (reply.reactions ?? []).map(async ({ audio_base64, ...r }) => {
      const url = audio_base64 ? await saveAudio(audio_base64) : r.line_id ? lines.get(r.line_id) : undefined;
      return url ? { ...r, audio_url: url } : r;
    }),
  );

  const turn: LoggedTurn = {
    mode: body.mode,
    slide_index: body.slide_index,
    t: body.t,
    ...(body.asked_by ? { asked_by: body.asked_by } : {}),
    transcript: reply.transcript ?? "",
    note: reply.note ?? "",
    reactions: reactions.map(({ persona_id, kind, text, raise_hand, reason }) => ({ persona_id, kind, text, raise_hand, reason })),
    answer_verdict: reply.answer_verdict ?? null,
  };
  // The room may have moved on while n8n worked (ended, restarted): only a live session of the same run keeps the turn
  const now = getRoom();
  if (now.phase === "live" && now.live && now.live.started_at === room.live.started_at) {
    const next = [...(now.live.feed ?? []), turn].sort((a, b) => a.t - b.t);
    updateRoom({ live: { ...now.live, feed: next, stage: stageAfter(now.live.stage ?? "opening", turn) } });
  }
  return { ...reply, reactions };
}
