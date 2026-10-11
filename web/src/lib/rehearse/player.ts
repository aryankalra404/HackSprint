"use client";

import type { Clip } from "./turn-taker";

// The panel's voices in the browser: fetched from the laptop (/api/audio/<id>.wav never changes, so each is fetched once),
// decoded, and played through an AnalyserNode whose level drives the speaker's ring on the table.

export interface Voice extends Clip {
  buffer: AudioBuffer;
}

export class Player {
  private readonly cache = new Map<string, Promise<Voice | null>>();
  private readonly analyser: AnalyserNode;
  private readonly samples: Float32Array<ArrayBuffer>;

  constructor(readonly context: AudioContext) {
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.samples = new Float32Array(this.analyser.fftSize);
    this.analyser.connect(context.destination);
  }

  load(url: string): Promise<Voice | null> {
    let voice = this.cache.get(url);
    if (!voice) {
      voice = (async () => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const buffer = await this.context.decodeAudioData(await res.arrayBuffer());
          return { buffer, duration: buffer.duration };
        } catch {
          return null;
        }
      })();
      this.cache.set(url, voice);
      // A failed fetch can be tried again later
      voice.then((v) => v ?? this.cache.delete(url));
    }
    return voice;
  }

  play(voice: Voice, onEnd: () => void): () => void {
    const source = this.context.createBufferSource();
    source.buffer = voice.buffer;
    source.connect(this.analyser);
    let stopped = false;
    source.onended = () => {
      if (!stopped) onEnd();
    };
    void this.context.resume();
    source.start();
    return () => {
      stopped = true;
      try {
        source.stop();
      } catch {
        // Already ended
      }
      source.disconnect();
    };
  }

  // The voice's loudness right now, 0 to about 1
  level(): number {
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const s of this.samples) sum += s * s;
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 4);
  }

  close(): void {
    this.analyser.disconnect();
    void this.context.close();
  }
}
