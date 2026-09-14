import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDevice, deviceFacts, sendRun } from '../src/analytics.js';
import { ANALYTICS } from '../src/constants.js';

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
