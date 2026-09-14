# Retention and Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementation subagents run on **Sonnet**; each task is sized for a fresh subagent with zero prior context.

**Goal:** Implement `docs/superpowers/specs/2026-09-14-retention-and-analytics-design.md`: a daily challenge with a streak, a spoiler-free share card, and retention analytics that identify nobody.

**Architecture:** three new pure modules — `src/daily.js` (date keys, seeds, streak, storage), `src/share.js` (the card text), `src/analytics.js` (the device's own history and a fire-and-forget sender) — plus a self-contained Cloudflare Worker in `analytics/` with its own tests. `main.js` gains a `mode` (`free` | `daily` | `practice`) and the panel changes with it. The rules engine is untouched: a daily is an ordinary game created from a date-derived seed on Classic.

**Tech Stack:** unchanged for the game. The Worker is plain JavaScript on Cloudflare Workers with a D1 (SQLite) database, deployed with `wrangler`; its validation is pure and runs under the project's `node --test`.

**Dependency order:** Tasks 1, 2 and 3 are independent. Task 4 needs 1 and 2. Task 5 is the orchestrator's, and the Worker deploy in Task 3 waits for the author's Cloudflare account.

---

## File Structure

```
src/constants.js        MODIFY  GAME, DAILY, ANALYTICS blocks                          (Task 1)
src/daily.js            NEW     dayKey, daysBetween, shiftKey, dailyNumber, seedFor,
                                loadDaily, saveDaily, streak, recordDaily               (Task 1)
test/daily.test.js      NEW                                                             (Task 1)
src/share.js            NEW     shareText                                               (Task 2)
src/analytics.js        NEW     loadDevice, deviceFacts, sendRun                        (Task 2)
test/share.test.js      NEW                                                             (Task 2)
test/analytics.test.js  NEW                                                             (Task 2)
analytics/              NEW     wrangler.toml, package.json, schema.sql, README.md,
                                src/validate.js, src/worker.js, test/validate.test.js  (Task 3)
src/telemetry.js        MODIFY  the record carries `mode`                              (Task 4)
test/telemetry.test.js  MODIFY                                                          (Task 4)
index.html              MODIFY  Daily chip in the HUD; panel: streak, Share, Daily, notice (Task 4)
style.css               MODIFY  .chip, #shareBtn, .fine                                 (Task 4)
src/main.js             MODIFY  modes, daily flow, share, analytics send               (Task 4)
docs/PLAYTEST.md        MODIFY  how to read /stats; the daily protocol                 (Task 5)
```

The record every run now produces (client → Worker), all fields required unless noted:

| Field          | Type                         | From              |
| -------------- | ---------------------------- | ----------------- |
| `daySince`     | int ≥ 0                      | `deviceFacts`     |
| `daysPlayed`   | int ≥ 1                      | `deviceFacts`     |
| `firstOfDay`   | boolean                      | `deviceFacts`     |
| `mode`         | `free` \| `daily` \| `practice` | `run.mode`     |
| `difficulty`   | `chill` \| `classic` \| `frenzy` | `buildRun`    |
| `score`, `bestTile`, `bestCombo`, `durationMs`, `eaten` | int | `buildRun` |
| `firstMergeMs` | int or null                  | `buildRun`        |
| `cause`        | `wall` \| `self` \| `obstacle` | `buildRun`      |

---

### Task 1: Constants and the daily module

**Files:** modify `src/constants.js`; create `src/daily.js`, `test/daily.test.js`.

- [ ] **Step 1: Constants** — append to `src/constants.js`:

```js
// The game's identity, used by the share card. A rename is one line here.
export const GAME = {
  name: 'Number Snake',
  url: 'https://joanfernandeze.github.io/number-snake/',
};

// The daily challenge: one board for everyone, seeded from the local calendar date, always
// on Classic so results compare. The first attempt of the day is the one that counts.
export const DAILY = {
  epoch: '2026-09-14',          // Daily #1
  level: 'classic',
  storageKey: 'numberSnake.daily',
};

// Retention analytics without identifiers: the device sends only aggregable facts about its
// own history. An empty endpoint turns sending off entirely.
export const ANALYTICS = {
  endpoint: '',
  storageKey: 'numberSnake.device',
};
```

- [ ] **Step 2: Failing tests** — create `test/daily.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, daysBetween, shiftKey, dailyNumber, seedFor, loadDaily, saveDaily, streak, recordDaily } from '../src/daily.js';
import { DAILY } from '../src/constants.js';

function fakeStorage(initial) {
  const m = new Map(initial ? [[DAILY.storageKey, initial]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

test('dayKey is the local calendar day, zero-padded', () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(dayKey(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
});

test('daysBetween and shiftKey agree across month, year and DST boundaries', () => {
  assert.equal(daysBetween('2026-01-31', '2026-02-01'), 1);
  assert.equal(daysBetween('2025-12-31', '2026-01-01'), 1);
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2, 'the European DST switch is still two days');
  assert.equal(daysBetween('2026-09-14', '2026-09-14'), 0);
  assert.equal(shiftKey('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftKey('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftKey('2026-09-14', -7), '2026-09-07');
});

test('dailyNumber counts from the epoch, which is Daily #1', () => {
  assert.equal(dailyNumber(DAILY.epoch), 1);
  assert.equal(dailyNumber(shiftKey(DAILY.epoch, 41)), 42);
});

test('seedFor is stable for a day and different between days', () => {
  assert.equal(seedFor('2026-09-14'), seedFor('2026-09-14'));
  assert.notEqual(seedFor('2026-09-14'), seedFor('2026-09-15'));
  assert.ok(Number.isInteger(seedFor('2026-09-14')) && seedFor('2026-09-14') >= 0, 'an unsigned 32-bit seed');
});

test('loadDaily survives missing and corrupt storage and round-trips', () => {
  assert.deepEqual(loadDaily(fakeStorage()), { results: {}, bestStreak: 0 });
  assert.deepEqual(loadDaily(fakeStorage('{nope')), { results: {}, bestStreak: 0 });
  assert.deepEqual(loadDaily(fakeStorage('[]')), { results: {}, bestStreak: 0 });
  const s = fakeStorage();
  saveDaily({ results: { '2026-09-14': { bestTile: 64, score: 300, durationMs: 40000 } }, bestStreak: 1 }, s);
  assert.equal(loadDaily(s).results['2026-09-14'].bestTile, 64);
  assert.equal(loadDaily(s).bestStreak, 1);
});

test('streak counts consecutive days and forgives an unplayed today, but not a missed yesterday', () => {
  const r = { '2026-09-12': {}, '2026-09-13': {}, '2026-09-14': {} };
  assert.equal(streak(r, '2026-09-14'), 3, 'played today: today counts');
  assert.equal(streak(r, '2026-09-15'), 3, 'today still open: the streak from yesterday is alive');
  assert.equal(streak(r, '2026-09-16'), 0, 'skipped a whole day: gone');
  assert.equal(streak({ '2026-09-10': {} }, '2026-09-14'), 0);
  assert.equal(streak({}, '2026-09-14'), 0);
});

test('recordDaily keeps the first attempt only and tracks the best streak', () => {
  const state = { results: { '2026-09-13': { bestTile: 32 } }, bestStreak: 1 };
  assert.equal(recordDaily(state, '2026-09-14', { bestTile: 128 }), true);
  assert.equal(state.results['2026-09-14'].bestTile, 128);
  assert.equal(state.bestStreak, 2);
  assert.equal(recordDaily(state, '2026-09-14', { bestTile: 999 }), false, 'a second attempt does not count');
  assert.equal(state.results['2026-09-14'].bestTile, 128, 'and does not overwrite');
});
```

- [ ] **Step 3: Run to verify failure** — `node --test test/daily.test.js` → FAIL, module not found.

- [ ] **Step 4: Implement `src/daily.js`**

```js
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
```

- [ ] **Step 5: Run** — `node --test test/daily.test.js` → 7 pass. `node --test` → all green. **Commit:**

```bash
git add src/constants.js src/daily.js test/daily.test.js
git commit -m "feat(daily): date keys, a seed per day, streak arithmetic and storage" -- src/constants.js src/daily.js test/daily.test.js
```

---

### Task 2: Share text and the identifier-free device history

**Files:** create `src/share.js`, `src/analytics.js`, `test/share.test.js`, `test/analytics.test.js`. Needs Task 1's constants; if `GAME`/`ANALYTICS` are not in `src/constants.js` yet, add them exactly as Task 1 writes them.

- [ ] **Step 1: Failing tests** — `test/share.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareText } from '../src/share.js';
import { GAME } from '../src/constants.js';

test('a daily card names the day, the tile, the time and the streak', () => {
  const t = shareText({ daily: 42, bestTile: 128, durationMs: 54321, streak: 7 });
  assert.deepEqual(t.split('\n'), [
    `${GAME.name} · Daily #42`,
    '🐍 Best tile 128 · 54 s · 🔥 7-day streak',
    GAME.url,
  ]);
});

