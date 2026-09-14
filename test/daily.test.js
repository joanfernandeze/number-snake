import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, daysBetween, shiftKey, dailyNumber, seedFor, loadDaily, saveDaily, streak, recordDaily } from '../src/daily.js';
import { DAILY } from '../src/constants.js';

function fakeStorage(initial) {
  const m = new Map(initial ? [[DAILY.storageKey, initial]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

test('dayKey is the local calendar day, zero-padded', () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(dayKey(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
});

test('daysBetween and shiftKey agree across month, year and DST boundaries', () => {
  assert.equal(daysBetween('2026-01-31', '2026-02-01'), 1);
  assert.equal(daysBetween('2025-12-31', '2026-01-01'), 1);
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2, 'the European DST switch is still two days');
  assert.equal(daysBetween('2026-09-14', '2026-09-14'), 0);
  assert.equal(shiftKey('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftKey('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftKey('2026-09-14', -7), '2026-09-07');
});

test('dailyNumber counts from the epoch, which is Daily #1', () => {
  assert.equal(dailyNumber(DAILY.epoch), 1);
  assert.equal(dailyNumber(shiftKey(DAILY.epoch, 41)), 42);
});

test('seedFor is stable for a day and different between days', () => {
  assert.equal(seedFor('2026-09-14'), seedFor('2026-09-14'));
  assert.notEqual(seedFor('2026-09-14'), seedFor('2026-09-15'));
  assert.ok(Number.isInteger(seedFor('2026-09-14')) && seedFor('2026-09-14') >= 0, 'an unsigned 32-bit seed');
  assert.equal(seedFor('2026-09-14'), 2429564653, 'fixed FNV-1a 32-bit vector');
});

test('loadDaily survives missing and corrupt storage and round-trips', () => {
  assert.deepEqual(loadDaily(fakeStorage()), { results: {}, bestStreak: 0 });
  assert.deepEqual(loadDaily(fakeStorage('{nope')), { results: {}, bestStreak: 0 });
  assert.deepEqual(loadDaily(fakeStorage('[]')), { results: {}, bestStreak: 0 });
  assert.deepEqual(
    loadDaily(fakeStorage('{"results":[],"bestStreak":5}')),
    { results: {}, bestStreak: 0 },
    'array-shaped results is rejected, and bestStreak is not salvaged from a rejected record'
  );
  const s = fakeStorage();
  saveDaily({ results: { '2026-09-14': { bestTile: 64, score: 300, durationMs: 40000 } }, bestStreak: 1 }, s);
  assert.equal(loadDaily(s).results['2026-09-14'].bestTile, 64);
  assert.equal(loadDaily(s).bestStreak, 1);
});

test('streak counts consecutive days and forgives an unplayed today, but not a missed yesterday', () => {
  const r = { '2026-09-12': {}, '2026-09-13': {}, '2026-09-14': {} };
  assert.equal(streak(r, '2026-09-14'), 3, 'played today: today counts');
  assert.equal(streak(r, '2026-09-15'), 3, 'today still open: the streak from yesterday is alive');
  assert.equal(streak(r, '2026-09-16'), 0, 'skipped a whole day: gone');
  assert.equal(streak({ '2026-09-10': {} }, '2026-09-14'), 0);
  assert.equal(streak({}, '2026-09-14'), 0);
  assert.equal(
    streak({ '2026-09-13': false, '2026-09-14': {} }, '2026-09-14'),
    2,
    'a present-but-falsy result still counts as played'
  );
});

test('recordDaily keeps the first attempt only and tracks the best streak', () => {
  const state = { results: { '2026-09-13': { bestTile: 32 } }, bestStreak: 1 };
  assert.equal(recordDaily(state, '2026-09-14', { bestTile: 128 }), true);
  assert.equal(state.results['2026-09-14'].bestTile, 128);
  assert.equal(state.bestStreak, 2);
  assert.equal(recordDaily(state, '2026-09-14', { bestTile: 999 }), false, 'a second attempt does not count');
  assert.equal(state.results['2026-09-14'].bestTile, 128, 'and does not overwrite');

  const falsyState = { results: { '2026-09-13': 0 }, bestStreak: 0 };
  assert.equal(
    recordDaily(falsyState, '2026-09-13', { bestTile: 5, score: 1, durationMs: 1 }),
    false,
    'a present-but-falsy entry is still a recorded result'
  );
  assert.equal(falsyState.results['2026-09-13'], 0, 'and is not overwritten');
});
