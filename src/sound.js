import { SOUND } from './constants.js';

// Every sound is synthesised with an oscillator, so there is nothing to download. The audio
// context is created on first use, because a browser refuses to start one before the player
// has touched the page, and the module still imports where there is no Web Audio at all
// (Node, for the tests) — every play function simply does nothing there.

// A cascade climbs: each merge in the chain sounds a step above the one before it, so a big
// chain is audibly bigger rather than just longer.
export function mergeHz(index) {
  return SOUND.mergeBaseHz * Math.pow(SOUND.mergeStep, Math.max(0, index));
}

export function loadMuted(storage = globalThis.localStorage, key = SOUND.storageKey) {
  try { return storage.getItem(key) === 'off'; } catch { return false; }
}

export function saveMuted(muted, storage = globalThis.localStorage, key = SOUND.storageKey) {
  try { storage.setItem(key, muted ? 'off' : 'on'); } catch { /* ignore */ }
  return muted;
}

let ctx = null;
let muted = false;

export function setMuted(value) { muted = !!value; return muted; }
export function isMuted() { return muted; }

// The one audio context the game uses, created on first use and resumed if the browser suspended
// it. Shared with the music, which has its own on/off and must not depend on the effects' mute.
export function audioContext() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  if (ctx.state === 'suspended') { try { ctx.resume().catch(() => {}); } catch { /* ignore */ } }
  return ctx;
}

function audio() {
  return muted ? null : audioContext();
}

// One short note, shaped by a quick attack and an exponential fall so nothing clicks.
function tone(hz, ms, { type = 'sine', gain = SOUND.gain, slideTo = null, delay = 0 } = {}) {
  const ac = audio();
  if (!ac) return;
  try {
    const t0 = ac.currentTime + delay;
    const secs = ms / 1000;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + secs);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + secs);
    osc.connect(amp);
    amp.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + secs + 0.02);
  } catch { /* a browser that dislikes one of these should not break the run */ }
}

// Eating without a merge: a small, unremarkable blip. It happens constantly, so it stays quiet.
export function playEat() {
  tone(SOUND.eatHz, 70, { type: 'triangle', gain: SOUND.gain * 0.6 });
}

// The gates swapping: two quick clicks, high then lower, like a latch — distinct from the eat blip
// it follows, so the ear learns that this bite moved the doors.
// Quieter than it looks: a 520 Hz square sits in the ear's most sensitive range and would read louder than the triangle eat blip.
export function playGateSwap() {
  tone(SOUND.gateHz, 60, { type: 'square', gain: SOUND.gain * 0.35 });
  tone(SOUND.gateHz * 0.75, 60, { type: 'square', gain: SOUND.gain * 0.35, delay: 0.07 });
}

// One note per merge, climbing and slightly staggered, so the ear hears the length of the chain.
export function playMerge(merges) {
  for (let i = 0; i < Math.min(merges, 6); i++) {
    tone(mergeHz(i), 140, { type: 'sine', delay: i * 0.06 });
  }
}

// An obstacle landing: a low thud that falls away, the opposite shape to a merge.
export function playObstacle() {
  tone(SOUND.obstacleHz, 220, { type: 'square', gain: SOUND.gain * 0.7, slideTo: SOUND.obstacleHz * 0.6 });
}

// Death: everything slides down.
export function playDeath() {
  tone(SOUND.deathHz, 520, { type: 'sawtooth', gain: SOUND.gain, slideTo: SOUND.deathHz * 0.25 });
}

// Victory: four notes climbing a major chord, the opposite shape to the death slide. Triangle
// waves so it reads as a chime, not an alarm.
export function playWin() {
  [1, 1.25, 1.5, 2].forEach((ratio, i) => {
    tone(SOUND.winHz * ratio, 260, { type: 'triangle', gain: SOUND.gain * 0.9, delay: i * 0.11 });
  });
}
