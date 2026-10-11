import type { Bundle, LiveSession, LoggedTurn, Reaction, Thread, ThinkingTurn, TurnContext, TurnRequest, TurnResponse, VoicedLine } from "./contract";
import { postToN8n } from "./api";
import { compressSpeech, saveAudio } from "./audio";
import { getRoom, updateRoom } from "./room";
import { sampleReply } from "./sample";

// The laptop's side of a turn (contract: POST /turn). The headset sends what the presenter said; the laptop adds what n8n needs to
// decide (the bundle, the turns so far, the questions still open), so n8n keeps no state. n8n's voices are saved here and handed to
// the headset as paths on the laptop, and the turn goes into the room's live feed for the dashboard.

// DRYRUN_FAKE_TURNS=1 answers turns from the bundle instead of n8n (stand-in turns), so clients can be built without spending executions
export const FAKE_TURNS = process.env.DRYRUN_FAKE_TURNS === "1";
const FAKE_DELAY_MS = 2_000;

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

// Turns n8n didn't answer, per run (keyed by its start), so the debrief knows the silence was the system's (contract 0.26: turn_failed)
const g = globalThis as { __dryrunFailedTurns?: Map<string, { t: number; mode: TurnRequest["mode"] }[]> };
const failed = (g.__dryrunFailedTurns ??= new Map<string, { t: number; mode: TurnRequest["mode"] }[]>());

export function failedTurns(startedAt: string): { t: number; type: "turn_failed"; mode: TurnRequest["mode"] }[] {
  return (failed.get(startedAt) ?? []).map((f) => ({ ...f, type: "turn_failed" as const }));
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

// Every question so far with its life (0.26): each turn carries the threads n8n opened or changed, replaced by id
export function threadsFrom(feed: LoggedTurn[]): Thread[] {
  const threads = new Map<string, Thread>();
  for (const turn of feed) for (const t of turn.threads ?? []) threads.set(t.id, t);
  return [...threads.values()];
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
  const feed = room.live.feed ?? [];
  let reply: TurnResponse;
  if (room.scripted) {
    // The sample meeting's run is scripted on the laptop: no n8n call
    reply = await sampleReply(body, feed);
  } else if (FAKE_TURNS) {
    await new Promise((r) => setTimeout(r, FAKE_DELAY_MS));
    reply = standInReply(body, room.bundle, feed);
  } else {
    const { audio_wav_base64, ...rest } = body;
    const speech = await compressSpeech(audio_wav_base64 ?? "");
    const context: TurnContext = { bundle: withoutAudio(room.bundle), elapsed_s: body.t, turns: feed, threads: threadsFrom(feed), pending: pendingQuestions(feed) };
    try {
      reply = await postToN8n<TurnResponse>("/turn", { ...rest, audio_base64: speech.base64, audio_format: speech.format, context });
    } catch (err) {
      failed.set(room.live.started_at, [...(failed.get(room.live.started_at) ?? []), { t: body.t, mode: body.mode }]);
      throw new TurnError(err instanceof Error ? err.message : "n8n failed", 502);
    }
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
    ...(body.time_up ? { time_up: true } : {}),
    transcript: reply.transcript ?? "",
    note: reply.note ?? "",
    reactions: reactions.map(({ persona_id, kind, text, raise_hand, reason, thread_id }) => ({ persona_id, kind, text, raise_hand, reason, ...(thread_id ? { thread_id } : {}) })),
    answer_verdict: reply.answer_verdict ?? null,
    ...(reply.threads?.length ? { threads: reply.threads } : {}),
  };
  // The room may have moved on while n8n worked (ended, restarted): only a live session of the same run keeps the turn
  const now = getRoom();
  if (now.phase === "live" && now.live && now.live.started_at === room.live.started_at) {
    const next = [...(now.live.feed ?? []), turn].sort((a, b) => a.t - b.t);
    updateRoom({ live: { ...now.live, feed: next, stage: stageAfter(now.live.stage ?? "opening", turn) } });
  }
  return { ...reply, reactions };
}

// A stand-in for n8n's /turn, from the bundle alone (DRYRUN_FAKE_TURNS=1). It follows the shape of a real meeting: the chair welcomes,
// someone with an objection on a slide asks it the first time that slide is pitched, answers are acknowledged, the pitch end opens the
// floor for one question from someone who waits, and the answer to that gets the chair's closing.
function standInReply(body: TurnRequest, bundle: Bundle, feed: LoggedTurn[]): TurnResponse {
  const chair = bundle.personas.find((p) => p.chair) ?? bundle.personas[0];
  const line = (kind: VoicedLine["kind"], personaId?: string) => bundle.lines.find((l) => l.kind === kind && (!personaId || l.persona_id === personaId));
  const say = (kind: Reaction["kind"], personaId: string, fallback: string, from?: VoicedLine, raise = false): Reaction => ({
    persona_id: from?.persona_id ?? personaId,
    kind,
    text: from?.text ?? fallback,
    ...(from ? { line_id: from.id } : {}),
    raise_hand: raise,
    reason: "Stand-in turn: answered from the bundle, not n8n.",
  });
  const asked = new Set(feed.flatMap((t) => t.reactions.filter((r) => r.kind === "question" || r.kind === "follow_up").map((r) => r.text)));
  const reply = (reactions: Reaction[], end = false): TurnResponse => ({
    transcript: "(stand-in)",
    note: "Stand-in turn (DRYRUN_FAKE_TURNS): n8n wasn't called.",
    reactions,
    answer_verdict: body.mode === "answer" && body.asked_by ? "partial" : null,
    end_session: end,
  });

  if (body.mode === "opening") return reply(chair ? [say("welcome", chair.id, "Welcome, thanks for coming in. Go ahead whenever you're ready.", line("welcome", chair.id) ?? line("welcome"))] : []);

  if (body.mode === "segment") {
    const pitchedBefore = feed.some((t) => t.mode === "segment" && t.slide_index === body.slide_index);
    const asker = pitchedBefore ? null : bundle.personas.find((p) => p.objections.some((o) => o.slide_index === body.slide_index && !asked.has(o.text)));
    const objection = asker?.objections.find((o) => o.slide_index === body.slide_index && !asked.has(o.text));
    return reply(asker && objection ? [say("question", asker.id, objection.text, undefined, true)] : []);
  }

  if (body.mode === "pitch_end") {
    // Stopped for time, the chair has already moved to the questions (0.25)
    const reactions = chair && !body.time_up ? [say("open_floor", chair.id, "Thank you. Let's open it up for questions.", line("open_floor", chair.id) ?? line("open_floor"))] : [];
    const waiter = bundle.personas.find((p) => p.manner === "waits" && p.objections.some((o) => !asked.has(o.text)));
    const question = waiter?.objections.find((o) => !asked.has(o.text));
    if (waiter && question) return reply([...reactions, say("question", waiter.id, question.text, undefined, true)]);
    // Nobody left to ask: the chair closes straight away
    return reply(chair ? [...reactions, say("closing", chair.id, "Thank you, we'll come back to you.")] : reactions, true);
  }

  // An answer: after the pitch end, the chair closes the meeting; during the pitch, it's acknowledged
  if (feed.some((t) => t.mode === "pitch_end") && chair) return reply([say("closing", chair.id, "Thank you, we'll come back to you.")], true);
  const by = body.asked_by ?? chair?.id;
  if (!by) return reply([]);
  return reply([say("acknowledge", by, "Thanks, that helps.", line("acknowledge", by))]);
}
