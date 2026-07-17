/**
 * Procedural WebAudio SFX — tiny synth recipes (oscillator + noise +
 * envelope), no audio assets, matching the game's everything-is-procedural
 * approach. The AudioContext is created lazily on the first play() after a
 * user gesture (mobile autoplay policy; every play in this game follows a
 * tap). Master volume kept low — these are feedback ticks, not music.
 */

type SfxName =
  | 'cast'
  | 'hit'
  | 'kill'
  | 'hurt'
  | 'pickup'
  | 'lore'
  | 'upgrade'
  | 'death'
  | 'victory'
  | 'bossHit';

const MUTE_KEY = 'wick.muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch {
  // storage unavailable — default unmuted
}

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    // non-persistent mute is still mute
  }
}

/** One tone with a linear-decay envelope; freqEnd sweeps pitch over the duration. */
function tone(type: OscillatorType, freq: number, freqEnd: number, duration: number, volume: number, delay = 0): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + duration);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.linearRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.01);
}

/** White-noise burst through a lowpass, for impacts/rubble. */
function noise(duration: number, volume: number, lowpassHz: number, delay = 0): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpassHz;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.linearRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t0);
}

export function play(name: SfxName): void {
  if (muted) return;
  if (!ensureCtx()) return;
  switch (name) {
    case 'cast':
      tone('square', 620, 280, 0.06, 0.5);
      break;
    case 'hit':
      noise(0.05, 0.5, 2200);
      tone('triangle', 210, 140, 0.05, 0.45);
      break;
    case 'bossHit':
      noise(0.07, 0.6, 1400);
      tone('triangle', 150, 90, 0.08, 0.6);
      break;
    case 'kill':
      tone('sawtooth', 420, 70, 0.16, 0.55);
      noise(0.12, 0.4, 1600, 0.02);
      break;
    case 'hurt':
      noise(0.12, 0.65, 900);
      tone('sawtooth', 160, 60, 0.14, 0.5);
      break;
    case 'pickup':
      tone('sine', 880, 1320, 0.07, 0.4);
      break;
    case 'lore':
      tone('sine', 520, 660, 0.12, 0.35);
      tone('sine', 660, 880, 0.14, 0.3, 0.1);
      break;
    case 'upgrade':
      tone('square', 440, 440, 0.08, 0.35);
      tone('square', 554, 554, 0.08, 0.35, 0.09);
      tone('square', 660, 660, 0.12, 0.35, 0.18);
      break;
    case 'death':
      tone('sawtooth', 280, 40, 0.8, 0.5);
      noise(0.5, 0.35, 700, 0.1);
      break;
    case 'victory':
      tone('square', 523, 523, 0.1, 0.4);
      tone('square', 659, 659, 0.1, 0.4, 0.11);
      tone('square', 784, 784, 0.1, 0.4, 0.22);
      tone('square', 1046, 1046, 0.22, 0.45, 0.33);
      break;
  }
}
