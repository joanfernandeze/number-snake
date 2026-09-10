import { TELEMETRY } from './constants.js';

// Per-run records and the spec §2 aggregates. Pure; storage is injected so it
// is testable in Node (defaults to window.localStorage in the browser).
//
// A run record: { session, difficulty, firstMergeMs|null, durationMs, ticks, eaten,
//                 score, bestTile, bestCombo, cause: 'wall'|'self', endedAt }, as
//                 produced by `buildRun`.
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

// Median of a list of numbers; null for an empty list.
export function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Build the record for a finished run from the live objects main.js holds.
//   run: { session, t0, firstMergeMs }   game: the finished game   ev: the fatal step event
export function buildRun(run, game, ev, now, endedAt = Date.now()) {
  return {
    session: run.session,
    difficulty: game.cfg ? game.cfg.key : 'unknown',
    firstMergeMs: run.firstMergeMs,
    durationMs: Math.round(now - run.t0),
    ticks: game.ticks,
    eaten: game.eaten,
    score: game.score,
    bestTile: game.bestTile,
    bestCombo: game.bestCombo,
    cause: ev.cause.type,
    endedAt,
  };
}

// Finite numbers stored under `key`; records written by older builds may lack fields.
function nums(runs, key) {
  return runs.map(r => r[key]).filter(v => typeof v === 'number' && Number.isFinite(v));
}

export function summarize(runs) {
  const sessions = new Set(runs.map(r => r.session)).size;
  const causes = {};
  for (const r of runs) if (typeof r.cause === 'string') causes[r.cause] = (causes[r.cause] || 0) + 1;
  const difficulties = {};
  for (const r of runs) if (typeof r.difficulty === 'string') difficulties[r.difficulty] = (difficulties[r.difficulty] || 0) + 1;
  const tiles = nums(runs, 'bestTile');
  return {
    runs: runs.length,
    runsPerSession: sessions ? +(runs.length / sessions).toFixed(2) : 0,
    neverMerged: runs.filter(r => r.firstMergeMs == null).length, // null or missing
    medianFirstMergeMs: median(nums(runs, 'firstMergeMs')),
    medianDurationMs: median(nums(runs, 'durationMs')),
    bestTile: tiles.reduce((m, v) => Math.max(m, v), 0),
    medianBestTile: median(tiles),
    causes,
    difficulties,
  };
}

// Human-readable summary for the game-over panel; short enough to paste into a chat.
export function formatStats(s) {
  const sec = (ms) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`);
  const entries = Object.entries(s.causes);
  const causes = entries.length ? entries.map(([k, v]) => `${k} ${v}`).join(' · ') : '–';
  const levelEntries = Object.entries(s.difficulties || {});
  const levels = levelEntries.length ? levelEntries.map(([k, v]) => `${k} ${v}`).join(' · ') : '–';
  return [
    'Number Snake stats',
    `runs: ${s.runs} (${s.runsPerSession} per session, ${s.neverMerged} never merged)`,
    `first merge: median ${sec(s.medianFirstMergeMs)}`,
    `run length: median ${sec(s.medianDurationMs)}`,
    `best tile: ${s.bestTile} (median ${s.medianBestTile === null ? '–' : s.medianBestTile})`,
    `levels: ${levels}`,
    `deaths: ${causes}`,
  ].join('\n');
}
