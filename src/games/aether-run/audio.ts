/** Quiet synthesized turbine, air and musical cues; no audio downloads. */
export class FlightAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private engine?: OscillatorNode;
  private engineGain?: GainNode;
  private wind?: AudioBufferSourceNode;
  private windGain?: GainNode;
  enabled = true;
  private tailUntil = 0;
  async unlock() {
    if (!this.context) {
      const ctx = new AudioContext();
      this.context = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(ctx.destination);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 390;
      this.engine = ctx.createOscillator();
      this.engine.type = "sawtooth";
      this.engine.frequency.value = 46;
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0.045;
      this.engine.connect(filter).connect(this.engineGain).connect(this.master);
      this.engine.start();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate),
        data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.wind = ctx.createBufferSource();
      this.wind.buffer = buffer;
      this.wind.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 650;
      band.Q.value = 0.55;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      this.wind.connect(band).connect(this.windGain).connect(this.master);
      this.wind.start();
    }
    await this.context.resume().catch(() => {});
  }
  update(active: boolean, speed: number, boost: boolean) {
    if (!this.context || !this.master || !this.engine || !this.windGain) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.enabled && (active || now < this.tailUntil) ? 0.65 : 0, now, 0.12);
    this.engineGain?.gain.setTargetAtTime(active ? 0.045 : 0, now, 0.12);
    this.engine.frequency.setTargetAtTime(38 + speed * 1.7 + (boost ? 12 : 0), now, 0.14);
    this.windGain.gain.setTargetAtTime(active ? 0.018 + speed * 0.0009 + (boost ? 0.02 : 0) : 0, now, 0.1);
  }
  cue(kind: "crystal" | "ring" | "hit" | "jump" | "finish" | "sector" | "repair", combo = 1) {
    if (!this.enabled || !this.context || !this.master) return;
    const ctx = this.context;
    this.tailUntil = ctx.currentTime + (kind === "finish" ? 1 : 0.4);
    const notes: Record<typeof kind, number[]> = {
      crystal: [660 + Math.min(combo, 12) * 35],
      ring: [523, 659, 784],
      hit: [90, 53],
      jump: [220, 440],
      finish: [523, 659, 784, 1047],
      sector: [392, 523, 659],
      repair: [440, 554, 880],
    };
    notes[kind].forEach((frequency, i) => {
      const osc = ctx.createOscillator(),
        gain = ctx.createGain(),
        t = ctx.currentTime + i * 0.075;
      osc.type = kind === "hit" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(frequency, t);
      if (kind === "jump") osc.frequency.exponentialRampToValueAtTime(frequency * 2, t + 0.2);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(kind === "hit" ? 0.17 : 0.09, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.4);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  }
  dispose() {
    this.engine?.stop();
    this.wind?.stop();
    void this.context?.close();
  }
}
