import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, trackFor } from '../src/tracks.js';
import { BOARDS } from '../src/boards.js';

const VOICES = ['bass', 'arp', 'lead'];

test('every board has its own track, and an unknown board falls back to the open one', () => {
  for (const key of Object.keys(BOARDS)) assert.ok(TRACKS[key], `${key} has a track`);
  assert.equal(Object.keys(TRACKS).length, Object.keys(BOARDS).length, 'no track without a board');
  assert.equal(trackFor('nope'), TRACKS.open);
  assert.equal(trackFor('vault'), TRACKS.vault);
});

test('every track is well formed', () => {
  for (const [key, t] of Object.entries(TRACKS)) {
    assert.ok(Number.isInteger(t.root) && t.root >= 48 && t.root <= 72, `${key} root`);
    assert.equal(t.scale[0], 0, `${key} scale starts at the root`);
    for (let i = 1; i < t.scale.length; i++) assert.ok(t.scale[i] > t.scale[i - 1] && t.scale[i] <= 11, `${key} scale ascends within an octave`);
    for (const v of VOICES) {
      assert.ok(['sine', 'triangle', 'square', 'sawtooth'].includes(t.waves[v]), `${key} ${v} wave`);
      assert.equal(t[v].length, 16, `${key} ${v} has 16 steps`);
      for (const d of t[v]) assert.ok(d === null || Number.isInteger(d), `${key} ${v} step is a degree or a rest`);
    }
    assert.equal(t.hat.length, 16, `${key} hat has 16 steps`);
    for (const h of t.hat) assert.ok(h === 0 || h === 1, `${key} hat step is 0 or 1`);
  }
});

test('the tracks sound different from each other', () => {
  const sigs = Object.values(TRACKS).map(t => JSON.stringify([t.root, t.scale, t.bass, t.lead]));
  assert.equal(new Set(sigs).size, sigs.length);
});
