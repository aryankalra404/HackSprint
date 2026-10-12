"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { LiveNow, Room, Telemetry, TurnRequest, TurnResponse } from "../contract";
import { useRoom } from "../useRoom";
import { type Mic, micContext, openMic } from "./mic";
import { Player, type Voice } from "./player";
import { type Clip, TurnTaker, type TurnView } from "./turn-taker";
import { VoiceActivity } from "./voice-activity";

// The browser rehearsal, wired to React and the laptop's room: the mic and its voice activity, the panel's voices, and the turn-taker,
// which sends the same /api/turn requests the headset sends. The room stays the source of truth for the phase and the slide; this
// starts the session on the presenter's first words, ends it (with the browser's telemetry for the debrief) and tells the room who
// is speaking and who has a hand up (POST /api/room/now), for the dashboard.

const TICK_MS = 100;

// off: not asked yet; none: the presenter chose to go on without it
export type MicState = "off" | "asking" | "ready" | "denied" | "none";

export interface DebugInfo {
  level: number;
  background: number;
  threshold: number;
  speaking: boolean;
  quietFor: number;
  recorded: number;
  speech: number;
  rate: number;
}

const IDLE_VIEW: TurnView = { active: false, stage: "opening", speaking: null, hands: [], caption: null, prompt: null, cue: null, wrapUp: null, time: null, inFlight: 0 };

async function postJson(url: string, body: unknown, timeoutS?: number): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...(timeoutS ? { signal: AbortSignal.timeout(timeoutS * 1000) } : {}),
  });
}

