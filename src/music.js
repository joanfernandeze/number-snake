import { MUSIC } from './constants.js';
import { audioContext } from './sound.js';
import { trackFor } from './tracks.js';

// Background music: a look-ahead scheduler on the audio clock plays the run's board track, its tempo
// following the snake's speed (spec 2026-10-03). This file starts with the pure parts, which the
// tests cover (tempo, step timing, pitches, the bass's note length, the saved preference); the live
// scheduler after them (start/stop/pause/resume) uses Web Audio and does nothing where there is none.

export const STEPS = 16; // a bar of sixteenth notes
const OCTAVE = { bass: -12, arp: 0, lead: 12 };

// The loop's smoothed interval between moves (ms) as a tempo: linear between slowMs → bpmMin and
// fastMs → bpmMax, clamped, so the fastest levels speed the music up without making it frantic.
export function bpmFor(intervalMs) {
  if (!Number.isFinite(intervalMs)) return MUSIC.bpmMin;
  const t = (MUSIC.slowMs - intervalMs) / (MUSIC.slowMs - MUSIC.fastMs);
  return MUSIC.bpmMin + (MUSIC.bpmMax - MUSIC.bpmMin) * Math.min(1, Math.max(0, t));
}

export function stepSeconds(bpm) {
  return 60 / bpm / 4;
}

// The start times of every step that begins before `until`, starting at `nextTime`, and the time
// of the first step after them. The scheduler calls it once per wake-up with a window that ends a
// little ahead of the audio clock; carrying `next` over means no step is ever played twice.
export function stepsDue(nextTime, stepSec, until) {
  if (!(stepSec > 0) || !Number.isFinite(until)) return { times: [], next: nextTime };
  const times = [];
  let t = nextTime;
  while (t < until) { times.push(t); t += stepSec; }
  return { times, next: t };
}

// Frequency of a scale degree for a voice: the bass sits an octave below the root, the lead an
// octave above; degrees past the scale wrap into the next octave, negative ones into the one below.
export function pitchHz(track, voice, degree) {
  const n = track.scale.length;
  const octave = Math.floor(degree / n);
  const semis = track.scale[((degree % n) + n) % n] + 12 * octave;
  const midi = track.root + OCTAVE[voice] + semis;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// One scheduler wake-up as pure arithmetic. If the timer fell behind the audio clock, the missed
// steps are skipped (not crammed into the past), keeping the beat on its grid and in phase; then the
// steps that start before now + lookahead are listed with their step indices.
export function planTick(nextTime, step, now, stepSec, lookaheadSec) {
  if (stepSec > 0 && nextTime < now) {
    const missed = Math.ceil((now - nextTime) / stepSec);
    nextTime += missed * stepSec;
    step = (step + missed) % STEPS;
  }
  const { times, next } = stepsDue(nextTime, stepSec, now + lookaheadSec);
  const steps = times.map((_, k) => (step + k) % STEPS);
  return { times, steps, next, step: (step + times.length) % STEPS };
}

// How long a bass note rings, in steps: until the next bass note (wrapping round the bar), at most
// half a bar — so a sparse bass sustains (a held body, see note()) under the bar instead of plucking and leaving silence.
export function bassSteps(pattern, i) {
  for (let k = 1; k <= STEPS; k++) {
    const d = pattern[(i + k) % STEPS];
    if (d !== null && d !== undefined) return Math.min(k, STEPS / 2);
  }
  return STEPS / 2;
}

export function loadMuted(storage = globalThis.localStorage, key = MUSIC.storageKey) {
  try { return storage.getItem(key) === 'off'; } catch { return false; }
}

export function saveMuted(value, storage = globalThis.localStorage, key = MUSIC.storageKey) {
  try { storage.setItem(key, value ? 'off' : 'on'); } catch { /* ignore */ }
  return value;
}

// ---- The live scheduler ---------------------------------------------------------------------

const LENGTH = { arp: 1, lead: 2 };               // note lengths in steps (the bass rings to its next note)
const LEVEL = { bass: 1, arp: 0.45, lead: 0.8 };  // relative loudness inside the music bus

let muted = false;
let track = null;    // the track playing; null when stopped
let bus = null;      // the gain every voice feeds; faded out on stop
let timer = null;
let paused = false;
let step = 0;
let nextTime = 0;
let bpm = MUSIC.bpmMin;
let noise = null;    // a short buffer of white noise for the hat, built once

export function setMuted(value) {
  muted = !!value;
  if (muted) stop();
  return muted;
}
export function isMuted() { return muted; }

export function setTempoFromInterval(intervalMs) {
  bpm = bpmFor(intervalMs);
}

// Start the board's track from its first bar. Returns whether anything is playing.
export function start(boardKey) {
  stop(true);
  if (muted) return false;
  const ac = audioContext();
  if (!ac) return false;
  track = trackFor(boardKey);
  bus = ac.createGain();
  bus.gain.value = MUSIC.gain;
  bus.connect(ac.destination);
  step = 0;
  nextTime = ac.currentTime + 0.05;
  paused = false;
  timer = setInterval(tick, MUSIC.timerMs);
  return true;
}

// Stop the music: a fade over MUSIC.fadeMs (so the death or win sound reads cleanly), or at once.
export function stop(immediate = false) {
  if (timer) { clearInterval(timer); timer = null; }
  paused = false;
  track = null;
  if (!bus) return;
  const b = bus;
  bus = null;
  const ac = audioContext();
  if (immediate || !ac) { try { b.disconnect(); } catch { /* ignore */ } return; }
  try {
    const t0 = ac.currentTime;
    b.gain.setValueAtTime(b.gain.value, t0);
    b.gain.exponentialRampToValueAtTime(0.0001, t0 + MUSIC.fadeMs / 1000);
    setTimeout(() => { try { b.disconnect(); } catch { /* ignore */ } }, MUSIC.fadeMs + 50);
  } catch { try { b.disconnect(); } catch { /* ignore */ } }
}

// The page went into the background: stop scheduling (resume picks up from the next step).
export function pause() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  paused = true;
}