test('a free-play card names the level and never a streak', () => {
  const t = shareText({ level: 'Frenzy', bestTile: 32, durationMs: 9800, streak: 5 });
  assert.equal(t.split('\n')[0], `${GAME.name} · Frenzy`);
  assert.equal(t.split('\n')[1], '🐍 Best tile 32 · 10 s');
});

test('a daily with no streak yet leaves the flame out', () => {
  assert.equal(shareText({ daily: 1, bestTile: 16, durationMs: 30000, streak: 0 }).split('\n')[1], '🐍 Best tile 16 · 30 s');
});
```

`test/analytics.test.js`:

```js
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
  const prev = globalThis.navigator;
  globalThis.navigator = { sendBeacon: (url, blob) => { seen.push({ url, type: blob.type }); return true; } };
  try {
    assert.equal(sendRun({ score: 1 }, 'https://example.test/run'), true);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'https://example.test/run');
    assert.equal(seen[0].type, 'application/json');
  } finally {
    if (prev === undefined) delete globalThis.navigator; else globalThis.navigator = prev;
  }
});
```

- [ ] **Step 2: Run to verify failure** — both fail, modules not found.

- [ ] **Step 3: Implement `src/share.js`**

```js
import { GAME } from './constants.js';

// The share card: spoiler-free text in the Wordle tradition. Pure, so the exact wording is tested.
export function shareText({ daily = null, level = 'Classic', bestTile, durationMs, streak = 0 }) {
  const head = daily ? `${GAME.name} · Daily #${daily}` : `${GAME.name} · ${level}`;
  const parts = [`🐍 Best tile ${bestTile}`, `${Math.round(durationMs / 1000)} s`];
  if (daily && streak > 0) parts.push(`🔥 ${streak}-day streak`);
  return `${head}\n${parts.join(' · ')}\n${GAME.url}`;
}
```

**Implement `src/analytics.js`**

```js
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
```

- [ ] **Step 4: Run** — `node --test test/share.test.js test/analytics.test.js` → 7 pass. **Commit:**

```bash
git add src/share.js src/analytics.js test/share.test.js test/analytics.test.js
git commit -m "feat: share card text and identifier-free device history with a beacon sender" -- src/share.js src/analytics.js test/share.test.js test/analytics.test.js
```

---

### Task 3: The Cloudflare Worker

**Files:** create everything under `analytics/`. Self-contained; nothing in `src/` imports it.

- [ ] **Step 1: Failing test** — `analytics/test/validate.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify failure** — `node --test analytics/test/validate.test.js` → FAIL.

