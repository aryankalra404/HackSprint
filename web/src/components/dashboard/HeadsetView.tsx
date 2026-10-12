"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STREAM_PORT, STREAM_SESSION } from "@/lib/headset/config";
import { canRecord, clipFileName, formatElapsed, recordCanvas, saveClip, type ClipRecording } from "@/lib/headset/recording";
import { HeadsetStream, viewUrl, type HeadsetStats, type ViewStats, type ViewStatus } from "@/lib/headset/stream";
import { btn } from "../ui";

const STATUS_TEXT: Record<Exclude<ViewStatus, "live">, string> = {
  connecting: "Reaching the laptop's headset relay…",
  "no-headset": "The headset isn't streaming. Start the DryRun app on the Quest.",
  starting: "Headset found, waiting for its picture…",
  paused: "The headset stopped sending. Is someone wearing it?",
  unsupported: "This browser can't play the headset view. Open the dashboard in Chrome or Safari at localhost.",
};

// What the presenter sees in VR, live (contract: Headset view). Mounting this is what makes the headset
// stream: the relay tells it to start when the first viewer arrives and to stop when the last one leaves,
// so unmount it, rather than hide it, to give the headset its GPU back.
export function HeadsetView({ name }: { name: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<ViewStatus>("connecting");
  const [stats, setStats] = useState<ViewStats | null>(null);
  const [headset, setHeadset] = useState<HeadsetStats | null>(null);
  const recordingRef = useRef<ClipRecording | null>(null);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // The relay runs next to this app, on its own port
    const stream = new HeadsetStream(viewUrl(`${location.protocol}//${location.hostname}:${STREAM_PORT}`, STREAM_SESSION), {
      onStatus: setStatus,
      onStats: setStats,
      onHeadsetStats: setHeadset,
      onFrame: (frame) => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (canvas && context) {
          if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
            canvas.width = frame.displayWidth;
            canvas.height = frame.displayHeight;
          }
          context.drawImage(frame, 0, 0, canvas.width, canvas.height);
        }
        // Every decoded frame must be closed, or the decoder stalls
        frame.close();
      },
    });
    stream.start();
    return () => stream.stop();
  }, []);

  const finish = useCallback(
    (recording: ClipRecording) => {
      void recording.stop().then((clip) => {
        if (clip) saveClip(clip, clipFileName(name, recording.startedAt, recording.type));
      });
    },
    [name],
  );

  function toggleRecording() {
    const recording = recordingRef.current;
    if (recording) {
      recordingRef.current = null;
      setRecordingSince(null);
      finish(recording);
      return;
    }
    const started = canvasRef.current ? recordCanvas(canvasRef.current, 30) : null;
    if (!started) return;
    recordingRef.current = started;
    setRecordingSince(Date.now());
    setNow(Date.now());
  }

  // The clock on the button while a clip runs
  useEffect(() => {
    if (recordingSince === null) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [recordingSince]);

  // Switching away mid-clip keeps the clip so far
  useEffect(
    () => () => {
      const recording = recordingRef.current;
      recordingRef.current = null;
      if (recording) finish(recording);
    },
    [finish],
  );

  const live = status === "live";
  const recording = recordingSince !== null;
  // Only asked once there's a picture, so the server render never touches browser APIs
  const recordable = (live || recording) && canRecord();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-ink">
        <canvas ref={canvasRef} width={1280} height={720} className="absolute inset-0 size-full object-contain" aria-label="The presenter's view in the headset" />
        {!live && (
          <p role="status" className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-axis">
            {STATUS_TEXT[status]}
          </p>
        )}
        {recording && (
          <p className="absolute top-3 left-3 inline-flex items-center gap-2 rounded-full bg-ink/70 px-3 py-1 text-xs text-surface">
            <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-bad" />
            Recording {formatElapsed(now - recordingSince)}
          </p>
        )}
      </div>
      <div className="flex min-h-7 items-center gap-4 text-xs text-muted">
        {live && stats && (
          <>
            <span className="tabular-nums">{stats.fps} fps</span>
            <span className="tabular-nums">{(stats.kbps / 1000).toFixed(1)} Mbit/s</span>
            {headset?.appFps !== undefined && <span className="tabular-nums">Headset app at {Math.round(headset.appFps)} fps</span>}
          </>
        )}
        {recordable && (
          <button
            type="button"
            onClick={toggleRecording}
            aria-pressed={recording}
            className={`${btn("secondary", "sm")} ml-auto`}
          >
            {recording ? "Stop and save clip" : "Record a clip"}
          </button>
        )}
      </div>
    </div>
  );
}
