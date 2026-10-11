// The browser rehearsal's mic tap (web/src/lib/rehearse/mic.ts). Runs on the audio thread: takes the mic's first channel,
// brings it down to 16 kHz if the context runs faster (averaging each block of rate / 16000 samples) and posts Float32 chunks
// of about 50 ms to the page.
const TARGET_RATE = 16000;
const CHUNK = 800;

class MicTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.sum = 0;
    this.count = 0;
    this.pos = 0;
    this.out = new Float32Array(CHUNK);
    this.at = 0;
  }

  emit(value) {
    this.out[this.at++] = value;
    if (this.at === CHUNK) {
      this.port.postMessage(this.out, [this.out.buffer]);
      this.out = new Float32Array(CHUNK);
      this.at = 0;
    }
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    if (this.ratio <= 1) {
      for (let i = 0; i < input.length; i++) this.emit(input[i]);
      return true;
    }
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i];
      this.count++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.emit(this.sum / this.count);
        this.sum = 0;
        this.count = 0;
        this.pos -= this.ratio;
      }
    }
    return true;
  }
}

registerProcessor("mic-tap", MicTap);
