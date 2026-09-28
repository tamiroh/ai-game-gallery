/** Synthesized city ambience: distant rumble, passing traffic, footsteps, and the odd bird in the park. */
export function createAudio() {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);

  const noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
  const data = noise.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < data.length; i++) {
    brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = brown * 3.5;
  }
  const white = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const whiteData = white.getChannelData(0);
  for (let i = 0; i < whiteData.length; i++) whiteData[i] = Math.random() * 2 - 1;

  const loop = (buffer: AudioBuffer, filterType: BiquadFilterType, frequency: number, q: number, gainValue: number) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    source.connect(filter).connect(gain).connect(master);
    source.start();
    return { filter, gain };
  };
  loop(noise, "lowpass", 320, 0.5, 0.55);
  const hum = loop(noise, "bandpass", 900, 0.6, 0.12);
  const traffic = loop(white, "bandpass", 600, 0.8, 0);
  const engine = loop(noise, "lowpass", 140, 1.2, 0);

  let enabled = false;

  const step = (running: boolean, surface: "stone" | "asphalt" | "grass") => {
    if (!enabled) return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = white;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value =
      (surface === "grass" ? 700 : surface === "asphalt" ? 1300 : 1900) * (0.85 + Math.random() * 0.3);
    filter.Q.value = surface === "grass" ? 0.6 : 1.1;
    const gain = context.createGain();
    const level = (running ? 0.5 : 0.32) * (surface === "grass" ? 0.6 : 1);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (surface === "grass" ? 0.16 : 0.09));
    source.connect(filter).connect(gain).connect(master);
    source.start(now, Math.random() * 0.8, 0.2);

    const thud = context.createOscillator();
    thud.frequency.setValueAtTime(95, now);
    thud.frequency.exponentialRampToValueAtTime(45, now + 0.08);
    const thudGain = context.createGain();
    thudGain.gain.setValueAtTime(level * 0.5, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    thud.connect(thudGain).connect(master);
    thud.start(now);
    thud.stop(now + 0.12);
  };

  const chirp = () => {
    if (!enabled) return;
    const now = context.currentTime;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1600;
    for (let i = 0; i < notes; i++) {
      const t = now + i * (0.09 + Math.random() * 0.05);
      const osc = context.createOscillator();
      osc.frequency.setValueAtTime(base * (1 + Math.random() * 0.3), t);
      osc.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.2), t + 0.07);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.03, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.08);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + 0.1);
    }
  };

  /** `level` 0..1 for passing traffic loudness, `rumble` 0..1 for a nearby heavy vehicle or idling engines. */
  const setTraffic = (level: number, rumble: number, brightness: number) => {
    const now = context.currentTime;
    traffic.gain.gain.setTargetAtTime(level * 0.5, now, 0.15);
    traffic.filter.frequency.setTargetAtTime(420 + brightness * 900, now, 0.2);
    engine.gain.gain.setTargetAtTime(rumble * 0.9, now, 0.2);
    hum.gain.gain.setTargetAtTime(0.1 + level * 0.05, now, 0.5);
  };

  const setEnabled = (value: boolean) => {
    enabled = value;
    if (value) void context.resume();
    master.gain.setTargetAtTime(value ? 0.8 : 0, context.currentTime, 0.2);
  };

  return {
    step,
    chirp,
    setTraffic,
    setEnabled,
    get enabled() {
      return enabled;
    },
    dispose: () => void context.close(),
  };
}

export type CityAudio = ReturnType<typeof createAudio>;
