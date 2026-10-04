import { MUSIC } from './constants.js';

// Background music: a look-ahead scheduler on the audio clock plays the run's board track, its tempo
// following the snake's speed (spec 2026-10-03). This file starts with the pure parts, which the
// tests cover; the live scheduler below them uses Web Audio and does nothing where there is none.

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

export function loadMuted(storage = globalThis.localStorage, key = MUSIC.storageKey) {
  try { return storage.getItem(key) === 'off'; } catch { return false; }
}

export function saveMuted(value, storage = globalThis.localStorage, key = MUSIC.storageKey) {
  try { storage.setItem(key, value ? 'off' : 'on'); } catch { /* ignore */ }
  return value;
}
