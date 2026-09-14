import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDevice, deviceFacts, sendRun, runFacts } from '../src/analytics.js';
import { ANALYTICS } from '../src/constants.js';
import { daysBetween, shiftKey } from '../src/daily.js';
import { buildRun } from '../src/telemetry.js';
import { validateRun } from '../analytics/src/validate.js';

function fakeStorage(initial) {
  const m = new Map(initial ? [[ANALYTICS.storageKey, initial]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), dump: () => m.get(ANALYTICS.storageKey) };
}

test('a brand-new device is on day zero, its first day, first run of the day', () => {
  const s = fakeStorage();
  assert.deepEqual(deviceFacts('2026-09-14', s), { daySince: 0, daysPlayed: 1, firstOfDay: true });
  assert.deepEqual(deviceFacts('2026-09-14', s), { daySince: 0, daysPlayed: 1, firstOfDay: false }, 'second run, same day');
});

test('coming back the next day is day one and a second distinct day', () => {
  const s = fakeStorage();
  deviceFacts('2026-09-14', s);
  assert.deepEqual(deviceFacts('2026-09-15', s), { daySince: 1, daysPlayed: 2, firstOfDay: true });
  assert.deepEqual(deviceFacts('2026-09-21', s), { daySince: 7, daysPlayed: 3, firstOfDay: true }, 'a week later, having skipped days');
});

test('corrupt or foreign storage is treated as a new device, and nothing identifying is kept', () => {
  assert.equal(loadDevice(fakeStorage('{nope')), null);
  assert.equal(loadDevice(fakeStorage('{"id":"abc"}')), null);
  const s = fakeStorage();
  deviceFacts('2026-09-14', s);
  const kept = JSON.parse(s.dump());
  assert.deepEqual(Object.keys(kept).sort(), ['days', 'firstDay'], 'only dates, no identifier');
});

test('foreign keys are stripped from a valid record and never written back', () => {
  const s = fakeStorage('{"firstDay":"2026-09-14","days":["2026-09-14"],"id":"tracking-id"}');
  assert.deepEqual(loadDevice(s), { firstDay: '2026-09-14', days: ['2026-09-14'] });
  deviceFacts('2026-09-15', s);
  const kept = JSON.parse(s.dump());
  assert.deepEqual(Object.keys(kept).sort(), ['days', 'firstDay'], 'the foreign id must not survive a rewrite');
});

test('the day list saturates at the cap', () => {
  const days = [];
  let k = '2020-01-01';
  while (days.length < ANALYTICS.maxDays) {
    days.push(k);
    k = shiftKey(k, 1);
  }
  const s = fakeStorage(JSON.stringify({ firstDay: '2020-01-01', days }));
  const facts = deviceFacts('2026-09-14', s);
  assert.equal(facts.daysPlayed, ANALYTICS.maxDays);
  assert.equal(facts.firstOfDay, true);
  assert.equal(facts.daySince, daysBetween('2020-01-01', '2026-09-14'));
  const kept = JSON.parse(s.dump());
  assert.equal(kept.days.length, ANALYTICS.maxDays);
  assert.equal(kept.days[ANALYTICS.maxDays - 1], '2026-09-14');
  assert.equal(kept.firstDay, '2020-01-01');
});

test('sendRun is off without an endpoint and posts a beacon with one', () => {
  assert.equal(sendRun({ score: 1 }, ''), false);
  const seen = [];
  // node 24's globalThis.navigator is a getter-only accessor; redefine it to stub sendBeacon.
  const prevDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { sendBeacon: (url, blob) => { seen.push({ url, type: blob.type }); return true; } },
    configurable: true,
    writable: true,
  });
  try {
    assert.equal(sendRun({ score: 1 }, 'https://example.test/run'), true);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'https://example.test/run');
    assert.equal(seen[0].type, 'application/json');
  } finally {
    if (prevDescriptor) Object.defineProperty(globalThis, 'navigator', prevDescriptor);
    else delete globalThis.navigator;
  }
});

