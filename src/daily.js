import { DAILY } from './constants.js';

// The daily challenge, kept pure: dates as 'YYYY-MM-DD' keys, a seed per key, and the
// streak arithmetic. Storage is injected so all of it runs under node --test.

const pad = (n) => String(n).padStart(2, '0');

// Local calendar day. Local, not UTC: the daily resets at the player's own midnight.
export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Working at UTC noon keeps day arithmetic immune to daylight-saving switches.
const noon = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d, 12); };

export function daysBetween(fromKey, toKey) {
  return Math.round((noon(toKey) - noon(fromKey)) / 86400000);
}

export function shiftKey(key, days) {
  const t = new Date(noon(key) + days * 86400000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function dailyNumber(key, epoch = DAILY.epoch) { return daysBetween(epoch, key) + 1; }

// FNV-1a over the key: a stable 32-bit seed, so everyone gets the same board on the same day.
export function seedFor(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function loadDaily(storage = globalThis.localStorage, key = DAILY.storageKey) {
  try {
    const v = JSON.parse(storage.getItem(key));
    if (v && typeof v === 'object' && !Array.isArray(v) && v.results && typeof v.results === 'object') {
      return { results: v.results, bestStreak: Number.isInteger(v.bestStreak) ? v.bestStreak : 0 };
    }
  } catch { /* fall through */ }
  return { results: {}, bestStreak: 0 };
}

export function saveDaily(state, storage = globalThis.localStorage, key = DAILY.storageKey) {
  try { storage.setItem(key, JSON.stringify(state)); } catch { /* ignore */ }
  return state;
}

// Consecutive days with a daily completed, ending today if today is played or yesterday if
// today is still open. No grace days: skip one and it is gone.
export function streak(results, todayKey) {
  let key = results[todayKey] ? todayKey : shiftKey(todayKey, -1);
  let n = 0;
  while (results[key]) { n += 1; key = shiftKey(key, -1); }
  return n;
}

// The first attempt of the day is the one that counts; later ones are practice and are ignored.
export function recordDaily(state, todayKey, result) {
  if (state.results[todayKey]) return false;
  state.results[todayKey] = result;
  const s = streak(state.results, todayKey);
  if (s > state.bestStreak) state.bestStreak = s;
  return true;
}
