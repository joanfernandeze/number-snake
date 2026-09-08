import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRuns, saveRuns, median, summarize } from '../src/telemetry.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

test('loadRuns returns [] on empty or corrupt storage', () => {
  const s = fakeStorage();
  assert.deepEqual(loadRuns(s, 'k'), []);
  s.setItem('k', '{not json');
  assert.deepEqual(loadRuns(s, 'k'), []);
  s.setItem('k', '{"not":"an array"}');
  assert.deepEqual(loadRuns(s, 'k'), []);
});

test('saveRuns keeps only the newest max runs and round-trips', () => {
  const s = fakeStorage();
  const runs = [1, 2, 3, 4].map(i => ({ id: i }));
  const kept = saveRuns(runs, s, 'k', 3);
  assert.deepEqual(kept.map(r => r.id), [2, 3, 4]);
  assert.deepEqual(loadRuns(s, 'k').map(r => r.id), [2, 3, 4]);
});

test('median handles odd and even counts', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test('summarize aggregates the spec section 2 metrics', () => {
  const runs = [
    { session: 'a', firstMergeMs: 4000, durationMs: 30000, bestTile: 16, cause: 'wall' },
    { session: 'a', firstMergeMs: null, durationMs: 5000, bestTile: 2, cause: 'wall' },
    { session: 'b', firstMergeMs: 8000, durationMs: 60000, bestTile: 64, cause: 'self' },
  ];
  const s = summarize(runs);
  assert.equal(s.runs, 3);
  assert.equal(s.runsPerSession, 1.5);
  assert.equal(s.medianFirstMergeMs, 6000);
  assert.equal(s.medianDurationMs, 30000);
  assert.equal(s.bestTile, 64);
  assert.equal(s.medianBestTile, 16);
  assert.deepEqual(s.causes, { wall: 2, self: 1 });
});

test('summarize of no runs is safe', () => {
  const s = summarize([]);
  assert.equal(s.runs, 0);
  assert.equal(s.runsPerSession, 0);
  assert.equal(s.medianFirstMergeMs, null);
  assert.equal(s.medianDurationMs, null);
  assert.equal(s.bestTile, 0);
  assert.equal(s.medianBestTile, null);
  assert.deepEqual(s.causes, {});
});
