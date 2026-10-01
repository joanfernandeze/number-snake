import { ANALYTICS } from './constants.js';
import { daysBetween } from './daily.js';

// Retention analytics that identify nobody. The device keeps its own play history and sends
// only facts a server can add up — "day N since first play, Mth distinct day, first run of the
// day" — so returning devices can be counted without ever knowing which device is which.
// `runFacts` picks exactly the fourteen fields that leave the device; nothing else is ever sent.

export function loadDevice(storage = globalThis.localStorage, key = ANALYTICS.storageKey) {
  try {
    const v = JSON.parse(storage.getItem(key));
    if (v && typeof v.firstDay === 'string' && Array.isArray(v.days)) return { firstDay: v.firstDay, days: v.days };
  } catch { /* fall through */ }
  return null;
}

// The facts for a run played on `todayKey`; persists the updated history as a side effect.
export function deviceFacts(todayKey, storage = globalThis.localStorage, key = ANALYTICS.storageKey) {
  const dev = loadDevice(storage, key) || { firstDay: todayKey, days: [] };
  const firstOfDay = !dev.days.includes(todayKey);
  if (firstOfDay) dev.days.push(todayKey);
  dev.days = dev.days.slice(-ANALYTICS.maxDays); // a no-op copy once under the cap
  try { storage.setItem(key, JSON.stringify(dev)); } catch { /* ignore */ }
  return { daySince: daysBetween(dev.firstDay, todayKey), daysPlayed: dev.days.length, firstOfDay };
}

// Exactly the fields the Worker accepts, picked here so nothing else can leave the device even
// by accident: the privacy claim holds by construction, not by trusting the server to drop extras.
// `level` is the campaign level (1-24); it is null outside the campaign.
export function runFacts(rec, device) {
  return {
    daySince: device.daySince, daysPlayed: device.daysPlayed, firstOfDay: device.firstOfDay,
    mode: rec.mode, difficulty: rec.difficulty,
    score: rec.score, bestTile: rec.bestTile, bestCombo: rec.bestCombo, durationMs: rec.durationMs, eaten: rec.eaten,
    firstMergeMs: rec.firstMergeMs ?? null, cause: rec.cause,
    level: rec.level ?? null,
    stars: rec.stars ?? null,
  };
}

// Fire and forget. Never blocks the game, never throws, and does nothing without an endpoint.
export function sendRun(record, endpoint = ANALYTICS.endpoint) {
  if (!endpoint) return false;
  const body = JSON.stringify(record);
  try {
    if (typeof navigator !== 'undefined' && navigator && typeof navigator.sendBeacon === 'function') {
      return navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
    }
  } catch { /* fall through to fetch */ }
  try {
    if (typeof fetch === 'function') {
      fetch(endpoint, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
      return true;
    }
  } catch { /* ignore */ }
  return false;
}