- [ ] **Step 3: Create the Worker**

`analytics/src/validate.js`:

```js
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
```

`analytics/src/worker.js`:

```js
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
  return new Response(JSON.stringify(body), {
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
      await env.DB.prepare(
        `INSERT INTO runs (day_since, days_played, first_of_day, mode, difficulty, score, best_tile,
                           best_combo, duration_ms, eaten, first_merge_ms, cause)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
      ).bind(r.daySince, r.daysPlayed, r.firstOfDay, r.mode, r.difficulty, r.score, r.bestTile,
             r.bestCombo, r.durationMs, r.eaten, r.firstMergeMs, r.cause).run();
      return json({ ok: true }, 200, origin);
    }

    if (request.method === 'GET' && url.pathname === '/stats') {
      if (!env.STATS_KEY || url.searchParams.get('key') !== env.STATS_KEY) return json({ error: 'key' }, 401, origin);
      const one = (sql) => env.DB.prepare(sql).first();
      const [fresh, d1, d7, all, daily] = await Promise.all([
        one(`SELECT COUNT(*) AS n FROM runs WHERE day_since = 0 AND first_of_day = 1`),
        one(`SELECT COUNT(*) AS n FROM runs WHERE day_since = 1 AND first_of_day = 1`),
        one(`SELECT COUNT(*) AS n FROM runs WHERE day_since = 7 AND first_of_day = 1`),
        one(`SELECT COUNT(*) AS n, AVG(duration_ms) AS ms, AVG(best_tile) AS tile FROM runs`),
        one(`SELECT COUNT(*) AS n FROM runs WHERE mode = 'daily'`),
      ]);
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
```

`analytics/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  day_since INTEGER NOT NULL,
  days_played INTEGER NOT NULL,
  first_of_day INTEGER NOT NULL,
  mode TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  score INTEGER NOT NULL,
  best_tile INTEGER NOT NULL,
  best_combo INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  eaten INTEGER NOT NULL,
  first_merge_ms INTEGER,
  cause TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_retention ON runs (day_since, first_of_day);
```

`analytics/wrangler.toml`:

```toml
name = "number-snake-analytics"
main = "src/worker.js"
compatibility_date = "2026-09-01"

[[d1_databases]]
binding = "DB"
database_name = "number-snake-analytics"
database_id = "REPLACE_WITH_THE_ID_PRINTED_BY_wrangler_d1_create"
```

`analytics/package.json`:

```json
{
  "name": "number-snake-analytics",
  "private": true,
  "type": "module",
  "scripts": {
    "deploy": "wrangler deploy",
    "schema": "wrangler d1 execute number-snake-analytics --remote --file=schema.sql",
    "tail": "wrangler tail"
  },
  "devDependencies": {
    "wrangler": "^4"
  }
}
```

`analytics/README.md`:

```markdown
# Number Snake analytics

A Cloudflare Worker with a D1 database that receives one record per finished run and answers
with retention aggregates. No identifiers are received or stored: the device reports "day N
since its first play, Mth distinct day, first run of the day" and the server only counts.

## Deploy (once, from this folder)

1. `npm install`
2. `npx wrangler login` — opens the browser; sign in to your Cloudflare account.
3. `npx wrangler d1 create number-snake-analytics` — copy the `database_id` it prints into
   `wrangler.toml`.
4. `npm run schema` — creates the table.
5. `npx wrangler secret put STATS_KEY` — paste any long random string; it protects `/stats`.
6. `npm run deploy` — prints the Worker URL, e.g. `https://number-snake-analytics.<you>.workers.dev`.
7. In the game, set `ANALYTICS.endpoint` in `src/constants.js` to that URL plus `/run` and push.

## Read the numbers

`https://number-snake-analytics.<you>.workers.dev/stats?key=<STATS_KEY>` returns:

| Field           | Meaning                                                 |
| --------------- | ------------------------------------------------------- |
| `newDevices`    | devices seen on their first day                         |
| `d1Percent`     | share of them that played again exactly the next day    |
| `d7Percent`     | share that played on day seven                          |
| `runs`, `avgDurationMs`, `avgBestTile`, `dailyRuns` | volume and quality        |

The game's `docs/PLAYTEST.md` says what counts as a good sign.
```

Add `analytics/node_modules/` to the repository's `.gitignore` (append the line `analytics/node_modules/`).

- [ ] **Step 4: Verify** — `node --test analytics/test/validate.test.js` → 4 pass. `node --test` from the project root → all green (the runner finds `analytics/test` too). `node --check analytics/src/worker.js analytics/src/validate.js` clean. Do **not** try to deploy: there is no Cloudflare account in this environment; the author does that with the README.

- [ ] **Step 5: Commit**

```bash
git add analytics .gitignore
git commit -m "feat(analytics): Cloudflare Worker + D1 for identifier-free retention counts" -- analytics .gitignore
```

---

### Task 4: Wire the daily, the card and the beacon into the game

**Files:** modify `src/telemetry.js`, `test/telemetry.test.js`, `index.html`, `style.css`, `src/main.js`. Needs Tasks 1 and 2.

- [ ] **Step 1: The record carries its mode** — in `test/telemetry.test.js`, in the `buildRun` test, give the fake `run` a `mode: 'daily'` and assert `rec.mode === 'daily'`; add one line asserting that a run without a mode yields `'free'`. In `src/telemetry.js`'s `buildRun`, add `mode: run.mode || 'free',` right after `difficulty`. Run `node --test test/telemetry.test.js` → green.

- [ ] **Step 2: Markup** — in `index.html`:

In the HUD, between the two `.stat` blocks, insert:

```html
      <button id="dailyBtn" class="chip" type="button">Daily</button>
```

In the panel, replace the `<h1>Game Over</h1>` line with `<h1 id="ovTitle">Game Over</h1>`, and immediately after the `<p class="best">…</p>` line add:

```html
        <p id="ovStreak" class="best hidden"></p>
```

Immediately after the `<button id="playAgain">Play Again</button>` line add:

```html
        <button id="shareBtn" class="secondary" type="button">Share</button>
        <pre id="shareText" class="hidden"></pre>
        <span id="shareNote" class="hidden"></span>
        <button id="dailyPanelBtn" class="link" type="button">Daily</button>
```

And as the **last** child of the panel, after the `#stats` block:

```html
        <p class="fine">Anonymous play statistics help improve the game. Nothing personal is collected.</p>
```

- [ ] **Step 3: Styles** — append to `style.css`:

```css
.chip {
  align-self: center; min-height: 36px; padding: 6px 14px;
  background: #111935; color: #c7d2fe; border: 1px solid #263156; border-radius: 999px;
  font-size: 13px; font-weight: 700; letter-spacing: .3px; cursor: pointer; touch-action: none;
}
.chip[data-done="true"] { border-color: #6366f1; color: #fff; }
.chip:disabled { opacity: .4; }
.secondary {
  margin-top: 10px; padding: 12px 24px; font-size: 15px; font-weight: 700;
  border: 1px solid #6366f1; border-radius: 12px; background: transparent; color: #c7d2fe; cursor: pointer;
}
#shareText {
  margin-top: 10px; padding: 10px 12px; text-align: left; white-space: pre-wrap;
  font: 13px/1.5 system-ui, sans-serif; color: #e5e7eb; background: #111935; border-radius: 10px;
  user-select: text; -webkit-user-select: text;
}
#shareNote { display: block; margin-top: 6px; font-size: 12px; color: #93a4c3; }
.fine { margin-top: 14px; font-size: 11px; color: #64748b; }
```

- [ ] **Step 4: `src/main.js`**

Add imports:

```js
import { GAME, DAILY, ANALYTICS } from './constants.js';   // merge into the existing constants import
import { dayKey, dailyNumber, seedFor, loadDaily, saveDaily, streak, recordDaily } from './daily.js';
import { shareText } from './share.js';
import { deviceFacts, sendRun } from './analytics.js';
```

State, next to `let difficulty`:

```js
// 'free' is an ordinary run on the chosen level. 'daily' is today's seeded board on Classic and
// the first one counts; 'practice' replays that board without touching the record or streak.
let mode = 'free';
let daily = loadDaily();
```

Replace `start()` with:

```js
function start(opts = {}) {
  mode = opts.mode || 'free';
  const today = dayKey();
  const seed = mode === 'free' ? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) : seedFor(today);
  const level = mode === 'free' ? difficulty : DAILY.level;
  game = Game.createGame(createRng(seed), DIFFICULTIES[level]);
  fx = Fx.createFx();
  motion = { kind: 'none', progress: 1 };
  interval = Game.currentTarget(game);
  lastTick = performance.now();
  $('overlay').classList.add('hidden');
  $('stats').classList.add('hidden');
  $('statsCopied').classList.add('hidden');
  $('shareText').classList.add('hidden');
  $('shareNote').classList.add('hidden');
  run = { session: SESSION, t0: null, firstMergeMs: null, mode, day: today };
  paintLevels();
  paintDaily();
}
```

Add these two functions next to `paintLevels`:

```js
// The HUD chip and the panel button both say where today's daily stands. During a run the chip
// is out of reach: a tap there must never restart the game under the player.
function paintDaily() {
  const today = dayKey(), n = dailyNumber(today), done = daily.results[today];
  const label = done ? `Daily #${n} ✓ ${done.bestTile}` : `Daily #${n}`;
  const chip = $('dailyBtn');
  chip.textContent = label;
  chip.dataset.done = String(!!done);
  chip.disabled = !!(game && game.started && !game.over);
  $('dailyPanelBtn').textContent = done ? `Practise Daily #${n}` : `Play Daily #${n}`;
}