test('sendRun falls back to fetch when there is no sendBeacon', () => {
  const prevNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const prevFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const calls = [];
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'fetch', {
    value: (url, init) => { calls.push({ url, init }); return Promise.resolve({}); },
    configurable: true,
    writable: true,
  });
  try {
    assert.equal(sendRun({ score: 1 }, 'https://example.test/run'), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://example.test/run');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.keepalive, true);
    assert.equal(calls[0].init.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body), { score: 1 });
  } finally {
    if (prevNav) Object.defineProperty(globalThis, 'navigator', prevNav); else delete globalThis.navigator;
    if (prevFetch) Object.defineProperty(globalThis, 'fetch', prevFetch); else delete globalThis.fetch;
  }
});

test('sendRun falls through to fetch when sendBeacon itself throws', () => {
  const prevNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const prevFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const calls = [];
  Object.defineProperty(globalThis, 'navigator', {
    value: { sendBeacon: () => { throw new Error('queue full'); } },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'fetch', {
    value: (url, init) => { calls.push({ url, init }); return Promise.resolve({}); },
    configurable: true,
    writable: true,
  });
  try {
    assert.equal(sendRun({ score: 1 }, 'https://example.test/run'), true);
    assert.equal(calls.length, 1);
  } finally {
    if (prevNav) Object.defineProperty(globalThis, 'navigator', prevNav); else delete globalThis.navigator;
    if (prevFetch) Object.defineProperty(globalThis, 'fetch', prevFetch); else delete globalThis.fetch;
  }
});

test('runFacts picks exactly the twelve fields the Worker accepts, nothing else', () => {
  const run = { session: 's1', t0: 1000, firstMergeMs: 2500, mode: 'daily' };
  const game = { cfg: { key: 'frenzy' }, ticks: 42, eaten: 22, score: 96, bestTile: 32, bestCombo: 2 };
  const ev = { over: true, cause: { type: 'self', cell: { x: 1, y: 1 } } };
  const rec = buildRun(run, game, ev, 31000, 1700000000000);
  const device = { daySince: 3, daysPlayed: 2, firstOfDay: true };
  const out = runFacts(rec, device);
  assert.deepEqual(Object.keys(out).sort(), [
    'bestCombo', 'bestTile', 'cause', 'daySince', 'daysPlayed', 'difficulty',
    'durationMs', 'eaten', 'firstMergeMs', 'firstOfDay', 'level', 'mode', 'score',
  ]);
  assert.equal('session' in out, false);
  assert.equal('endedAt' in out, false);
  assert.equal('ticks' in out, false);
  assert.equal(out.mode, 'daily');
  assert.equal(out.score, 96);
  assert.equal(out.daySince, 3);
  assert.equal(runFacts({ ...rec, level: 7 }, device).level, 7);
  assert.equal(runFacts({ ...rec, level: undefined }, device).level, null);
});

test('runFacts turns a missing firstMergeMs into null', () => {
  const rec = {
    session: 's1', difficulty: 'classic', mode: 'free', firstMergeMs: undefined, durationMs: 1000,
    ticks: 1, eaten: 1, score: 0, bestTile: 2, bestCombo: 0, cause: 'wall', endedAt: 1700000000000,
  };
  const out = runFacts(rec, { daySince: 0, daysPlayed: 1, firstOfDay: true });
  assert.equal(out.firstMergeMs, null);
});

test('runFacts output satisfies the Worker validator', () => {
  const rec = {
    session: 's1', difficulty: 'frenzy', mode: 'practice', firstMergeMs: undefined, durationMs: 5000,
    ticks: 10, eaten: 5, score: 0, bestTile: 2, bestCombo: 0, cause: 'obstacle', endedAt: 1700000000000,
  };
  const out = runFacts(rec, { daySince: 0, daysPlayed: 1, firstOfDay: true });
  assert.notEqual(validateRun(out), null);
  assert.ok(validateRun(runFacts({ ...rec, mode: 'campaign', cause: 'won', level: 7 }, { daySince: 0, daysPlayed: 1, firstOfDay: true })), 'a won campaign run is accepted');
});
