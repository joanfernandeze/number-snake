import { validateRun } from './validate.js';

// POST /run stores one validated run record. GET /stats?key=… returns aggregates behind a
// shared secret. No identifiers are received or stored; see the design spec.
const SITE = 'https://joanfernandeze.github.io';

function allowedOrigin(origin) {
  if (!origin) return SITE;
  if (origin === SITE || /^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  return null;
}

function json(body, status, origin) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': origin || SITE,
      'access-control-allow-methods': 'POST, GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request.headers.get('origin'));

    if (request.method === 'OPTIONS') return json(null, 204, origin);

    if (request.method === 'POST' && url.pathname === '/run') {
      if (!origin) return json({ error: 'origin' }, 403, origin);
      let body;
      try { body = await request.json(); } catch { return json({ error: 'json' }, 400, origin); }
      const r = validateRun(body);
      if (!r) return json({ error: 'shape' }, 400, origin);
      try {
        await env.DB.prepare(
          `INSERT INTO runs (day_since, days_played, first_of_day, mode, difficulty, score, best_tile,
                             best_combo, duration_ms, eaten, first_merge_ms, cause)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
        ).bind(r.daySince, r.daysPlayed, r.firstOfDay, r.mode, r.difficulty, r.score, r.bestTile,
               r.bestCombo, r.durationMs, r.eaten, r.firstMergeMs, r.cause).run();
      } catch { return json({ error: 'server' }, 500, origin); }
      return json({ ok: true }, 200, origin);
    }

    if (request.method === 'GET' && url.pathname === '/stats') {
      if (!env.STATS_KEY || url.searchParams.get('key') !== env.STATS_KEY) return json({ error: 'key' }, 401, origin);
      const one = (sql) => env.DB.prepare(sql).first();
      let fresh, d1, d7, all, daily;
      try {
        [fresh, d1, d7, all, daily] = await Promise.all([
          one(`SELECT COUNT(*) AS n FROM runs WHERE day_since = 0 AND first_of_day = 1`),
          one(`SELECT COUNT(*) AS n FROM runs WHERE day_since = 1 AND first_of_day = 1`),
          one(`SELECT COUNT(*) AS n FROM runs WHERE day_since = 7 AND first_of_day = 1`),
          one(`SELECT COUNT(*) AS n, AVG(duration_ms) AS ms, AVG(best_tile) AS tile FROM runs`),
          one(`SELECT COUNT(*) AS n FROM runs WHERE mode = 'daily'`),
        ]);
      } catch { return json({ error: 'server' }, 500, origin); }
      const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
      return json({
        newDevices: fresh.n,
        d1Percent: pct(d1.n, fresh.n),
        d7Percent: pct(d7.n, fresh.n),
        runs: all.n,
        avgDurationMs: Math.round(all.ms || 0),
        avgBestTile: Math.round(all.tile || 0),
        dailyRuns: daily.n,
      }, 200, origin);
    }

    return json({ error: 'not found' }, 404, origin);
  },
};
