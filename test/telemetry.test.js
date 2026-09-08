import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRuns, saveRuns, median, buildRun, summarize, formatStats } from '../src/telemetry.js';

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
  assert.equal(median([]), null);
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
  assert.equal(s.neverMerged, 1);
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
  assert.equal(s.neverMerged, 0);
});

test('summarize ignores fields missing from records written by older builds', () => {
  const runs = [
    { session: 'a', firstMergeMs: 3000, durationMs: 20000, bestTile: 32, cause: 'self' },
    { session: 'a' }, // legacy record with no metrics at all
    { session: 'b', firstMergeMs: 'oops', durationMs: NaN, bestTile: 8, cause: 'wall' },
  ];
  const s = summarize(runs);
  assert.equal(s.runs, 3);
  assert.equal(s.medianFirstMergeMs, 3000);
  assert.equal(s.medianDurationMs, 20000);
  assert.equal(s.bestTile, 32);
  assert.equal(s.medianBestTile, 20); // median of [8, 32]
  assert.deepEqual(s.causes, { self: 1, wall: 1 });
  assert.equal(s.neverMerged, 1);
});

test('buildRun assembles the record from the live run, game and fatal event', () => {
  const run = { session: 's1', t0: 1000, firstMergeMs: 2500 };
  const game = { ticks: 42, score: 96, bestTile: 32, bestCombo: 2 };
  const ev = { over: true, cause: { type: 'self', cell: { x: 1, y: 1 } } };
  const rec = buildRun(run, game, ev, 31000, 1700000000000);
  assert.deepEqual(rec, {
    session: 's1', firstMergeMs: 2500, durationMs: 30000, ticks: 42, score: 96,
    bestTile: 32, bestCombo: 2, cause: 'self', endedAt: 1700000000000,
  });
});

test('saveRuns swallows a storage write failure and still returns the kept runs', () => {
  const s = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.deepEqual(saveRuns([{ id: 1 }], s, 'k', 3), [{ id: 1 }]);
});

test('formatStats renders the summary as readable lines', () => {
  const text = formatStats({
    runs: 7, runsPerSession: 1.75, neverMerged: 2,
    medianFirstMergeMs: 6400, medianDurationMs: 41000,
    bestTile: 128, medianBestTile: 32, causes: { self: 5, wall: 2 },
  });
  assert.equal(text.split('\n')[0], 'Number Snake stats');
  assert.ok(text.includes('runs: 7 (1.75 per session, 2 never merged)'), text);
  assert.ok(text.includes('first merge: median 6.4 s'), text);
  assert.ok(text.includes('run length: median 41.0 s'), text);
  assert.ok(text.includes('best tile: 128 (median 32)'), text);
  assert.ok(text.includes('deaths: self 5 · wall 2'), text);
});

test('formatStats shows dashes when there is nothing to report', () => {
  const text = formatStats(summarize([]));
  assert.ok(text.includes('runs: 0 (0 per session, 0 never merged)'), text);
  assert.ok(text.includes('first merge: median –'), text);
  assert.ok(text.includes('run length: median –'), text);
  assert.ok(text.includes('best tile: 0 (median –)'), text);
  assert.ok(text.includes('deaths: –'), text);
});
