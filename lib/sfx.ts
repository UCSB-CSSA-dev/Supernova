// Stage sounds synthesized with Web Audio, so there are no audio files to ship.
// Phones only allow sound from a context created during a tap, so call createSfx from a click handler.
export type Sfx = {
  now: () => number;
  snare: (time: number, gain: number) => void;
  thump: () => void;
  crash: () => void;
  fall: () => void;
  off: (time: number) => void;
  setMuted: (muted: boolean) => void;
  close: () => void;
};

const VOLUME = 0.7;

export function createSfx(): Sfx | null {
  const AudioCtor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  let ctx: AudioContext;
  try {
    ctx = new AudioCtor();
  } catch {
    return null;
  }
  void ctx.resume().catch(() => undefined);

  const master = ctx.createGain();
  master.gain.value = VOLUME;
  master.connect(ctx.destination);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;

  function noiseHit(time: number, duration: number, gain: number, type: BiquadFilterType, frequency: number) {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, time);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    source.connect(filter).connect(envelope).connect(master);
    source.start(time);
    source.stop(time + duration + 0.02);
  }

  function tone(time: number, type: OscillatorType, from: number, to: number, duration: number, gain: number) {
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, time);
    oscillator.frequency.exponentialRampToValueAtTime(to, time + duration);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, time);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(envelope).connect(master);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  return {
    now: () => ctx.currentTime,
    snare: (time, gain) => noiseHit(time, 0.08, gain, "highpass", 1500),
    thump: () => tone(ctx.currentTime, "sine", 110, 40, 0.28, 0.9),
    crash: () => {
      const time = ctx.currentTime;
      noiseHit(time, 2.2, 0.5, "highpass", 4000);
      tone(time, "sine", 70, 35, 0.5, 1);
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency) => tone(time, "triangle", frequency, frequency, 1.8, 0.12));
    },
    fall: () => {
      const time = ctx.currentTime;
      tone(time, "triangle", 330, 110, 1.6, 0.25);
      tone(time + 0.05, "triangle", 262, 87, 1.6, 0.18);
    },
    off: (time) => {
      noiseHit(time, 0.05, 0.4, "lowpass", 900);
      tone(time, "square", 140, 60, 0.12, 0.15);
    },
    setMuted: (muted) => master.gain.setTargetAtTime(muted ? 0 : VOLUME, ctx.currentTime, 0.02),
    close: () => void ctx.close().catch(() => undefined),
  };
}