export function useRehearsal(initial: Room, debug: boolean) {
  const room = useRoom(initial);
  const [mic, setMic] = useState<MicState>("off");
  const [micError, setMicError] = useState<string | null>(null);
  const [view, setView] = useState<TurnView>(IDLE_VIEW);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Between the End click and the room moving to done
  const [endingNow, setEndingNow] = useState(false);

  const va = useRef<VoiceActivity | null>(null);
  const micRef = useRef<Mic | null>(null);
  const player = useRef<Player | null>(null);
  const turns = useRef<TurnTaker | null>(null);
  // The run the turn-taker is on (live.started_at)
  const runOf = useRef<string | null>(null);
  const roomRef = useRef(room);
  const startAsked = useRef(false);
  const ending = useRef(false);
  const sentNow = useRef<string>("");

  // The slide asked for here, shown at once until the room catches up; without a deck, the slide is kept here
  const [asked, setAsked] = useState<{ index: number; version: number } | null>(null);
  const [localSlide, setLocalSlide] = useState(0);
  const hasDeck = room.deck != null;
  const slideCount = room.deck?.slides.length ?? room.bundle?.slides.length ?? 0;
  const slide = hasDeck ? (asked && asked.version === room.version ? asked.index : room.slide) : localSlide;
  const slideRef = useRef(slide);
  useEffect(() => {
    roomRef.current = room;
    slideRef.current = slide;
  });

  const go = useCallback(
    async (index: number) => {
      const next = Math.max(0, Math.min(slideCount - 1, index));
      if (next === slide) return;
      if (!hasDeck) {
        setLocalSlide(next);
        return;
      }
      setAsked({ index: next, version: room.version });
      try {
        const res = await postJson("/api/room/slide", { index: next, by: "web" });
        if (!res.ok) setAsked(null);
      } catch {
        setAsked(null);
      }
    },
    [slide, slideCount, hasDeck, room.version],
  );

  // A presentation clicker sends Page Down and Page Up; the arrows work too
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
    if (["PageDown", "ArrowRight"].includes(e.key)) go(slide + 1);
    else if (["PageUp", "ArrowLeft"].includes(e.key)) go(slide - 1);
    else return;
    e.preventDefault();
  });
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sendSession = useCallback(async (action: "start" | "end" | "restart") => {
    setError(null);
    try {
      const res = await postJson("/api/room/session", { action, by: "web" });
      // 409: the room moved on (the dashboard or the headset got there first); follow it
      if (!res.ok && res.status !== 409) setError(((await res.json()) as { error?: string }).error ?? "That didn't work.");
    } catch {
      setError("Couldn't reach the laptop's room.");
    }
  }, []);

  const stopMic = useCallback(() => {
    micRef.current?.stop();
    void micRef.current?.context.close();
    micRef.current = null;
    va.current = null;
    setMic((m) => (m === "ready" || m === "none" ? "off" : m));
  }, []);

  // 6.4: whatever ends it, the browser's silences go to the debrief first, then the session ends
  const end = useCallback(async () => {
    const r = roomRef.current;
    if (ending.current || r.phase !== "live" || !r.live) return;
    ending.current = true;
    setEndingNow(true);
    const silences = turns.current?.stop() ?? [];
    turns.current = null;
    stopMic();
    const telemetry: Telemetry = {
      session_id: r.session_id ?? "",
      client: "web",
      duration_s: Math.round((Date.now() - Date.parse(r.live.started_at)) / 100) / 10,
      events: silences,
    };
    try {
      await postJson("/api/debrief", telemetry);
    } catch {
      // The debrief still has the turns and slides
    }
    await sendSession("end");
    ending.current = false;
    setEndingNow(false);
  }, [sendSession, stopMic]);

  const prefetch = useCallback((p: Player) => {
    for (const line of roomRef.current.bundle?.lines ?? []) if (line.audio_url) void p.load(line.audio_url);
  }, []);

  const ensurePlayer = useCallback(() => {
    if (!player.current) player.current = new Player(new AudioContext());
    void player.current.context.resume();
    return player.current;
  }, []);

  // The click that allows the mic is the gesture that lets the page play audio too
  const allowMic = useCallback(async () => {
    setMicError(null);
    setMic("asking");
    const p = ensurePlayer();
    const context = micContext();
    const activity = new VoiceActivity();
    try {
      micRef.current = await openMic(context, (samples) => activity.push(samples));
      va.current = activity;
      activity.onSpeakingChange = (speaking) => {
        // Start on speech: the presenter's first words start the session
        if (speaking && roomRef.current.phase === "briefed" && !startAsked.current) {
          startAsked.current = true;
          void sendSession("start");
        }
      };
      setMic("ready");
      prefetch(p);
    } catch (err) {
      void context.close();
      const name = err instanceof DOMException ? err.name : "";
      setMicError(
        name === "NotAllowedError"
          ? "The browser blocked the mic. Click the icon at the left of the address bar, allow the microphone for this site, then try again."
          : name === "NotFoundError"
            ? "No microphone was found. Plug one in (headphones with a mic work best), then try again."
            : "The mic couldn't start. Check that no other app is using it, then try again.",
      );
      setMic("denied");
    }
  }, [ensurePlayer, prefetch, sendSession]);

  const goWithoutMic = useCallback(() => {
    prefetch(ensurePlayer());
    setMicError(null);
    setMic("none");
  }, [ensurePlayer, prefetch]);

  // Follow the room: begin taking turns when it goes live (here, from the dashboard, or on Resume), stop when it ends elsewhere
  const live = room.phase === "live" ? room.live : null;
  const micUsable = mic === "ready" || mic === "none";
  useEffect(() => {
    if (room.phase === "briefed") startAsked.current = false;
    if (!live || !room.bundle || !micUsable) {
      if (turns.current && (!live || runOf.current !== live.started_at)) {
        // The room ended the run elsewhere (the dashboard, or n8n's closing raced the End button): let go of the mic too.
        // stop() publishes the idle view.
        turns.current.stop();
        turns.current = null;
        runOf.current = null;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- following the room, an outside system
        if (room.phase === "done") stopMic();
      }
      return;
    }
    if (turns.current && runOf.current === live.started_at) return;
    turns.current?.stop();
    // Without the mic, nothing is ever heard: the panel stays quiet
    const ears = va.current ?? new VoiceActivity();
    const p = ensurePlayer();
    const startedAt = Date.parse(live.started_at);
    const tt = new TurnTaker(room.bundle, ears, {
      now: () => performance.now() / 1000,
      elapsed: () => (Date.now() - startedAt) / 1000,
      slide: () => slideRef.current,
      slideCount: () => roomRef.current.deck?.slides.length ?? null,
      send: async (request: TurnRequest, timeoutS: number) => {
        try {
          const res = await postJson("/api/turn", request, timeoutS);
          if (!res.ok) {
            console.warn(`[Turns] ${request.mode} answered ${res.status}: ${((await res.json().catch(() => ({}))) as { error?: string }).error ?? ""}`);
            return null;
          }
          return (await res.json()) as TurnResponse;
        } catch (err) {
          console.warn(`[Turns] ${request.mode} failed:`, err);
          return null;
        }
      },
      load: (url: string) => p.load(url),
      play: (clip: Clip, onEnd: () => void) => p.play(clip as Voice, onEnd),
      ended: () => void end(),
    });
    tt.onView = setView;
    turns.current = tt;
    runOf.current = live.started_at;
    tt.begin(room.session_id ?? "", live.stage);
  }, [live, room.phase, room.bundle, room.session_id, micUsable, ensurePlayer, end, stopMic]);

  // The turn-taker's clock, and who's speaking or has a hand up for the dashboard (sent only when it changes)
  const isLive = live != null;
  useEffect(() => {
    if (!isLive) return;
    const timer = setInterval(() => {
      const tt = turns.current;
      if (!tt) return;
      tt.tick();
      const now: LiveNow = { speaking: tt.view.speaking, hands: tt.view.hands };
      const key = JSON.stringify(now);
      if (tt.isActive && key !== sentNow.current) {
        sentNow.current = key;
        void postJson("/api/room/now", { ...now, by: "web" }).catch(() => {});
      }
    }, TICK_MS);
    return () => {
      clearInterval(timer);
      sentNow.current = "";
    };
  }, [isLive]);

  // ?debug=1: the mic's numbers, for tuning the thresholds in the venue
  useEffect(() => {
    if (!debug) return;
    const timer = setInterval(() => {
      const a = va.current;
      setDebugInfo(
        a
          ? { level: a.level, background: a.background, threshold: a.threshold, speaking: a.speaking, quietFor: a.quietFor, recorded: a.recordedSeconds, speech: a.recordedSpeech, rate: micRef.current?.context.sampleRate ?? 0 }
          : null,
      );
    }, 200);
    return () => clearInterval(timer);
  }, [debug]);

  // Leaving mid-run loses the run's turn-taking: the browser asks first
  useEffect(() => {
    if (room.phase !== "live") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [room.phase]);

  // Let go of the mic and audio when the page closes
  useEffect(
    () => () => {
      turns.current?.stop();
      micRef.current?.stop();
      void micRef.current?.context.close();
      player.current?.close();
    },
    [],
  );

  return {
    room,
    mic,
    micError,
    allowMic,
    goWithoutMic,
    view,
    error,
    slide,
    slideCount,
    go,
    start: () => sendSession("start"),
    end,
    ending: endingNow,
    restart: () => sendSession("restart"),
    takeQuestions: () => turns.current?.takeQuestions(),
    // Read every frame by the meters, not through React
    micLevel: () => va.current?.level ?? 0,
    micThreshold: () => va.current?.threshold ?? 0,
    voiceLevel: () => player.current?.level() ?? 0,
    debugInfo,
  };
}
