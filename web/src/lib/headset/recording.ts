/**
 * Clips of the headset view, recorded in the browser.
 *
 * What is recorded is the window's own canvas, so a clip is exactly what was
 * on screen: the room and the virtual scene, at the stream's size and rate. The
 * browser's MediaRecorder compresses it; the headset does no extra work.
 * MP4 where the browser can write it (Chrome from 126, Safari), since that
 * plays everywhere; WebM where it cannot.
 */

// Best first.
const TYPES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

const BITS_PER_SECOND = 6_000_000;
// Chunks are collected this often, so a clip cut short (the window closed,
// the tab reloaded after) keeps what was recorded up to then.
const CHUNK_MS = 1000;

/** The format a clip is recorded in, or null where the browser cannot record at all. */
export function pickRecordingType(isSupported: (type: string) => boolean): string | null {
  return TYPES.find((type) => isSupported(type)) ?? null;
}

/** Whether this browser can record a canvas at all. */
export function canRecord(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    pickRecordingType((type) => MediaRecorder.isTypeSupported(type)) !== null
  );
}

const pad = (value: number) => String(value).padStart(2, '0');

/** `headset-my-session-2026-09-30-11-42-05.mp4`: the session (or any name) and when the clip started, local time. */
export function clipFileName(project: string, startedAt: Date, type: string): string {
  const safe =
    project
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project';
  const when =
    `${startedAt.getFullYear()}-${pad(startedAt.getMonth() + 1)}-${pad(startedAt.getDate())}` +
    `-${pad(startedAt.getHours())}-${pad(startedAt.getMinutes())}-${pad(startedAt.getSeconds())}`;
  const extension = type.startsWith('video/mp4') ? 'mp4' : 'webm';
  return `headset-${safe}-${when}.${extension}`;
}

/** How long a clip has run: `0:07`, `12:30`, `1:02:03`. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export type ClipRecording = {
  type: string;
  startedAt: Date;
  /** Ends the clip and hands back the whole of it, or null if nothing was recorded. */
  stop: () => Promise<Blob | null>;
};

/** Starts recording `canvas` at up to `fps`. Null where the browser cannot. */
export function recordCanvas(canvas: HTMLCanvasElement, fps: number): ClipRecording | null {
  if (!canRecord()) return null;
  const type = pickRecordingType((candidate) => MediaRecorder.isTypeSupported(candidate))!;
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: BITS_PER_SECOND });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(CHUNK_MS);

  let stopped: Promise<Blob | null> | null = null;
  return {
    type,
    startedAt: new Date(),
    stop() {
      stopped ??= new Promise((resolve) => {
        const finish = () => {
          stream.getTracks().forEach((track) => track.stop());
          resolve(chunks.length > 0 ? new Blob(chunks, { type }) : null);
        };
        if (recorder.state === 'inactive') {
          finish();
          return;
        }
        recorder.onstop = finish;
        recorder.stop();
      });
      return stopped;
    },
  };
}

/** Hands `blob` to the browser as a download named `name`. */
export function saveClip(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Long enough for the download to have started reading it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
