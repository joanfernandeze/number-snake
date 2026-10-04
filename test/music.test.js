import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bpmFor, stepSeconds, stepsDue, pitchHz, loadMuted, saveMuted } from '../src/music.js';
import { MUSIC } from '../src/constants.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} !== ${b}`);
function fakeStorage(initial) {
  const m = new Map(initial ? [[MUSIC.storageKey, initial]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

test('bpmFor clamps at both ends and is linear between', () => {
  assert.equal(bpmFor(MUSIC.slowMs), MUSIC.bpmMin);
  assert.equal(bpmFor(MUSIC.slowMs * 2), MUSIC.bpmMin, 'slower than slow stays at the minimum');
  assert.equal(bpmFor(MUSIC.fastMs), MUSIC.bpmMax);
  assert.equal(bpmFor(MUSIC.fastMs / 2), MUSIC.bpmMax, 'faster than fast stays at the maximum');
  near(bpmFor((MUSIC.slowMs + MUSIC.fastMs) / 2), (MUSIC.bpmMin + MUSIC.bpmMax) / 2, 'midpoint');
  assert.equal(bpmFor(NaN), MUSIC.bpmMin, 'a missing interval plays slow');
});

test('a step is a sixteenth note', () => {
  near(stepSeconds(120), 0.125, '120 BPM');
  near(stepSeconds(60), 0.25, '60 BPM');
});

test('stepsDue returns exactly the steps that start inside the window, never one twice', () => {
  const a = stepsDue(1.0, 0.125, 1.3);
  assert.deepEqual(a.times, [1.0, 1.125, 1.25]);
  near(a.next, 1.375, 'next step');
  const b = stepsDue(a.next, 0.125, 1.5);
  assert.deepEqual(b.times, [1.375]);
  assert.deepEqual(stepsDue(2.0, 0.125, 2.0).times, [], 'a window that ends where the next step starts is empty');
});

test('pitchHz places the root by voice octave and wraps degrees across octaves', () => {
  const t = { root: 69, scale: [0, 2, 4, 5, 7, 9, 11] }; // A major, A4 = 440 Hz
  near(pitchHz(t, 'arp', 0), 440, 'arp root');
  near(pitchHz(t, 'bass', 0), 220, 'bass an octave below');
  near(pitchHz(t, 'lead', 0), 880, 'lead an octave above');
  near(pitchHz(t, 'arp', 7), 880, 'degree = scale length is the octave');
  near(pitchHz(t, 'arp', -7), 220, 'negative degrees go down');
  near(pitchHz(t, 'arp', 4), 440 * Math.pow(2, 7 / 12), 'the fifth');
});

test('the music preference defaults to on and round-trips', () => {
  assert.equal(loadMuted(fakeStorage()), false);
  assert.equal(loadMuted(fakeStorage('off')), true);
  const s = fakeStorage();
  saveMuted(true, s);
  assert.equal(loadMuted(s), true);
  saveMuted(false, s);
  assert.equal(loadMuted(s), false);
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(loadMuted(broken), false, 'unreadable storage means music on');
});