export function resume() {
  if (!paused || !track) return;
  const ac = audioContext();
  if (!ac) return;
  paused = false;
  nextTime = ac.currentTime + 0.05;
  timer = setInterval(tick, MUSIC.timerMs);
}

function tick() {
  const ac = audioContext();
  if (!ac || !track) return;
  const plan = planTick(nextTime, step, ac.currentTime, stepSeconds(bpm), MUSIC.lookaheadMs / 1000);
  plan.times.forEach((t, k) => playStep(ac, plan.steps[k], t));
  nextTime = plan.next;
  step = plan.step;
}

function playStep(ac, i, t) {
  const sec = stepSeconds(bpm);
  for (const voice of ['bass', 'arp', 'lead']) {
    const degree = track[voice][i];
    if (degree === null || degree === undefined) continue;
    const steps = voice === 'bass' ? bassSteps(track.bass, i) : LENGTH[voice];
    note(ac, pitchHz(track, voice, degree), t, steps * sec, steps, track.waves[voice], LEVEL[voice]);
  }
  if (track.hat[i]) hat(ac, t);
}

// One note into the music bus, with the same quick attack and exponential fall as the effects,
// except that a note of three steps or more (in practice the sustained bass) holds a body first.
function note(ac, hz, t, secs, steps, type, level) {
  try {
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, t);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(level, t + 0.01);
    if (steps >= 3) amp.gain.exponentialRampToValueAtTime(level * 0.6, t + secs * 0.7); // a held body
    amp.gain.exponentialRampToValueAtTime(0.0001, t + secs);
    osc.connect(amp);
    amp.connect(bus);
    osc.start(t);
    osc.stop(t + secs + 0.02);
  } catch { /* a browser that dislikes one of these should not break the run */ }
}

// The hat: a few milliseconds of high-passed noise.
function hat(ac, t) {
  try {
    if (!noise) {
      noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.05), ac.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ac.createBufferSource();
    const hp = ac.createBiquadFilter();
    const amp = ac.createGain();
    src.buffer = noise;
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.35, t + 0.002);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(hp);
    hp.connect(amp);
    amp.connect(bus);
    src.start(t);
    src.stop(t + 0.05);
  } catch { /* ignore */ }
}
