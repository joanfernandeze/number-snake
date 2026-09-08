import { TELEMETRY } from './constants.js';

// Per-run records and the spec §2 aggregates. Pure; storage is injected so it
// is testable in Node (defaults to window.localStorage in the browser).
//
// A run record: { session, firstMergeMs|null, durationMs, ticks, score, bestTile,
//                 bestCombo, cause: 'wall'|'self', endedAt }
// `session` is one page load, so runs-per-session approximates "runs per player".

export function loadRuns(storage = globalThis.localStorage, key = TELEMETRY.storageKey) {
  try {
    const v = JSON.parse(storage.getItem(key));
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function saveRuns(runs, storage = globalThis.localStorage, key = TELEMETRY.storageKey, max = TELEMETRY.maxRuns) {
  const kept = runs.slice(-max);
  try { storage.setItem(key, JSON.stringify(kept)); } catch { /* ignore */ }
  return kept;
}

export function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function summarize(runs) {
  const sessions = new Set(runs.map(r => r.session)).size;
  const firstMerges = runs.map(r => r.firstMergeMs).filter(v => typeof v === 'number');
  const causes = {};
  for (const r of runs) causes[r.cause] = (causes[r.cause] || 0) + 1;
  return {
    runs: runs.length,
    runsPerSession: sessions ? +(runs.length / sessions).toFixed(2) : 0,
    medianFirstMergeMs: firstMerges.length ? median(firstMerges) : null,
    medianDurationMs: runs.length ? median(runs.map(r => r.durationMs)) : null,
    bestTile: runs.reduce((m, r) => Math.max(m, r.bestTile), 0),
    medianBestTile: runs.length ? median(runs.map(r => r.bestTile)) : null,
    causes,
  };
}
