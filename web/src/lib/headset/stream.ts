/**
 * What the wearer sees, played in the browser.
 *
 * The headset encodes its view as H.264 on the Quest's hardware encoder and
 * sends each frame to the relay's /view WebSocket (relay.ts, which runs in this
 * app's server and has the format), which passes it here. The browser's own
 * decoder, WebCodecs' VideoDecoder, turns each frame back into a picture.
 *
 * Nothing is shown until a keyframe arrives: every other frame only says
 * what changed since the one before. A decoder that falls behind, or loses
 * its place, drops what it has queued and asks for a new keyframe, so the
 * picture stays live rather than playing out a backlog.
 */

const FORMAT = 1;
const KEYFRAME = 1;
const HEADER_BYTES = 6;
// Frames queued in the decoder before it skips ahead to the next keyframe.
const MAX_DECODE_QUEUE = 4;
// Without a frame for this long a live picture is called paused. The app
// stops rendering when the headset is taken off.
const STALL_MS = 3000;
const RETRY_MS = 2000;

export type ViewFrame = { key: boolean; atMs: number; data: Uint8Array };

export type ViewStatus =
  /** Reaching the relay. */
  | 'connecting'
  /** Connected, but no headset is streaming to this session. */
  | 'no-headset'
  /** A headset is here and has been asked for its view; no picture yet. */
  | 'starting'
  | 'live'
  /** It was live and frames stopped coming. */
  | 'paused'
  /** This browser has no H.264 decoder to use. */
  | 'unsupported';

/** The relay's /view address for watching `sessionId`, from its http(s) address. */
export function viewUrl(serverUrl: string, sessionId: string): string {
  const url = new URL('/view', serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('role', 'viewer');
  url.searchParams.set('session', sessionId);
  return url.toString();
}

/** One frame off the wire, or null if it is not one. */
export function parseFrame(buffer: ArrayBuffer): ViewFrame | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length <= HEADER_BYTES || bytes[0] !== FORMAT) return null;
  const atMs = new DataView(buffer).getUint32(2, false);
  return { key: (bytes[1]! & KEYFRAME) !== 0, atMs, data: bytes.subarray(HEADER_BYTES) };
}

/** An Annex B access unit split at its start codes, each unit without its start code. */
export function nalUnits(data: Uint8Array): Uint8Array[] {
  const starts: { at: number; length: number }[] = [];
  for (let i = 0; i + 2 < data.length; i++) {
    if (data[i] !== 0 || data[i + 1] !== 0) continue;
    if (data[i + 2] === 1) {
      starts.push({ at: i, length: 3 });
      i += 2;
    } else if (data[i + 2] === 0 && data[i + 3] === 1) {
      starts.push({ at: i, length: 4 });
      i += 3;
    }
  }
  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1]!.at : data.length;
    return data.subarray(start.at + start.length, end);
  });
}

const hex = (value: number) => value.toString(16).padStart(2, '0');

/**
 * The codec string a decoder is configured with (`avc1.42c01f`), read off
 * the keyframe's sequence parameter set: its profile, constraint flags and
 * level, in that order. Null when the frame carries no SPS.
 */
export function codecFromKeyframe(data: Uint8Array): string | null {
  for (const unit of nalUnits(data)) {
    if (unit.length < 4 || (unit[0]! & 0x1f) !== 7) continue;
    return `avc1.${hex(unit[1]!)}${hex(unit[2]!)}${hex(unit[3]!)}`;
  }
  return null;
}

/** Whether this browser can decode the stream at all. WebCodecs needs a secure page (https, or localhost). */
export function canDecode(): boolean {
  return typeof VideoDecoder !== 'undefined' && typeof EncodedVideoChunk !== 'undefined';
}

/** Over the last second: pictures shown, and what arrived, in kbit/s. */
export type ViewStats = { fps: number; kbps: number };

/**
 * What the headset measured over its last second (HeadsetView.cs). A
 * picture can only be taken on a frame the app draws, so `appFps` caps the
 * stream; the skips say whether read-back or the encoder dropped the rest.
 */
export type HeadsetStats = {
  appFps?: number;
  takenFps?: number;
  sentFps?: number;
  skippedReadback?: number;
  skippedEncoder?: number;
  encodeMs?: number;
  /** Whether the real room is behind the virtual parts. */
  room?: boolean;
};

