// The only shape the endpoint accepts. Anything else is dropped whole, so a stray or hostile
// payload cannot reach the table, and only whitelisted fields are copied out.
const MODES = new Set(['free', 'daily', 'practice']);
const LEVELS = new Set(['chill', 'classic', 'frenzy']);
const CAUSES = new Set(['wall', 'self', 'obstacle']);
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export function validateRun(x) {
  if (!x || typeof x !== 'object') return null;
  if (!int(x.daySince, 0, 100000) || !int(x.daysPlayed, 1, 100000) || typeof x.firstOfDay !== 'boolean') return null;
  if (!MODES.has(x.mode) || !LEVELS.has(x.difficulty) || !CAUSES.has(x.cause)) return null;
  if (!int(x.score, 0, 1e9) || !int(x.bestTile, 2, 1 << 30) || !int(x.bestCombo, 0, 1000)) return null;
  if (!int(x.durationMs, 0, 86400000) || !int(x.eaten, 0, 100000)) return null;
  const fm = x.firstMergeMs;
  if (fm !== null && fm !== undefined && !int(fm, 0, 86400000)) return null;
  return {
    daySince: x.daySince, daysPlayed: x.daysPlayed, firstOfDay: x.firstOfDay ? 1 : 0,
    mode: x.mode, difficulty: x.difficulty,
    score: x.score, bestTile: x.bestTile, bestCombo: x.bestCombo, durationMs: x.durationMs, eaten: x.eaten,
    firstMergeMs: fm === undefined ? null : fm, cause: x.cause,
  };
}