// The game-over panel reads differently for a daily than for free play.
function paintPanel() {
  const today = dayKey(), n = dailyNumber(today);
  const isDaily = mode !== 'free';
  $('ovTitle').textContent = mode === 'daily' ? `Daily #${n}` : mode === 'practice' ? `Daily #${n} · practice` : 'Game Over';
  $('playAgain').textContent = isDaily ? 'Practise this board' : 'Play Again';
  $('levels').classList.toggle('hidden', isDaily);
  $('levels').previousElementSibling.classList.toggle('hidden', isDaily); // the "Pick a level" hint
  const s = streak(daily.results, today);
  $('ovStreak').textContent = s > 0 ? `🔥 ${s}-day streak · best ${daily.bestStreak}` : '';
  $('ovStreak').classList.toggle('hidden', !(isDaily && s > 0));
}
```

In `onGameOver`, after `saveBest(best);` insert:

```js
  if (mode === 'daily') {
    recordDaily(daily, run.day, { bestTile: game.bestTile, score: game.score, durationMs: Math.round(now - run.t0) });
    saveDaily(daily);
  }
  paintDaily();
  paintPanel();
```

and after `runs = saveRuns([...runs, rec]);` insert:

```js
  // The retention facts travel without any identifier; see analytics.js.
  sendRun({ ...rec, ...deviceFacts(run.day) }, ANALYTICS.endpoint);