export type HeadsetStreamHandlers = {
  /** A decoded picture. The handler owns it and must close() it. */
  onFrame: (frame: VideoFrame) => void;
  onStatus: (status: ViewStatus) => void;
  /** Once a second while connected. */
  onStats?: (stats: ViewStats) => void;
  /** Once a second while the headset streams. */
  onHeadsetStats?: (stats: HeadsetStats) => void;
};

/** Watches one session's headset until stop(). */
export class HeadsetStream {
  private ws: WebSocket | null = null;
  private decoder: VideoDecoder | null = null;
  private codec: string | null = null;
  private waitingForKey = true;
  private status: ViewStatus | null = null;
  private lastFrameAt = 0;
  private shown = 0;
  private received = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly handlers: HeadsetStreamHandlers,
  ) {}

  start(): void {
    if (!canDecode()) {
      this.setStatus('unsupported');
      return;
    }
    this.open();
    this.watchdog = setInterval(() => {
      if (this.status === 'live' && performance.now() - this.lastFrameAt > STALL_MS) this.setStatus('paused');
      this.handlers.onStats?.({ fps: this.shown, kbps: Math.round((this.received * 8) / 1000) });
      this.shown = 0;
      this.received = 0;
    }, 1000);
  }

  stop(): void {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    if (this.watchdog) clearInterval(this.watchdog);
    this.ws?.close();
    this.ws = null;
    this.closeDecoder();
  }

  private setStatus(status: ViewStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.handlers.onStatus(status);
  }

  private open(): void {
    this.setStatus('connecting');
    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
      if (typeof event.data === 'string') this.onControl(event.data);
      else this.onFrame(event.data);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.closeDecoder();
      if (this.stopped) return;
      this.setStatus('connecting');
      this.retry = setTimeout(() => this.open(), RETRY_MS);
    };
  }

  private onControl(text: string): void {
    let message: { type?: string; headset?: boolean } & HeadsetStats;
    try {
      message = JSON.parse(text) as typeof message;
    } catch {
      return;
    }
    if (message.type === 'stats') {
      this.handlers.onHeadsetStats?.(message);
      return;
    }
    if (message.type !== 'state') return;
    if (message.headset) {
      if (this.status !== 'live') this.setStatus('starting');
    } else {
      this.closeDecoder();
      this.setStatus('no-headset');
    }
  }

  private onFrame(buffer: ArrayBuffer): void {
    const frame = parseFrame(buffer);
    if (!frame) return;
    this.received += buffer.byteLength;
    if (this.waitingForKey && !frame.key) return;

    if (frame.key) {
      const codec = codecFromKeyframe(frame.data);
      if (codec && (codec !== this.codec || !this.decoder || this.decoder.state === 'closed')) {
        this.configure(codec);
      }
      if (!this.decoder) return;
      this.waitingForKey = false;
    } else if (!this.decoder || this.decoder.decodeQueueSize > MAX_DECODE_QUEUE) {
      this.needKeyframe();
      return;
    }

    try {
      this.decoder!.decode(
        new EncodedVideoChunk({
          type: frame.key ? 'key' : 'delta',
          timestamp: frame.atMs * 1000,
          data: frame.data,
        }),
      );
    } catch {
      this.needKeyframe();
    }
  }

  private configure(codec: string): void {
    this.closeDecoder();
    const decoder = new VideoDecoder({
      output: (picture) => {
        if (this.decoder !== decoder) {
          picture.close();
          return;
        }
        this.lastFrameAt = performance.now();
        this.shown += 1;
        this.setStatus('live');
        this.handlers.onFrame(picture);
      },
      error: (error) => {
        console.warn(`[headset view] the decoder stopped: ${error.message}`);
        if (this.decoder === decoder) this.decoder = null;
        this.needKeyframe();
      },
    });
    try {
      // No `description`: the frames are Annex B, with the SPS and PPS
      // inline on every keyframe.
      decoder.configure({ codec, optimizeForLatency: true });
    } catch (error) {
      console.warn(`[headset view] cannot decode ${codec}: ${(error as Error).message}`);
      this.setStatus('unsupported');
      return;
    }
    this.decoder = decoder;
    this.codec = codec;
  }

  /** Drop what is queued and start again from the next keyframe. */
  private needKeyframe(): void {
    this.waitingForKey = true;
    if (this.decoder && this.decoder.state === 'configured') {
      // reset() discards queued frames; the decoder is configured again on
      // the next keyframe.
      this.decoder.reset();
      this.codec = null;
    }
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'keyframe' }));
  }

  private closeDecoder(): void {
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close();
    this.decoder = null;
    this.codec = null;
    this.waitingForKey = true;
  }
}
