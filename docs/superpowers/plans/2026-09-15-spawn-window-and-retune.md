# Spawn Window and Campaign Retune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementation subagents run on **Sonnet**.

**Goal:** tiles spawn from the top `span` powers of two of the snake's biggest piece with a flatter decay, so climbing stops depending on luck; the campaign is recalibrated on top of that; the analytics carry the stars a run earned; the Worker files are committed.

**Architecture:** one function changes shape (`pickValue` gains a window), two knobs per difficulty (`span`, `decay`), one field end to end (`stars`), and a calibration pass driven by the simulator with a written rule. No new modules.

**Tech Stack:** vanilla JS ES modules, `node --test` (Node 24), Cloudflare Worker + D1 (author-deployed).

**Spec:** `docs/superpowers/specs/2026-09-15-spawn-window-and-retune-design.md`.

**Concurrency rules for every task:** stage only your own files with explicit paths; commit with `git add <files> && git commit -m "<msg>" -- <files>`; retry on `index.lock`; never `git add -A`, `git add .` or `commit -a`. `analytics/wrangler.toml` and `analytics/package-lock.json` are committed ONLY by Task 4; every other task leaves them alone.

**Task order:** 1 (spawn window), 2 (stars in analytics) and 4 (Worker files) are independent and may run in parallel; 3 (retune) needs 1; 5 (docs) needs 3; 6 (final review, push).

---

### Task 1: The spawn window

**Files:** modify `src/constants.js`, `src/board.js`, `src/game.js`, `test/board.test.js`, `test/game.test.js`.

- [ ] **Step 1: Failing tests** — in `test/board.test.js`, DELETE the test `'pickValue is weighted toward low values'` (it asserts that 2s dominate with a 64 on the snake, which the new rule forbids) and append:

```js
test('the spawn window is the top `span` powers of two: small values stop appearing as the max grows', () => {
  const seen = (max, span) => {
    const r = createRng(11);
    const s = new Set();
    for (let i = 0; i < 600; i++) s.add(pickValue(r, max, 0.8, 2, span));
    return [...s].sort((a, b) => a - b);
  };
  assert.deepEqual(seen(16, 4), [2, 4, 8, 16], 'below 32 nothing is cut');
  assert.deepEqual(seen(32, 4), [4, 8, 16, 32], 'with a 32 on the snake the 2s are gone');
  assert.deepEqual(seen(64, 4), [8, 16, 32, 64], 'with a 64 the 4s are gone');
  assert.deepEqual(seen(128, 4), [16, 32, 64, 128], 'with a 128 the 8s are gone');
  assert.deepEqual(seen(64, 3), [16, 32, 64], 'a narrower window cuts deeper');
  assert.deepEqual(seen(2, 4), [2]);
});

test('within the window the low end is most common and the top still shows up often', () => {
  const r = createRng(123);
  const counts = {};
  for (let i = 0; i < 2000; i++) { const v = pickValue(r, 64, 0.8, 2, 4); counts[v] = (counts[v] || 0) + 1; }
  assert.ok(counts[8] > counts[16] && counts[16] > counts[32] && counts[32] > counts[64], JSON.stringify(counts));
  assert.ok(counts[64] / 2000 > 0.12, `a 64 should appear in well over a tenth of spawns: ${counts[64]}`);
  assert.equal(counts[2], undefined);
  assert.equal(counts[4], undefined);
});

test('refill and spawnTile pass the window through', () => {
  const b = createBoard(7, 11);
  refill(b, createRng(3), 64, [], 10, 0.8, 1);
  assert.ok(b.tiles.length === 10 && b.tiles.every(t => t.value === 64), 'span 1 spawns only the biggest value');
  const b2 = createBoard(7, 11);
  const t = spawnTile(b2, createRng(4), 64, [], 0.8, 2);
  assert.ok([32, 64].includes(t.value), `span 2 spawns 32 or 64, got ${t.value}`);
});
```

Append to `test/game.test.js`:

```js
test('the game refills with the level\'s window: a span of one spawns only the biggest piece', () => {
  const g = createGame(createRng(3), { ...DIFFICULTIES.classic, span: 1 });
  g.snake.values[0] = 64;
  g.board.tiles = [{ x: 3, y: 4, value: 64 }]; // straight ahead of the centre start, heading up
  startRun(g);
  const ev = step(g);
  assert.equal(ev.ate, true);
  assert.equal(g.bestTile, 128);
  assert.equal(g.board.tiles.length, DIFFICULTIES.classic.maxTiles);
  assert.ok(g.board.tiles.every(t => t.value === 128), JSON.stringify(g.board.tiles));
});

test('every difficulty has a spawn window, and Chill\'s is the narrowest', () => {
  for (const cfg of Object.values(DIFFICULTIES)) assert.ok(Number.isInteger(cfg.span) && cfg.span >= 1, `${cfg.name} span`);
  assert.ok(DIFFICULTIES.chill.span < DIFFICULTIES.classic.span);
  assert.equal(DIFFICULTIES.frenzy.span, DIFFICULTIES.classic.span);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test test/board.test.js test/game.test.js` → the new tests fail (`pickValue` ignores `span`; `refill` has no seventh parameter; no `span` in `DIFFICULTIES`).

- [ ] **Step 3: `src/constants.js`** — `SPAWN` becomes:

```js
export const SPAWN = {
  baseValue: 2,       // smallest tile value
  span: 4,            // default window: the top `span` powers of two ending at the biggest piece
  decay: 0.8,         // default weight ratio from one rung of the window to the next, low end heaviest
};
```

In `DIFFICULTIES`, update the three `decay` values and add `span` right after each:

```js
    maxTiles: 4, decay: 0.9, span: 3, window: 'head', obstacleEvery: 20,   // chill
    maxTiles: 3, decay: 0.8, span: 4, window: 'max', obstacleEvery: 10,    // classic
    maxTiles: 2, decay: 0.65, span: 4, window: 'max', obstacleEvery: 10,   // frenzy
```