```

Replace the `paintLevels(); paintDaily();` calls that `frame()` does not have — leave `frame()` alone except for one addition: right after `if (ev.over) { onGameOver(ev, now); }`'s block, nothing changes. Instead, so the chip disables the moment a run starts, add to `onDirection`, inside the `if (!game.started)` block, a trailing `paintDaily();`.

Wire the buttons next to the others:

```js
// The daily: today's board if it is still unplayed, practice on it otherwise. Ignored mid-run.
function onDaily() {
  if (game && game.started && !game.over) return;
  start({ mode: daily.results[dayKey()] ? 'practice' : 'daily' });
}
$('dailyBtn').addEventListener('click', onDaily);
$('dailyPanelBtn').addEventListener('click', onDaily);

$('shareBtn').addEventListener('click', async () => {
  const today = dayKey();
  const text = shareText({
    daily: mode === 'daily' ? dailyNumber(today) : null,
    level: DIFFICULTIES[game.cfg.key].name,
    bestTile: game.bestTile,
    durationMs: run.t0 === null ? 0 : Math.round(performance.now() - run.t0),
    streak: streak(daily.results, today),
  });
  const note = $('shareNote');
  let how = 'copied';
  try {
    if (navigator.share) { await navigator.share({ text }); how = 'shared'; }
    else if (!(await navigator.clipboard.writeText(text).then(() => true).catch(() => false))) how = 'shown';
  } catch { how = 'shown'; }
  $('shareText').textContent = text;
  $('shareText').classList.remove('hidden');
  note.textContent = how === 'shared' ? 'Shared' : how === 'copied' ? 'Copied to clipboard' : 'Long-press the text to copy it';
  note.classList.remove('hidden');
  setTimeout(() => note.classList.add('hidden'), UI.copiedNoteMs);
});
```

Change the Play Again handler from `start` to `() => start({ mode: mode === 'free' ? 'free' : 'practice' })`, and the levels handler's `start();` to `start({ mode: 'free' });`. At the bottom, after the initial `start();`, add `paintDaily();`.

`durationMs` in the share text uses `performance.now()` at the moment of sharing, which is a few seconds after the death; that is fine for a card but note it as a known approximation in your report. If you can read the exact value instead — `onGameOver` already computes `Math.round(now - run.t0)` — store it on `run` as `run.durationMs` there and use it in the share handler; prefer that.

- [ ] **Step 5: Verify** — `node --test` → all green. `node --check src/main.js`. Every id used by `main.js` exists in `index.html` (`dailyBtn dailyPanelBtn ovTitle ovStreak shareBtn shareText shareNote`). `grep -n "sendRun\|deviceFacts\|recordDaily\|shareText" src/main.js` shows each is used.

- [ ] **Step 6: Commit**

```bash
git add src/telemetry.js test/telemetry.test.js index.html style.css src/main.js
git commit -m "feat: daily challenge with streak, share card, and identifier-free retention beacon" -- src/telemetry.js test/telemetry.test.js index.html style.css src/main.js
```

---

### Task 5: Verify, document, publish (orchestrator + author)

- [ ] Browser: HUD chip shows `Daily #1`; tapping it starts a Classic run on a fixed board (reload → same board); dying shows `Daily #1` as the title with the streak line; Play Again reads "Practise this board"; the chip now shows `Daily #1 ✓ <tile>`; a level tap returns to free play; Share fills the text and copies or opens the share sheet; the notice line is visible.
- [ ] `docs/PLAYTEST.md`: the daily protocol (ask testers to come back tomorrow), and how to read `/stats`.
- [ ] Push. Then the author deploys the Worker with `analytics/README.md`, pastes the URL into `ANALYTICS.endpoint`, and we push again.

---

## Self-Review

- **Spec coverage:** §2 analytics → Tasks 2, 3, 4 (facts, Worker, beacon); §3 daily and streak → Tasks 1, 4; §4 share card → Tasks 2, 4; §5 exclusions respected (no identifiers, no ads, no accounts); §6 metrics are exactly what `/stats` returns.
- **Type consistency:** `deviceFacts` returns `{ daySince, daysPlayed, firstOfDay }`, which is what `validateRun` requires alongside `buildRun`'s fields plus `mode`; `shareText`'s argument names match the share handler; `recordDaily(state, key, result)` and `streak(results, key)` are called with those signatures in `main.js`; the Worker's INSERT columns match `schema.sql` and `validateRun`'s output one for one.
- **Failure isolation:** an unreachable or unconfigured endpoint can never affect play — `sendRun` returns before doing anything when the endpoint is empty and swallows every error otherwise.
