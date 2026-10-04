import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bpmFor, stepSeconds, stepsDue, pitchHz, bassSteps, planTick, loadMuted, saveMuted,
  start, stop, pause, resume, setTempoFromInterval, setMuted, isMuted,
} from '../src/music.js';
import { TRACKS } from '../src/tracks.js';
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
  assert.deepEqual(stepsDue(1, 0, 2), { times: [], next: 1 }, 'a zero step never hangs');
  assert.deepEqual(stepsDue(1, -0.1, 2), { times: [], next: 1 }, 'a negative step never hangs');
  assert.deepEqual(stepsDue(1, 0.1, Infinity), { times: [], next: 1 }, 'an infinite window never hangs');
});

test('pitchHz places the root by voice octave and wraps degrees across octaves', () => {
  const t = { root: 69, scale: [0, 2, 4, 5, 7, 9, 11] }; // A major, A4 = 440 Hz
  near(pitchHz(t, 'arp', 0), 440, 'arp root');
  near(pitchHz(t, 'bass', 0), 220, 'bass an octave below');
  near(pitchHz(t, 'lead', 0), 880, 'lead an octave above');
  near(pitchHz(t, 'arp', 7), 880, 'degree = scale length is the octave');
  near(pitchHz(t, 'arp', -7), 220, 'negative degrees go down');
  near(pitchHz(t, 'arp', 4), 440 * Math.pow(2, 7 / 12), 'the fifth');
  near(pitchHz(t, 'arp', 8), 440 * 2 ** (14 / 12), 'degree 8 is B5');
  near(pitchHz(t, 'arp', -1), 440 * 2 ** (-1 / 12), 'degree -1 is G#4');
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

test('bassSteps sustains a bass note until the next one, at most half a bar', () => {
  const nulls = (n) => Array(n).fill(null);
  const two = [0, ...nulls(7), 4, ...nulls(7)];
  assert.equal(bassSteps(two, 0), 8);
  assert.equal(bassSteps(two, 8), 8);
  assert.equal(bassSteps(Array(16).fill(0), 3), 1);
  assert.equal(bassSteps([0, ...nulls(15)], 0), 8);
  assert.equal(bassSteps(TRACKS.lanes.bass, 1), 2);
});

test('the live part is a safe no-op where there is no Web Audio', () => {
  try {
    assert.equal(start('vault'), false, 'nothing to play on');
    assert.doesNotThrow(() => { setTempoFromInterval(200); pause(); resume(); stop(); stop(true); });
    assert.equal(setMuted(true), true);
    assert.equal(isMuted(), true);
    assert.equal(start('open'), false, 'muted music never starts');
  } finally {
    setMuted(false);
  }
});

test('planTick lists due steps, and skips missed ones so nothing is scheduled in the past', () => {
  const sec = 0.125;
  const normal = planTick(1.0, 3, 0.95, sec, 0.2);
  assert.deepEqual(normal.times, [1.0, 1.125]);
  assert.deepEqual(normal.steps, [3, 4]);
  near(normal.next, 1.25, 'next');
  assert.equal(normal.step, 5);

  const late = planTick(1.0, 3, 1.05, sec, 0.2); // 50 ms behind: skip step 3, resume on the grid
  near(late.times[0], 1.125, 'first on-grid step after now');
  assert.equal(late.steps[0], 4);
  assert.ok(late.times.every((t) => t >= 1.05));

  const far = planTick(1.0, 3, 3.0, sec, 0.2); // 2 s behind
  assert.equal(far.steps[0], (3 + 16) % 16, 'phase kept: 16 missed steps');
  near(far.times[0], 3.0, 'on the grid');
  assert.ok(far.times.every((t) => t >= 3.0));
  assert.equal(far.steps.length, far.times.length);
});

test('every track pitch is finite and in a playable range', () => {
  for (const [name, tr] of Object.entries(TRACKS)) {
    for (const voice of ['bass', 'arp', 'lead']) {
      tr[voice].forEach((d, i) => {
        if (d === null || d === undefined) return;
        const hz = pitchHz(tr, voice, d);
        assert.ok(Number.isFinite(hz) && hz >= 60 && hz <= 2000, `${name}.${voice}[${i}] = ${hz}`);
      });
    }
  }
});