(Keep each level's other fields and the surrounding comments; add one comment above `DIFFICULTIES`: `// span/decay: the spawn window (spec 2026-09-15 §2). As the biggest piece grows, the smallest values stop appearing; a flatter decay keeps the top of the window frequent.`)

- [ ] **Step 4: `src/board.js`** — replace `pickValue`, `spawnTile`, `refill`:

```js
// Pick a tile value from the top `span` powers of two ending at maxValue, weighted toward the
// low end by `decay`. As the biggest piece grows, the smallest values stop appearing: with a 32
// on the snake no 2s spawn, with a 64 no 4s. The bottom of the window is what a player most
// likely holds after eating the wrong tile, so it is also the rung that climbs back fastest.
export function pickValue(rng, maxValue, decay = SPAWN.decay, base = SPAWN.baseValue, span = SPAWN.span) {
  const maxExp = Math.max(1, Math.round(Math.log2(maxValue / base)) + 1);
  const minExp = Math.max(1, maxExp - span + 1);
  const weights = [];
  let total = 0;
  for (let e = minExp; e <= maxExp; e++) {
    const w = Math.pow(decay, e - minExp);
    weights.push(w);
    total += w;
  }
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return base * Math.pow(2, minExp - 1 + i);
  }
  return base * Math.pow(2, maxExp - 1);
}
```

```js
// Spawn one tile on a random empty cell. Returns the tile, or null if the board is full.
export function spawnTile(board, rng, maxValue, snakeCells, decay, span) {
  const empties = [];
  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) {
      if (!isOccupied(board, snakeCells, x, y)) empties.push({ x, y });
    }
  }
  if (empties.length === 0) return null;
  const cell = empties[randInt(rng, empties.length)];
  const tile = { x: cell.x, y: cell.y, value: pickValue(rng, maxValue, decay, SPAWN.baseValue, span) };
  board.tiles.push(tile);
  return tile;
}

// The tile count, the low-value bias and the window all come from the level, so the caller passes them.
export function refill(board, rng, maxValue, snakeCells, maxTiles, decay, span) {
  while (board.tiles.length < maxTiles) {
    if (!spawnTile(board, rng, maxValue, snakeCells, decay, span)) break;
  }
}
```

(`decay`/`span` undefined fall through to `pickValue`'s defaults, so the existing tests that omit them keep working.)

- [ ] **Step 5: `src/game.js`** — both `Board.refill(...)` calls gain the window: `Board.refill(board, rng, spawnRef(game), snake.cells, cfg.maxTiles, cfg.decay, cfg.span)` in `createGame` and `Board.refill(b, game.rng, spawnRef(game), s.cells, game.cfg.maxTiles, game.cfg.decay, game.cfg.span)` in `step`.

- [ ] **Step 6: Run** — `node --test` → all green (157 − 1 deleted + 5 new = 161). `node --check src/board.js src/game.js src/constants.js`. Sanity: `node tools/simulate.js --runs=200 --level=classic` — the greedy policy's median best tile should now be well above the old 64 (report the number; 128–256 is the expected band; if it is above 256, note it — Task 3 tunes decays).

- [ ] **Step 7: Commit**

```bash
git add src/constants.js src/board.js src/game.js test/board.test.js test/game.test.js
git commit -m "feat(spawn): tiles come from the top four powers of the biggest piece; small values stop appearing as you climb" -- src/constants.js src/board.js src/game.js test/board.test.js test/game.test.js
```

---

### Task 2: The stars a run earned travel with the analytics

**Files:** modify `src/main.js`, `src/telemetry.js`, `test/telemetry.test.js`, `src/analytics.js`, `test/analytics.test.js`, `analytics/src/validate.js`, `analytics/test/validate.test.js`, `analytics/src/worker.js`, `analytics/schema.sql`, `analytics/README.md`. Independent of Task 1. No `wrangler`, no `npm install`, no network. Do not stage `analytics/wrangler.toml` or `analytics/package-lock.json`.

- [ ] **Step 1: Failing tests**

`test/telemetry.test.js`, `buildRun` test: fixture gets `stars: 2`; expected record gets `stars: 2` right after `level`; add `assert.equal(buildRun({ ...run, stars: undefined }, game, ev, 31000, 1700000000000).stars, null);`.

`test/analytics.test.js`: the `runFacts` key-set assertion becomes fourteen keys — insert `'stars'` in sorted position (after `'score'`); add pass-through (`{ ...rec, stars: 3 }` → `out.stars === 3`) and missing → `null`; extend the validator cross-check with `assert.ok(validateRun(runFacts({ ...rec, mode: 'campaign', cause: 'won', level: 7, stars: 3 }, device)), 'a three-star win is accepted');` (use whatever device literal that test already uses). Rename the test title's "thirteen" to "fourteen".

`analytics/test/validate.test.js` — append:

```js
test('stars: 0-3 for a campaign run, null otherwise, nothing else', () => {
  const won = { ...good, mode: 'campaign', cause: 'won', level: 7, stars: 3 };
  assert.equal(validateRun(won).stars, 3);
  assert.equal(validateRun({ ...won, stars: 0 }).stars, 0);
  assert.equal(validateRun({ ...good, stars: null }).stars, null);
  assert.equal(validateRun(good).stars, null, 'missing stars are stored as null');
  assert.equal(validateRun({ ...won, stars: 4 }), null);
  assert.equal(validateRun({ ...won, stars: -1 }), null);
  assert.equal(validateRun({ ...won, stars: '3' }), null);
  assert.equal(Object.keys(validateRun(won)).length, 14, 'thirteen fields plus stars');
});
```

- [ ] **Step 2: Run to verify failure** — `node --test test/telemetry.test.js test/analytics.test.js analytics/test/validate.test.js` → the new assertions fail.

- [ ] **Step 3: `src/main.js`** — in `onGameOver`, right after the block that computes `verdict` (`let verdict = null; if (level) { … }`) and before `run.verdict = verdict;`, add `run.stars = verdict ? verdict.stars : null; // travels with the record so /stats can show what humans earn`. Nothing else changes in `main.js`.

- [ ] **Step 4: `src/telemetry.js`** — in `buildRun`, after `level: run.level ?? null,` add `stars: run.stars ?? null,`. Record comment: add `stars: 0-3|null` after `level`.

- [ ] **Step 5: `src/analytics.js`** — in `runFacts`, after `level: rec.level ?? null,` add `stars: rec.stars ?? null,`. Update the comment's field count ("fourteen").

- [ ] **Step 6: `analytics/src/validate.js`** — add `|| !optionalInt(x.stars, 0, 3)` to the line that checks `firstMergeMs` and `level`; in the returned object add `stars: x.stars ?? null, // 0-3 for a campaign run` after `level`.

- [ ] **Step 7: `analytics/schema.sql`** — after `level INTEGER,` add `stars INTEGER,`.

- [ ] **Step 8: `analytics/src/worker.js`** — INSERT gains `stars` as the fourteenth column and `?14` bound to `r.stars`:

```js
        `INSERT INTO runs (day_since, days_played, first_of_day, mode, difficulty, score, best_tile,
                           best_combo, duration_ms, eaten, first_merge_ms, cause, level, stars)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
      ).bind(r.daySince, r.daysPlayed, r.firstOfDay, r.mode, r.difficulty, r.score, r.bestTile,
             r.bestCombo, r.durationMs, r.eaten, r.firstMergeMs, r.cause, r.level, r.stars).run();
```

The per-level query adds the three-star count:

```js
          many(`SELECT level, COUNT(*) AS runs, SUM(CASE WHEN cause = 'won' THEN 1 ELSE 0 END) AS wins,
                       SUM(CASE WHEN stars = 3 THEN 1 ELSE 0 END) AS three
                FROM runs WHERE mode = 'campaign' AND level IS NOT NULL GROUP BY level ORDER BY level`),
```

and the response maps it: `levels: levels.map(r => ({ level: r.level, runs: r.runs, wins: r.wins || 0, threeStars: r.three || 0 })),`.

- [ ] **Step 9: `analytics/README.md`** — the "Upgrading an existing deployment" section now lists both columns:

```markdown
## Upgrading an existing deployment (once — campaign, 2026-09-14/15)

The game now sends campaign runs (`mode: 'campaign'`, `cause: 'won'`, a `level`, and the `stars`
the run earned). A Worker deployed before this rejects them, so redeploy **before** pushing the
game. Each `ALTER TABLE` runs once; a second run fails with "duplicate column name" — if you
already added `level`, run only the `stars` line.

1. `npx wrangler d1 execute number-snake-analytics --remote --command "ALTER TABLE runs ADD COLUMN level INTEGER"`
2. `npx wrangler d1 execute number-snake-analytics --remote --command "ALTER TABLE runs ADD COLUMN stars INTEGER"`
3. `npm run deploy`

A fresh install gets both columns from `schema.sql` and needs only step 3.
```

In the "Read the numbers" table, the `levels` row becomes `per level: { level, runs, wins, threeStars } — where the win rate collapses is the level to tune; threeStars says whether the third star is earned by anyone`.

- [ ] **Step 10: Verify** — `node --test` → all green; `node --check src/main.js src/telemetry.js src/analytics.js analytics/src/validate.js analytics/src/worker.js`. Offline Worker smoke in your scratchpad with a stub `env.DB` (`prepare()` → `{ bind: (...a) => ({ run: async () => { bound = a; } }), first: async () => ({ n: 2, w: 1, ms: 40000, tile: 64 }), all: async () => ({ results: [{ level: 1, runs: 5, wins: 3, three: 1 }] }) }`): a campaign POST → `bound.length === 14`, `bound[13] === 3`; a free POST → `bound[13] === null`; `/stats` → `levels[0].threeStars === 1`.

- [ ] **Step 11: Commit**

```bash
git add src/main.js src/telemetry.js test/telemetry.test.js src/analytics.js test/analytics.test.js analytics/src/validate.js analytics/test/validate.test.js analytics/src/worker.js analytics/schema.sql analytics/README.md
git commit -m "feat(analytics): a campaign run carries the stars it earned; /stats shows three-star rates per level" -- src/main.js src/telemetry.js test/telemetry.test.js src/analytics.js test/analytics.test.js analytics/src/validate.js analytics/test/validate.test.js analytics/src/worker.js analytics/schema.sql analytics/README.md
```

---

### Task 3: Retune the campaign on the new spawn window

**Files:** modify `src/campaign.js`, `tools/simulate.js`, and — only if the Endless check demands it — `src/constants.js` (the three `decay` values). Needs Task 1 committed. Nothing here is under `node --test` beyond the structural invariants in `test/campaign.test.js`, which must stay green.

- [ ] **Step 1: Structural changes in `LEVELS`** (starting values; the calibration below may move the numbers):
  - Level 6: `stars: [chain(3), tile(64)]` (was `[tile(64), tile(128)]`).
  - Level 7: `goal: chain(4)`, `stars: [eats(30), tile(64)]` (was `goal: tile(128)`, `stars: [eats(40), chain(4)]`).
  - Level 9: `stars: [eats(20), tile(64)]` (was `[eats(20), tile(128)]`).
  - Level 11: `obstacleEvery: 15` (was 10), `stars: [chain(4), tile(64)]` (was `[tile(64), tile(128)]`).
  - Everything else unchanged for now. `node --test test/campaign.test.js` must pass (no `tile` star on a `tile` goal; no `eats` star on a `collect` goal).

- [ ] **Step 2: The simulator reports candidate hit rates** — in `tools/simulate.js`'s `summarizeLevel`, after the existing columns, print among wins the hit rates for `tile ≥ 64 / 128 / 256` and `chain ≥ 3 / 4 / 5`, so a `tile`/`chain` star can be chosen by measurement:

```js
  const hit = (pred) => (wins.length ? Math.round(100 * wins.filter(pred).length / wins.length) : null);
  const cand = `  tile≥64/128/256 ${fmt(hit(r => r.bestTile >= 64))}/${fmt(hit(r => r.bestTile >= 128))}/${fmt(hit(r => r.bestTile >= 256))}%`
    + `  chain≥3/4/5 ${fmt(hit(r => r.bestCombo >= 3))}/${fmt(hit(r => r.bestCombo >= 4))}/${fmt(hit(r => r.bestCombo >= 5))}%`;
```

and append `cand` to the printed row (widen the header line accordingly). `node --check tools/simulate.js`; `node tools/simulate.js --campaign=1 --runs=50` prints the new columns.

- [ ] **Step 3: Endless sanity first** — `node tools/simulate.js --runs=300 --level=classic` and `--level=frenzy` and `--level=chill`. Read the greedy policy's median best tile. Target: Classic 128 (accept 64–256), Frenzy 64 (accept 32–128), Chill 256 (accept 128–512). If a level's median is above its band, lower that difficulty's `decay` in `src/constants.js` by 0.1 and re-run (at most twice); if below, raise it by 0.05 (at most twice). Record the final medians.

- [ ] **Step 4: Calibrate the campaign** — `node tools/simulate.js --campaign --runs=300`, then apply, level by level, in this order, at most two rounds:
  1. **Goal vs band.** Bot win-rate bands: act 1 40–80 %, act 2 20–50 %, act 3 10–30 %. Above the band → raise the goal one notch (`tile` 64 → 128 → 256; `chain` +1; `collect` +10). Below the band → first ease `obstacleEvery` one notch (10 → 15 → 20; `0` stays `0`), and if still below after re-running, lower the goal one notch. Level 1 is never changed. Level 12 stays `speed: 'frenzy'`; if after both levers it is still under 10 %, report it and stop (the orchestrator decides).
  2. **`eats ≤` stars:** ★★ = p50 of eats among wins rounded UP to the nearest 2; ★★★ = p20 likewise.
  3. **`time ≤` stars (★★★ only):** p50 of seconds among wins × 1.4, rounded UP to the nearest 5.
  4. **`tile ≥` and `chain ≥` stars:** pick, from the candidate columns, the value whose hit rate among wins is nearest 20 % and within 15–30 %; if none is within the band, take the nearest; never pick a `tile` star ≥ the level's own `tile` goal, and a `tile` star on a `collect`/`chain` level may be any of 64/128/256. Keep ★★ easier than ★★★ (if both stars are the same type, ★★ gets the more frequent value).
  5. Levels with fewer than 10 wins: leave thresholds, flag.
  Re-run after each round; paste the final table (all columns) into your report, plus the full old → new list for every field you changed.

- [ ] **Step 5: Verify** — `node --test` → all green; `node --check src/campaign.js tools/simulate.js src/constants.js`.

- [ ] **Step 6: Commit**

```bash
git add src/campaign.js tools/simulate.js src/constants.js
git commit -m "tune(campaign): recalibrated on the spawn window; level 7 chains, level 11 breathes, every star is measured" -- src/campaign.js tools/simulate.js src/constants.js
```

(Drop `src/constants.js` from both lists if you did not change it.)

---

### Task 4: Track the Worker's binding and lockfile

**Files:** commit `analytics/wrangler.toml` (already modified with the real `database_id`) and `analytics/package-lock.json` (untracked). Independent.

- [ ] **Step 1:** `git diff -- analytics/wrangler.toml` shows exactly one changed line, `database_id = "<uuid>"` replacing the placeholder. `analytics/package-lock.json` exists and `analytics/node_modules/` is ignored (`git check-ignore analytics/node_modules`). No secrets in either file (`grep -i "key\|secret\|token" analytics/wrangler.toml` → nothing).

- [ ] **Step 2: Commit**

```bash
git add analytics/wrangler.toml analytics/package-lock.json
git commit -m "chore(analytics): track the D1 binding and the lockfile so a redeploy is reproducible" -- analytics/wrangler.toml analytics/package-lock.json
```

Update `analytics/README.md`'s deploy step 3 text (Task 2 owns the README; if Task 2 is still running, leave the README to Task 5) so it says the id is already in `wrangler.toml` for this repo and only a fresh database needs the paste.

---

### Task 5: Documentation follows the numbers

**Files:** modify `docs/PLAYTEST.md`, `docs/superpowers/specs/2026-09-14-campaign-design.md` (§3 table, §8 one sentence), `docs/superpowers/specs/2026-06-30-number-snake-design.md` (one pointer line in §5), `analytics/README.md` (deploy step 3 wording, if Task 4 left it). Needs Task 3.

- [ ] `docs/PLAYTEST.md`: new subsection **"How tiles appear (2026-09-15)"** under the levels/knobs area: the window rule with the four-row table (biggest piece → window), the flatter decay, why it plays well (the ladder after a mis-eat; dead weight still exists), knobs `span`/`decay` per difficulty with their final values, the Endless medians from Task 3 step 3; the twelve-level table and the calibration table replaced with Task 3's final numbers (read `src/campaign.js`; paste the simulator table from Task 3's report, including the new candidate columns if they fit, else the main columns); `/stats` `levels` row gains `threeStars`; "Testing shortcuts" unchanged; title stays v0.3 with "· spawn window" appended.
- [ ] Campaign spec §3 table = `LEVELS` field for field; §8 gains: "Recalibrated 2026-09-15 on the spawn window (spec `2026-09-15-spawn-window-and-retune-design.md`): win-rate bands per act, measured tile/chain stars."
- [ ] Original spec §5: append one line: "**2026-09-15:** the window is now the top `span` powers of two of the biggest piece with a flatter decay — see `2026-09-15-spawn-window-and-retune-design.md`."
- [ ] Commit: `git add docs/PLAYTEST.md docs/superpowers/specs/2026-09-14-campaign-design.md docs/superpowers/specs/2026-06-30-number-snake-design.md analytics/README.md && git commit -m "docs: the spawn window, the recalibrated campaign, and three-star rates in /stats" -- <same files>`.

---

### Task 6: Final review, push, live check (orchestrator + author)

- [ ] Final read-only review of `58b34fb..HEAD` against the two specs: `pickValue` window semantics and the callers pass `span`; every `DIFFICULTIES` entry has `span`/`decay` inside the bands; `LEVELS` equals the spec table and the PLAYTEST table; `stars` flows `onGameOver → buildRun → runFacts → validateRun → INSERT (14) → /stats threeStars`; README lists both `ALTER TABLE`s; `wrangler.toml`/lockfile committed; `node --test` green; simulator runs.
- [ ] Push `main`; poll GitHub Pages until `src/board.js` served contains `span` and `src/campaign.js` matches HEAD; open the live page, confirm the map, no console errors.
- [ ] Author: run the two `ALTER TABLE`s and `npm run deploy` from `analytics/` (README). Until then campaign runs are rejected by the old Worker.

---

## Self-Review

- **Spec coverage:** §2 window + knobs → Task 1 (+ Task 3 step 3 decays); §3 structural changes, bands, star rules, level 12 stays Frenzy → Task 3; §4 stars end to end + README → Task 2; §5 housekeeping → Task 4; §6 criteria → Task 3 report + Task 5 docs.
- **Type consistency:** `pickValue(rng, maxValue, decay, base, span)` / `spawnTile(…, decay, span)` / `refill(…, maxTiles, decay, span)` (Task 1) match `game.js`'s calls; `cfg.span`/`cfg.decay` exist on every difficulty and flow through `cfgFor` (spread) to campaign levels; `run.stars` (Task 2 main.js) → `buildRun` `stars` → `runFacts` `stars` → `validateRun` `stars` → bind `?14`; the simulator's `runLevel` reads `bestTile`/`bestCombo` already, so the candidate columns (Task 3) need no new data.
- **Placeholder scan:** none; the only judgment left to an agent is the calibration procedure, spelled out with bands, notches and rounding.
