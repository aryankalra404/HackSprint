"use client";

import { SAMPLE_RATE } from "./wav";

// The presenter's mic for the browser rehearsal: echo cancellation on (the panel's voices play from the same page), captured by an
// AudioWorklet at 16 kHz mono. Chrome runs a 16 kHz AudioContext; elsewhere the worklet averages down from the device's rate.

const WORKLET_URL = "/rehearse/mic-worklet.js";

export interface Mic {
  context: AudioContext;
  stop(): void;
}

// A context for the mic: 16 kHz if the browser allows it. Create it in a click: browsers block audio until one.
export function micContext(): AudioContext {
  try {
    return new AudioContext({ sampleRate: SAMPLE_RATE });
  } catch {
    return new AudioContext();
  }
}

// Asks for the mic (the browser's permission prompt) and starts posting 16 kHz chunks to onSamples. Throws if it's refused.
export async function openMic(context: AudioContext, onSamples: (samples: Float32Array) => void): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  try {
    await context.audioWorklet.addModule(WORKLET_URL);
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const tap = new AudioWorkletNode(context, "mic-tap", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    tap.port.onmessage = (e: MessageEvent<Float32Array>) => onSamples(e.data);
    // Pulled through a silent gain so the worklet runs in every browser
    const silent = context.createGain();
    silent.gain.value = 0;
    source.connect(tap).connect(silent).connect(context.destination);
    return {
      context,
      stop() {
        tap.port.onmessage = null;
        source.disconnect();
        tap.disconnect();
        stream.getTracks().forEach((t) => t.stop());
      },
    };
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw err;
  }
}
