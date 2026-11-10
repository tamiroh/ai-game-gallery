const STEP_COUNT = 64;
const CHORDS = [
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [48, 52, 55, 59],
  [55, 59, 62, 65],
];
const BASS = [33, 29, 36, 31];
const ARP_PATTERN = [0, 1, 2, 3, 2, 1, 3, 1, 0, 2, 1, 3, 2, 3, 1, 2];
const LEAD = [76, -1, 72, -1, 74, 76, -1, 79, -1, 76, -1, 72, 71, -1, 67, -1];

const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);

export function createAudio() {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let music: GainNode | null = null;
  let musicFilter: BiquadFilterNode | null = null;
  let echo: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let timer = 0;
  let step = 0;
  let nextTime = 0;
  let tempo = 112;
  let energy = 0;
  let muted = false;

  const voice = (
    type: OscillatorType,
    note: number,
    time: number,
    length: number,
    volume: number,
    destination: AudioNode,
    detune = 0,
    attack = 0.005,
  ) => {
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency(note);
    oscillator.detune.value = detune;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    oscillator.connect(gain).connect(destination);
    oscillator.start(time);
    oscillator.stop(time + length + 0.02);
  };

  const hit = (time: number, length: number, volume: number, highpass: number) => {
    if (!context || !noise || !music) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noise;
    filter.type = "highpass";
    filter.frequency.value = highpass;
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    source.connect(filter).connect(gain).connect(music);
    source.start(time);
    source.stop(time + length + 0.02);
  };

  const kick = (time: number) => {
    if (!context || !music) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(150, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.14);
    gain.gain.setValueAtTime(0.75, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    oscillator.connect(gain).connect(music);
    oscillator.start(time);
    oscillator.stop(time + 0.26);
  };

  const schedule = (index: number, time: number, stepLength: number) => {
    if (!context || !musicFilter || !echo) return;
    const bar = Math.floor(index / 16) % 4;
    const beat = index % 16;
    const chord = CHORDS[bar]!;
    const bass = BASS[bar]!;

    if (beat === 0) {
      for (const note of chord) {
        voice("sawtooth", note, time, stepLength * 16, 0.035, musicFilter, -7, 0.4);
        voice("sawtooth", note, time, stepLength * 16, 0.035, musicFilter, 7, 0.4);
      }
    }
    if (beat % 2 === 0) {
      const octave = beat % 8 === 6 ? 12 : 0;
      voice("sawtooth", bass + octave, time, stepLength * 1.8, 0.2, musicFilter);
      voice("sine", bass, time, stepLength * 1.8, 0.22, musicFilter);
    }
    const arp = chord[ARP_PATTERN[beat]!]! + 12;
    voice("triangle", arp, time, stepLength * 1.4, 0.07 + energy * 0.03, echo);

    if (energy > 0.3) {
      const lead = LEAD[beat]!;
      if (lead > 0 && bar % 2 === 1) voice("square", lead + (bar === 3 ? -2 : 0), time, stepLength * 1.9, 0.035, echo);
    }
    if (beat % 4 === 0) kick(time);
    if (beat % 8 === 4) hit(time, 0.16, 0.2, 1400);
    if (beat % 2 === 1 || (energy > 0.6 && beat % 4 === 2)) hit(time, 0.04, 0.07, 7000);
  };

  const pump = () => {
    if (!context) return;
    while (nextTime < context.currentTime + 0.25) {
      const stepLength = 60 / tempo / 4;
      schedule(step, nextTime, stepLength);
      step = (step + 1) % STEP_COUNT;
      nextTime += stepLength;
    }
  };

  const applyVolume = () => {
    if (!context || !master) return;
    master.gain.setTargetAtTime(muted ? 0 : 0.8, context.currentTime, 0.05);
  };

  return {
    start() {
      if (!context) {
        context = new AudioContext();
        master = context.createGain();
        const compressor = context.createDynamicsCompressor();
        master.connect(compressor).connect(context.destination);

        music = context.createGain();
        music.gain.value = 0.5;
        music.connect(master);
        musicFilter = context.createBiquadFilter();
        musicFilter.type = "lowpass";
        musicFilter.frequency.value = 900;
        musicFilter.Q.value = 3;
        musicFilter.connect(music);

        echo = context.createGain();
        const delay = context.createDelay(1);
        const feedback = context.createGain();
        delay.delayTime.value = (60 / tempo) * 0.75;
        feedback.gain.value = 0.38;
        echo.connect(music);
        echo.connect(delay);
        delay.connect(feedback).connect(delay);
        delay.connect(music);

        noise = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

        applyVolume();
        nextTime = context.currentTime + 0.08;
        timer = window.setInterval(pump, 60);
      }
      void context.resume();
    },
    setWave(wave: number, playing: boolean) {
      if (!context || !musicFilter || !music) return;
      energy = playing ? Math.min(1, 0.2 + wave * 0.16) : 0;
      tempo = playing ? Math.min(132, 110 + wave * 2.5) : 104;
      musicFilter.frequency.setTargetAtTime(playing ? 900 + energy * 2600 : 500, context.currentTime, 0.4);
      music.gain.setTargetAtTime(playing ? 0.5 : 0.3, context.currentTime, 0.4);
    },
    thump(strength: number, pitch: number) {
      if (!context || !master) return;
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(pitch, now);
      oscillator.frequency.exponentialRampToValueAtTime(pitch * 0.4, now + 0.18);
      gain.gain.setValueAtTime(Math.min(0.4, 0.08 + strength * 0.02), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      oscillator.connect(gain).connect(master);
      oscillator.start(now);
      oscillator.stop(now + 0.22);
    },
    chime(notes: number[]) {
      if (!context || !master) return;
      notes.forEach((note, index) => {
        voice("triangle", note, context!.currentTime + index * 0.09, 0.5, 0.16, master!);
      });
    },
    toggleMute() {
      muted = !muted;
      applyVolume();
      return muted;
    },
    dispose() {
      window.clearInterval(timer);
      void context?.close();
      context = null;
    },
  };
}
