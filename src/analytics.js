import { ANALYTICS } from './constants.js';
import { daysBetween } from './daily.js';

// Retention analytics that identify nobody. The device keeps its own play history and sends
// only facts a server can add up — "day N since first play, Mth distinct day, first run of the
// day" — so returning devices can be counted without ever knowing which device is which.

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
  if (dev.days.length > 400) dev.days = dev.days.slice(-400); // a year of daily play is plenty
  try { storage.setItem(key, JSON.stringify(dev)); } catch { /* ignore */ }
  return { daySince: daysBetween(dev.firstDay, todayKey), daysPlayed: dev.days.length, firstOfDay };
}

// Fire and forget. Never blocks the game, never throws, and does nothing without an endpoint.
export function sendRun(record, endpoint = ANALYTICS.endpoint) {
  if (!endpoint) return false;
  const body = JSON.stringify(record);
  try {
    if (typeof navigator !== 'undefined' && navigator && typeof navigator.sendBeacon === 'function') {
      return navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
    }
    if (typeof fetch === 'function') {
      fetch(endpoint, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
      return true;
    }
  } catch { /* ignore */ }
  return false;
}
