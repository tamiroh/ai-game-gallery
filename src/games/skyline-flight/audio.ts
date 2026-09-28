/** Synthesized engine, wind and cues. Nothing is loaded from files. */
export function createAudio() {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);

  const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const channel = noise.getChannelData(0);
  for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
  const noiseSource = () => {
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    return source;
  };

  // Turbine: two detuned saws through a lowpass, plus a whine.
  const engineFilter = context.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 500;
  const engineGain = context.createGain();
  engineGain.gain.value = 0.05;
  engineFilter.connect(engineGain).connect(master);
  const saws = [0, 7].map((detune) => {
    const osc = context.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 62;
    osc.detune.value = detune;
    osc.connect(engineFilter);
    osc.start();
    return osc;
  });
  const whine = context.createOscillator();
  whine.type = "sine";
  whine.frequency.value = 1400;
  const whineGain = context.createGain();
  whineGain.gain.value = 0.006;
  whine.connect(whineGain).connect(master);
  whine.start();

  // Rushing air, louder with speed and when skimming buildings.
  const wind = noiseSource();
  const windFilter = context.createBiquadFilter();
  windFilter.type = "bandpass";
  windFilter.frequency.value = 700;
  windFilter.Q.value = 0.6;
  const windGain = context.createGain();
  windGain.gain.value = 0.05;
  wind.connect(windFilter).connect(windGain).connect(master);
  wind.start();

  const tone = (frequency: number, start: number, duration: number, level: number, type: OscillatorType = "sine") => {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  };

  const burst = (from: number, to: number, duration: number, level: number, q = 1.2) => {
    const source = noiseSource();
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = q;
    const now = context.currentTime;
    filter.frequency.setValueAtTime(from, now);
    filter.frequency.exponentialRampToValueAtTime(to, now + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + duration * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(now, Math.random());
    source.stop(now + duration + 0.05);
  };

  let enabled = true;
  let active = false;
  const applyVolume = () => {
    const target = enabled && active ? 0.9 : 0;
    master.gain.setTargetAtTime(target, context.currentTime, 0.08);
  };

  return {
    resume() {
      void context.resume();
    },
    setEnabled(value: boolean) {
      enabled = value;
      applyVolume();
    },
    /** Engine and wind follow the plane; `active` mutes them outside of flight. */
    setFlight(isActive: boolean, speed01: number, boost: number, proximity: number) {
      if (active !== isActive) {
        active = isActive;
        applyVolume();
      }
      const now = context.currentTime;
      for (const saw of saws) saw.frequency.setTargetAtTime(55 + speed01 * 40 + boost * 20, now, 0.1);
      engineFilter.frequency.setTargetAtTime(380 + speed01 * 500 + boost * 700, now, 0.1);
      engineGain.gain.setTargetAtTime(0.04 + boost * 0.03, now, 0.1);
      whine.frequency.setTargetAtTime(1200 + speed01 * 700 + boost * 500, now, 0.15);
      windFilter.frequency.setTargetAtTime(500 + speed01 * 900 + proximity * 1400, now, 0.08);
      windGain.gain.setTargetAtTime(0.03 + speed01 * 0.06 + proximity * 0.22, now, 0.06);
    },
    gate(finish = false) {
      const now = context.currentTime;
      const notes = finish ? [784, 988, 1175, 1568] : [1175, 1568];
      notes.forEach((note, i) => tone(note, now + i * 0.07, finish ? 0.9 : 0.35, 0.12));
    },
    miss() {
      tone(220, context.currentTime, 0.3, 0.1, "triangle");
    },
    closeCall() {
      burst(2400, 400, 0.5, 0.35, 0.9);
    },
    beep(high = false) {
      tone(high ? 1320 : 660, context.currentTime, high ? 0.5 : 0.2, 0.14, "square");
    },
    warning() {
      tone(880, context.currentTime, 0.12, 0.08, "square");
    },
    crash() {
      burst(900, 60, 1.6, 0.9, 0.5);
      tone(70, context.currentTime, 1.2, 0.35, "sawtooth");
    },
    dispose() {
      void context.close();
    },
  };
}

export type FlightAudio = ReturnType<typeof createAudio>;
