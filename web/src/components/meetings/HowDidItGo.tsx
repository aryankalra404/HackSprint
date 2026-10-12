"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type Mic, micContext, openMic } from "@/lib/rehearse/mic";
import { SAMPLE_RATE, concat, encodeWav, rms, toBase64 } from "@/lib/rehearse/wav";
import { StatusIcon } from "../ui";

// "How did it go?" after a real meeting (contract 0.28): a voice note recorded here (16 kHz mono, the rehearsal's mic) and/or typed
// notes, sent to n8n's DryRun after the meeting through the laptop (POST /api/after-meeting, which cuts it into pieces for Sarvam).
// One n8n run. The page then shows what n8n found, from the meeting's after.

// n8n reads up to 12 pieces of under 30 s; 4 minutes leaves room for cutting at pauses
const MAX_S = 240;

type Phase = { at: "idle" } | { at: "recording"; started: number } | { at: "sending"; started: number } | { at: "failed"; error: string };

export function HowDidItGo({ meetingId, names }: { meetingId: string; names: string[] }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const [notes, setNotes] = useState("");
  // The recorded note, kept if sending fails
  const [voice, setVoice] = useState<{ seconds: number; url: string } | null>(null);
  const [level, setLevel] = useState(0);
  const [now, setNow] = useState(0);
  const mic = useRef<Mic | null>(null);
  const chunks = useRef<Float32Array[]>([]);
  const wav = useRef<string | null>(null);

  // The clock while recording or sending; a recording stops by itself at the limit
  const startedAt = useRef(0);
  const ticking = phase.at === "recording" || phase.at === "sending";
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (mic.current && t - startedAt.current >= MAX_S * 1000) stop();
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stop only touches refs and state setters, the same every render
  }, [ticking]);

  const stopMic = () => {
    mic.current?.stop();
    void mic.current?.context.close();
    mic.current = null;
  };
  useEffect(() => stopMic, []);

  async function record() {
    chunks.current = [];
    wav.current = null;
    setVoice(null);
    const context = micContext();
    try {
      mic.current = await openMic(context, (samples) => {
        chunks.current.push(samples);
        setLevel(Math.min(1, rms(samples) * 8));
      });
      startedAt.current = Date.now();
      setNow(startedAt.current);
      setPhase({ at: "recording", started: startedAt.current });
    } catch {
      void context.close();
      setPhase({ at: "failed", error: "The browser didn't allow the microphone. Allow it in the address bar, or type your notes instead." });
    }
  }

  function stop() {
    stopMic();
    const samples = concat(chunks.current);
    chunks.current = [];
    if (samples.length < SAMPLE_RATE) {
      setPhase({ at: "failed", error: "That was under a second: nothing to send. Record again, or type your notes." });
      return;
    }
    const bytes = encodeWav(samples);
    wav.current = toBase64(bytes);
    setVoice({ seconds: samples.length / SAMPLE_RATE, url: URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "audio/wav" })) });
    setPhase({ at: "idle" });
  }

  const elapsed = phase.at === "recording" ? Math.max(0, (now - phase.started) / 1000) : 0;

  async function send() {
    const started = Date.now();
    setNow(started);
    setPhase({ at: "sending", started });
    try {
      const res = await fetch("/api/after-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_id: meetingId, wav_base64: wav.current ?? undefined, notes: notes.trim() || undefined }),
      });
      const answer = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(answer.error ?? `The laptop answered ${res.status}`);
      router.refresh();
    } catch (err) {
      setPhase({ at: "failed", error: `${err instanceof Error ? err.message : "n8n didn't answer"}. Your notes are still here; try again.` });
    }
  }

  const hasVoice = !!voice && phase.at !== "recording";
  const canSend = (hasVoice || notes.trim().length > 0) && phase.at !== "recording" && phase.at !== "sending";
  const waited = phase.at === "sending" ? Math.round((now - phase.started) / 1000) : 0;
  const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "each person");

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-ink bg-surface p-6">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-2xl">How did it go?</h2>
        <p className="max-w-2xl text-sm text-ink-2">
          Say it in a minute, the way you&apos;d tell a colleague: what {who} raised, what you promised, what was decided. n8n writes it down
          per person, adds it to their twins, checks how much of it your rehearsal predicted and drafts the follow-up. The follow-up waits in
          your inbox until you approve it.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {phase.at === "recording" ? (
          <>
            <button type="button" onClick={stop} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-surface">Stop</button>
            <span className="flex items-center gap-2 text-sm tabular-nums">
              <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-bad" />
              Recording {clock(elapsed)} <span className="text-muted">of {clock(MAX_S)}</span>
            </span>
            <span aria-hidden="true" className="h-1.5 w-32 overflow-hidden rounded-full bg-line">
              <span className="block h-full bg-ink transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
            </span>
          </>
        ) : hasVoice ? (
          <>
            <audio controls src={voice.url} className="h-9" />
            <span className="text-sm text-ink-2 tabular-nums">Voice note, {clock(voice.seconds)}</span>
            <button type="button" onClick={record} disabled={phase.at === "sending"} className="rounded-full border border-line px-3 py-1 text-sm hover:border-ink disabled:opacity-50">Record again</button>
          </>
        ) : (
          <button type="button" onClick={record} disabled={phase.at === "sending"} className="rounded-full border border-ink px-4 py-2 text-sm font-medium hover:bg-paper disabled:opacity-50">
            Record a voice note
          </button>
        )}
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-2">{hasVoice ? "Anything to add in writing (optional)" : "Or type your notes"}</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={12000}
          disabled={phase.at === "sending"}
          placeholder="Asha asked what the pilot costs per truck. I promised the security note by Monday. We agreed on a call next week."
          className="rounded-xl border border-line bg-surface px-3 py-2 placeholder:text-muted focus:border-ink focus:outline-none"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={send} disabled={!canSend} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-surface disabled:opacity-50">
          {phase.at === "sending" ? "n8n is reading it…" : "Send to n8n"}
        </button>
        {phase.at === "sending" ? (
          <span className="text-sm text-ink-2 tabular-nums" role="status">
            {hasVoice ? "Sarvam is transcribing, then n8n works out what each person said" : "n8n is working out what each person said"} ({waited} s; about a minute)
          </span>
        ) : (
          <span className="text-xs text-muted">One n8n run. The recording goes to Sarvam for the transcript and isn&apos;t kept on the laptop.</span>
        )}
      </div>

      {phase.at === "failed" && (
        <p role="alert" className="flex items-center gap-2 text-sm text-bad-ink">
          <StatusIcon tone="bad" className="size-4 shrink-0" /> {phase.error}
        </p>
      )}
    </section>
  );
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
