import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRun } from '../src/validate.js';

const good = {
  daySince: 3, daysPlayed: 2, firstOfDay: true, mode: 'daily', difficulty: 'classic',
  score: 310, bestTile: 64, bestCombo: 3, durationMs: 54000, eaten: 41, firstMergeMs: 6400, cause: 'self',
};

test('a well-formed record passes and booleans become integers for SQLite', () => {
  const r = validateRun(good);
  assert.ok(r);
  assert.equal(r.firstOfDay, 1);
  assert.equal(r.mode, 'daily');
  assert.equal(r.firstMergeMs, 6400);
  assert.equal(validateRun({ ...good, firstOfDay: false }).firstOfDay, 0);
});

test('firstMergeMs may be null or missing, but never something else', () => {
  assert.equal(validateRun({ ...good, firstMergeMs: null }).firstMergeMs, null);
  const { firstMergeMs, ...noMerge } = good;
  assert.equal(validateRun(noMerge).firstMergeMs, null);
  assert.equal(validateRun({ ...good, firstMergeMs: 'soon' }), null);
});

test('anything off the whitelist is rejected', () => {
  assert.equal(validateRun(null), null);
  assert.equal(validateRun('x'), null);
  assert.equal(validateRun({ ...good, mode: 'cheat' }), null);
  assert.equal(validateRun({ ...good, difficulty: 'nightmare' }), null);
  assert.equal(validateRun({ ...good, cause: 'boredom' }), null);
  assert.equal(validateRun({ ...good, daySince: -1 }), null);
  assert.equal(validateRun({ ...good, daysPlayed: 0 }), null);
  assert.equal(validateRun({ ...good, score: 1.5 }), null);
  assert.equal(validateRun({ ...good, score: '310' }), null);
  assert.equal(validateRun({ ...good, bestTile: 1 }), null);
  assert.equal(validateRun({ ...good, firstOfDay: 'yes' }), null);
});

test('only the whitelisted fields survive, so junk cannot ride along', () => {
  const r = validateRun({ ...good, email: 'a@b.c', ip: '1.2.3.4' });
  assert.ok(!('email' in r) && !('ip' in r));
});
