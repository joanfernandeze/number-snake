# Difficulty Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementation subagents run on **Sonnet**; each task is sized for a fresh subagent with zero prior context.

**Goal:** Three difficulty levels that change both the speed and what spawns, and a speed ramp that is actually felt during a run.

**Why:** the ramp keys off score. Score arrives late and in lumps, so with `halfLifeScore` 300 and an average run scoring 549, a whole run travels only 355 ms → 185 ms per cell, and most of that time is spent above 270 ms. Five rounds of hand-tuning could not fix that, because the acceleration was placed where the run has already ended. Measured over 300 simulated runs, a run eats **58 tiles**. Eating grows steadily with time played, so keying the ramp to tiles eaten spreads the climb across the whole run.

**Architecture:** what varies by difficulty moves out of the global `TIMING`/`SPAWN` constants into a `DIFFICULTIES` table, and the chosen entry is threaded through `createGame(rng, cfg)` as `game.cfg`. Nothing reads a mutable global, so tests and the simulator can run all three levels side by side without save/restore dances.

**Tech Stack:** unchanged (HTML5 Canvas, vanilla ES modules, `node --test`, no build step, no dependencies).

**The three levels** (ms per cell, measured against tiles eaten):

| Tiles eaten | Chill | Classic | Frenzy |
| ----------- | ----- | ------- | ------ |
| 0           | 360   | 300     | 240    |
| 10          | 307   | 230     | 165    |
| 30          | 244   | 161     | 109    |
| 58 (a typical run) | 204 | 130 | 93 |

| Knob                 | Chill  | Classic | Frenzy |
| -------------------- | ------ | ------- | ------ |
| Tiles on the board   | 4      | 3       | 2      |
| Spawn window         | `head` | `max`   | `max`  |
| Low-value bias (decay) | 0.55 | 0.45    | 0.35   |

**Dependency order:** Task 1 first. Tasks 2 and 3 are independent of each other and both need 1. Task 4 needs 1, 2 and 3. Task 5 is the orchestrator's.

---

## File Structure

```
src/constants.js     MODIFY  DIFFICULTIES + DEFAULT_DIFFICULTY; TIMING and SPAWN keep only
                             what every level shares                          (Task 1)
src/board.js         MODIFY  decay threaded through spawnTile and refill      (Task 1)
src/game.js          MODIFY  game.cfg, game.eaten, targetInterval(eaten, cfg) (Task 1)
test/*.test.js       MODIFY  the above                                        (Task 1)
src/telemetry.js     MODIFY  the run record carries the difficulty            (Task 2)
tools/simulate.js    MODIFY  compare the three levels                         (Task 3)
index.html           MODIFY  a three-button level row                         (Task 4)
style.css            MODIFY  its styling                                      (Task 4)
src/main.js          MODIFY  selection, persistence, ramp by eaten            (Task 4)
docs/PLAYTEST.md     MODIFY  levels and the new baseline                      (Task 5)
```

---

### Task 1: Difficulty config threaded through the engine

**Files:** modify `src/constants.js`, `src/board.js`, `src/game.js`, `test/game.test.js`, `test/board.test.js`

- [x] **Step 1: Write the failing tests**

In `test/game.test.js`, change the constants import to `import { SPAWN, TIMING, START, DIFFICULTIES, DEFAULT_DIFFICULTY } from '../src/constants.js';` and replace the test named `'tickInterval starts at the configured gentle tick and clamps at the floor'` (or whatever the current `targetInterval` test is called — search for `targetInterval`) with:

```js
test('targetInterval starts at the level opening speed and approaches its floor', () => {
  for (const cfg of Object.values(DIFFICULTIES)) {
    assert.equal(targetInterval(0, cfg), cfg.tickStartMs);
    const half = targetInterval(cfg.halfLifeEats, cfg);
    const gap = cfg.tickStartMs - cfg.tickFloorMs;
    assert.ok(Math.abs(half - (cfg.tickFloorMs + gap / 2)) < 1e-9, `${cfg.name} half life`);
    assert.ok(targetInterval(10000, cfg) > cfg.tickFloorMs, 'the floor is an asymptote');
    assert.ok(targetInterval(10000, cfg) < cfg.tickFloorMs + 1, 'and it gets there');
  }
});

test('targetInterval keys off tiles eaten, so the climb is spread across the run', () => {
  const cfg = DIFFICULTIES.classic;
  // A typical run eats about 58 tiles: the interval must move materially over that span.
  assert.ok(targetInterval(58, cfg) < targetInterval(0, cfg) * 0.5, 'more than twice as fast by the end');
  assert.ok(targetInterval(10, cfg) < targetInterval(0, cfg), 'and it is already moving early');
});

test('the three levels are ordered: Chill is the gentlest, Frenzy the sharpest', () => {
  const { chill, classic, frenzy } = DIFFICULTIES;
  for (const eaten of [0, 10, 30, 58]) {
    assert.ok(targetInterval(eaten, chill) > targetInterval(eaten, classic), `chill slower at ${eaten}`);
    assert.ok(targetInterval(eaten, classic) > targetInterval(eaten, frenzy), `frenzy faster at ${eaten}`);
  }
  assert.ok(chill.maxTiles > classic.maxTiles && classic.maxTiles > frenzy.maxTiles);
  assert.ok(chill.decay > classic.decay && classic.decay > frenzy.decay);
  assert.equal(chill.window, 'head', 'Chill never lets the climb stall');
});

test('createGame carries its level and counts what it eats', () => {
  const g = createGame(createRng(1));
  assert.equal(g.cfg, DIFFICULTIES[DEFAULT_DIFFICULTY], 'a default level when none is given');
  assert.equal(g.eaten, 0);
  assert.equal(g.board.tiles.length, g.cfg.maxTiles);
  const frenzy = createGame(createRng(1), DIFFICULTIES.frenzy);
  assert.equal(frenzy.cfg, DIFFICULTIES.frenzy);
  assert.equal(frenzy.board.tiles.length, DIFFICULTIES.frenzy.maxTiles, 'fewer tiles on Frenzy');
});

test('eating raises the eaten count and refills to the level tile count', () => {
  const g = createGame(createRng(1), DIFFICULTIES.frenzy);
  startRun(g);
  g.snake.cells = [{ x: 3, y: 5 }];
  g.snake.values = [2];
  g.snake.direction = { ...UP }; g.snake.queue = [];
  g.board.tiles = [{ x: 3, y: 4, value: 2 }];
  step(g);
  assert.equal(g.eaten, 1);
  assert.equal(g.board.tiles.length, DIFFICULTIES.frenzy.maxTiles);
  step(g);
  assert.equal(g.eaten, 1, 'a plain move does not count as eating');
});

test("Chill's head window keeps every spawned tile reachable from the head", () => {
  const g = createGame(createRng(3), DIFFICULTIES.chill);
  startRun(g);
  g.snake.cells = [{ x: 3, y: 5 }, { x: 3, y: 6 }];
  g.snake.values = [2, 64];
  g.snake.direction = { ...UP }; g.snake.queue = [];
  g.board.tiles = [{ x: 3, y: 4, value: 2 }];
  step(g); // eat 2 onto 2 -> head 4, body 64
  assert.deepEqual(g.snake.values, [4, 64]);
  assert.ok(g.board.tiles.every(t => t.value <= 4), `tiles ${JSON.stringify(g.board.tiles)}`);
});
```

Delete any existing test that mutates `SPAWN.window` with a save/restore (search for `SPAWN.window =`), since the window is now part of the level and the test above covers it.

In `test/board.test.js`, append:

```js
test('refill and spawnTile take their tile count and bias from the caller', () => {
  const board = createBoard();
  refill(board, createRng(2), 8, [], 5);
  assert.equal(board.tiles.length, 5, 'the caller decides how many tiles');
  const steep = createBoard(), flat = createBoard();
  refill(steep, createRng(7), 64, [], 40, 0.2);
  refill(flat, createRng(7), 64, [], 40, 0.8);
  const big = (b) => b.tiles.filter(t => t.value >= 16).length;
  assert.ok(big(flat) > big(steep), `a flatter decay spawns more high tiles: ${big(flat)} vs ${big(steep)}`);
});
```

- [x] **Step 2: Run to verify failure** — `node --test test/game.test.js test/board.test.js` → FAIL (`DIFFICULTIES` undefined, `targetInterval` takes one argument, `refill` ignores decay).

- [x] **Step 3: Implement `src/constants.js`**

Replace the `TIMING` and `SPAWN` blocks with:

```js
// What every level shares. Anything that differs between levels lives in DIFFICULTIES.
export const TIMING = {
  smoothTauMs: 1200,    // a change in target speed eases in over roughly this long
  turnEarlyFrac: 0.55,  // a queued turn may fire its tick once this much of the slide has played
};

export const SPAWN = {
  baseValue: 2,       // smallest tile value
};

// Speed is keyed to tiles eaten, not to score: eating grows steadily with time played,
// while score arrives late and in lumps, so a score-keyed ramp put the whole climb after
// the run was effectively over. A typical run eats about 58 tiles.
export const DIFFICULTIES = {
  chill: {
    key: 'chill', name: 'Chill',
    tickStartMs: 360, tickFloorMs: 180, halfLifeEats: 20,
    maxTiles: 4, decay: 0.55, window: 'head',
  },
  classic: {
    key: 'classic', name: 'Classic',
    tickStartMs: 300, tickFloorMs: 120, halfLifeEats: 14,
    maxTiles: 3, decay: 0.45, window: 'max',
  },
  frenzy: {
    key: 'frenzy', name: 'Frenzy',
    tickStartMs: 240, tickFloorMs: 90, halfLifeEats: 10,
    maxTiles: 2, decay: 0.35, window: 'max',
  },
};

export const DEFAULT_DIFFICULTY = 'classic';
export const DIFFICULTY_KEY = 'numberSnake.difficulty';
```

Leave `GRID`, `START`, the palette, `STORAGE_KEY`, `INPUT`, `FX`, `DEATH`, `TELEMETRY` and `UI` exactly as they are.

- [x] **Step 4: Implement `src/board.js`**

Change the import to `import { GRID, SPAWN } from './constants.js';` (unchanged) and thread the bias and the count through:

```js
// Spawn one tile on a random empty cell. Returns the tile, or null if the board is full.
export function spawnTile(board, rng, maxValue, snakeCells, decay) {
  const empties = [];
  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) {
      if (!isOccupied(board, snakeCells, x, y)) empties.push({ x, y });
    }
  }
  if (empties.length === 0) return null;
  const cell = empties[randInt(rng, empties.length)];
  const tile = { x: cell.x, y: cell.y, value: pickValue(rng, maxValue, decay) };
  board.tiles.push(tile);
  return tile;
}

// The tile count and the low-value bias both come from the level, so the caller passes them.
export function refill(board, rng, maxValue, snakeCells, maxTiles, decay) {
  while (board.tiles.length < maxTiles) {
    if (!spawnTile(board, rng, maxValue, snakeCells, decay)) break;
  }
}
```

and change `pickValue`'s signature so the default no longer reads a removed constant:

```js
export function pickValue(rng, maxValue, decay = 0.45, base = SPAWN.baseValue) {
```

- [x] **Step 5: Implement `src/game.js`**

Change the constants import to:

```js
import { GRID, TIMING, START, DIFFICULTIES, DEFAULT_DIFFICULTY } from './constants.js';
```

Replace `targetInterval` and `spawnRef` with:

```js
// The interval the run is climbing toward after eating this many tiles. The gap to the
// floor halves every cfg.halfLifeEats tiles, so the climb is spread evenly across a run
// instead of arriving with the late, lumpy points. It approaches the floor without ever
// reaching it, so there is no wall where the climb suddenly stops.
export function targetInterval(eaten, cfg = DIFFICULTIES[DEFAULT_DIFFICULTY]) {
  const gap = cfg.tickStartMs - cfg.tickFloorMs;
  return cfg.tickFloorMs + gap * Math.pow(2, -Math.max(0, eaten) / cfg.halfLifeEats);
}

// Upper bound of the tile-value window (spec §5). 'max' keeps every value the player has
// ever built reachable; 'head' tracks what the head can use right now, so the climb cannot
// stall — that is what makes Chill gentle.
function spawnRef(game) {
  return game.cfg.window === 'head' ? game.snake.values[0] : Snake.maxValue(game.snake);
}
```

`smoothInterval`, `tickDue` and `nextTickTime` are unchanged.

Replace `createGame` with:

```js
export function createGame(rng, cfg = DIFFICULTIES[DEFAULT_DIFFICULTY]) {
  const board = Board.createBoard();
  const start = { x: Math.floor(GRID.cols / 2), y: Math.floor(GRID.rows / 2) };
  const snake = Snake.createSnake(START.snakeLength, START.snakeValue, start, START.direction);
  const game = {
    rng, board, snake, cfg,
    started: false,   // the run does not move until the player's first input
    ticks: 0,         // ticks stepped since the run started
    eaten: 0,         // tiles eaten: the clock the speed ramp runs on
    score: 0,
    bestTile: Snake.maxValue(snake),
    bestCombo: 0,
    over: false,
    lastCause: null,
  };
  Board.refill(board, rng, spawnRef(game), snake.cells, cfg.maxTiles, cfg.decay);
  return game;
}
```

In `step`, inside the `if (willEat)` branch, add `game.eaten += 1;` immediately after the `Snake.eat` call, and change the refill line to pass the level's knobs:

```js
    Board.refill(b, game.rng, spawnRef(game), s.cells, game.cfg.maxTiles, game.cfg.decay);
```

- [x] **Step 6: Run the tests** — `node --test test/game.test.js test/board.test.js` → all pass. The full suite will still fail in `main.js`-adjacent places only if something imports a removed constant; check with `grep -rn "TIMING.tickStartMs\|SPAWN.maxTiles\|SPAWN.decay\|SPAWN.window\|halfLifeScore" src tools test` and report anything left. `src/main.js` and `tools/simulate.js` are fixed in later tasks, so failures there are expected; note them and move on.

- [x] **Step 7: Commit**

```bash
git add src/constants.js src/board.js src/game.js test/game.test.js test/board.test.js
git commit -m "feat(difficulty): three levels; the speed ramp keys off tiles eaten" -- src/constants.js src/board.js src/game.js test/game.test.js test/board.test.js
```

---

### Task 2: The run record remembers its level

**Files:** modify `src/telemetry.js`, `test/telemetry.test.js`

**Why:** with three levels, runs mixed together tell us nothing. Every record must say which level it was.

- [x] **Step 1: Write the failing tests**

In `test/telemetry.test.js`, update the `buildRun` test to pass and expect the level, and add a `formatStats` case. Replace the existing `buildRun` test with:

```js
test('buildRun assembles the record from the live run and game', () => {
  const run = { session: 's1', t0: 1000, firstMergeMs: 12000 };
  const game = {
    cfg: { key: 'frenzy' }, ticks: 40, eaten: 22, score: 310,
    bestTile: 64, bestCombo: 3, lastCause: { type: 'self' },
  };
  assert.deepEqual(buildRun(run, game, 61000, 1700000000000), {
    session: 's1', difficulty: 'frenzy', firstMergeMs: 12000, durationMs: 60000,
    ticks: 40, eaten: 22, score: 310, bestTile: 64, bestCombo: 3,
    cause: 'self', endedAt: 1700000000000,
  });
});
```

(If the existing record has different field names, keep them and only add `difficulty` and `eaten` — read the current `buildRun` first and mirror it.)

Append:

```js
test('summarize and formatStats report the levels that were played', () => {
  const runs = [
    { session: 'a', difficulty: 'classic', bestTile: 32, durationMs: 40000, cause: 'self' },
    { session: 'a', difficulty: 'classic', bestTile: 64, durationMs: 60000, cause: 'wall' },
    { session: 'a', difficulty: 'frenzy', bestTile: 16, durationMs: 20000, cause: 'self' },
  ];
  const s = summarize(runs);
  assert.deepEqual(s.difficulties, { classic: 2, frenzy: 1 });
  assert.ok(formatStats(s).includes('levels: classic 2 · frenzy 1'), formatStats(s));
});

test('summarize copes with records from before levels existed', () => {
  const s = summarize([{ session: 'a', bestTile: 8, durationMs: 1000, cause: 'wall' }]);
  assert.deepEqual(s.difficulties, {});
  assert.ok(formatStats(s).includes('levels: –'), formatStats(s));
});
```

- [x] **Step 2: Run to verify failure** — `node --test test/telemetry.test.js` → FAIL.

- [x] **Step 3: Implement** — in `src/telemetry.js`:

In `buildRun`, add `difficulty: game.cfg ? game.cfg.key : 'unknown',` right after `session`, and `eaten: game.eaten,` next to `ticks`.

In `summarize`, add a tally alongside the existing `causes` tally:

```js
  const difficulties = {};
  for (const r of runs) if (typeof r.difficulty === 'string') difficulties[r.difficulty] = (difficulties[r.difficulty] || 0) + 1;
```

and include `difficulties,` in the returned object.

In `formatStats`, add one line to the array, immediately before the `deaths:` line:

```js
    `levels: ${Object.entries(s.difficulties).length ? Object.entries(s.difficulties).map(([k, v]) => `${k} ${v}`).join(' · ') : '–'}`,
```

If `formatStats` has a test asserting a fixed number of lines, update that count.

- [x] **Step 4: Run** — `node --test test/telemetry.test.js` → all pass.

- [x] **Step 5: Commit**

```bash
git add src/telemetry.js test/telemetry.test.js
git commit -m "feat(telemetry): every run records the level it was played on" -- src/telemetry.js test/telemetry.test.js
```

---

### Task 3: The simulator compares the three levels

**Files:** modify `tools/simulate.js`

- [x] **Step 1: Implement**

Read the file first. It currently mutates `SPAWN` from command-line flags and runs two policies. Replace the argument handling and the bottom of the file so that instead of mutating globals it passes a level config to `createGame`, and reports all three levels for both policies.

- Change the imports to add `import { DIFFICULTIES } from '../src/constants.js';` and drop the `SPAWN` import and every line that mutates it.
- `runOne(seed, policy, cfg)` passes `cfg` to `createGame(createRng(seed), cfg)`.
- Add tiles eaten to the per-run result: `eaten: g.eaten`.
- Keep `--runs=` with its existing validation. Add `--level=chill|classic|frenzy` which, when given, runs only that level; without it, run all three.
- In `summarize`, add a line reporting `avg tiles eaten` and `interval at the median run's tile count`, computed as `targetInterval(medianEaten, cfg)`, so the report shows the speed a real run actually finishes at. Import `targetInterval` from `../src/game.js`.
- Print a config header per level: `=== LEVEL Classic (start 300ms, floor 120ms, half-life 14 tiles, 3 tiles, window max) ===`.

- [x] **Step 2: Run** — `node tools/simulate.js --runs=200` and capture the whole output. Then `node tools/simulate.js --runs=50 --level=frenzy`, and `node tools/simulate.js --level=nope` (must exit 1 with a usage message).

- [x] **Step 3: Report the table** of median best tile, median run ticks, average tiles eaten and the finishing interval for each level and each policy. Do not tune anything; that is the orchestrator's call.

- [x] **Step 4: Commit**

```bash
git add tools/simulate.js
git commit -m "tools: compare the three levels instead of mutating globals" -- tools/simulate.js
```

---

### Task 4: Level selector and the ramp in `main.js`

**Files:** modify `index.html`, `style.css`, `src/main.js`

- [x] **Step 1: Markup** — in `index.html`, immediately after the `<p id="hint">…</p>` line, add:

```html
    <div id="levels" role="group" aria-label="Difficulty">
      <button type="button" data-level="chill">Chill</button>
      <button type="button" data-level="classic">Classic</button>
      <button type="button" data-level="frenzy">Frenzy</button>
    </div>
```

- [x] **Step 2: Styles** — append to `style.css`:

```css
#levels {
  display: flex; gap: 8px; touch-action: none;
}
#levels button {
  min-height: 44px; padding: 8px 16px;
  background: #111935; color: #93a4c3;
  border: 1px solid #263156; border-radius: 999px;
  font-size: 13px; font-weight: 700; letter-spacing: .3px; cursor: pointer;
}
#levels button[aria-pressed="true"] {
  background: #6366f1; color: #fff; border-color: #6366f1;
}
/* Changing level restarts the run, so the row is out of reach while one is in progress. */
#levels.busy { opacity: .35; pointer-events: none; }
```

- [x] **Step 3: Wire it in `src/main.js`**

Add `DIFFICULTIES, DEFAULT_DIFFICULTY, DIFFICULTY_KEY` to the constants import.

After `let best = loadBest();` add:

```js
function loadDifficulty() {
  try {
    const k = localStorage.getItem(DIFFICULTY_KEY);
    if (k && DIFFICULTIES[k]) return k;
  } catch { /* ignore */ }
  return DEFAULT_DIFFICULTY;
}
let difficulty = loadDifficulty();

// The row is dimmed while a run is in progress: picking a level restarts, and losing a
// run to a stray tap on the buttons under the board would be infuriating.
function paintLevels() {
  for (const b of $('levels').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.level === difficulty));
  }
  $('levels').classList.toggle('busy', !!(game && game.started && !game.over));
}
```

In `start()`, pass the level and reset the ramp from it:

```js
  game = Game.createGame(createRng(seed), DIFFICULTIES[difficulty]);
  fx = Fx.createFx();
  motion = { kind: 'none', progress: 1 };
  interval = Game.targetInterval(0, game.cfg);
```

and add `paintLevels();` as the last line of `start()`.

In `frame`, change the target line to key off tiles eaten and the level:

```js
  interval = Game.smoothInterval(interval, Game.targetInterval(game.eaten, game.cfg), dt);
```

and, so the row dims the moment a run begins, call `paintLevels()` right after the `Game.step(game)` result is handled — put it inside the `if (ev.over)` / `else` block's common path by adding this line immediately after the `if/else`:

```js
    if (game.ticks <= 1 || ev.over) paintLevels();
```

Wire the buttons next to the other listeners:

```js
$('levels').addEventListener('click', (e) => {
  const key = e.target && e.target.dataset && e.target.dataset.level;
  if (!key || !DIFFICULTIES[key]) return;
  difficulty = key;
  try { localStorage.setItem(DIFFICULTY_KEY, key); } catch { /* ignore */ }
  start();
});
```

and add `paintLevels();` immediately after the initial `start();` call at the bottom of the file.

- [x] **Step 4: Verify** — `node --test` → all green. `node --check src/main.js`. Confirm every id and `data-level` used by `main.js` exists in `index.html`, and that nothing still reads `game.score` for the ramp (`grep -n "targetInterval" src/main.js`).

- [x] **Step 5: Commit**

```bash
git add index.html style.css src/main.js
git commit -m "feat(ui): pick a level; the ramp follows tiles eaten" -- index.html style.css src/main.js
```

---

### Task 5: Verify, document, publish (orchestrator)

- [x] `node --test` all green; simulator gives a three-level table.
- [x] Browser: the three buttons appear under the hint with Classic selected; picking one restarts into the waiting state; the row dims once the snake is moving; the choice survives a reload; Chill visibly spawns four tiles and Frenzy two; the speed climb is felt within a single run on Frenzy.
- [x] `docs/PLAYTEST.md`: document the levels, say that the playtest runs on **Classic**, and record the new simulator baseline per level.
- [x] Push; Pages redeploys.

---

## Self-Review

- **Root cause covered:** the ramp keys off `game.eaten` (Task 1) and `main.js` feeds it (Task 4), so the climb is spread over the run rather than back-loaded onto late score.
- **Placeholder scan:** every code step carries complete code; every run step names the command and what to expect.
- **Type consistency:** `DIFFICULTIES[key]` objects carry `key, name, tickStartMs, tickFloorMs, halfLifeEats, maxTiles, decay, window` and are read with exactly those names in `game.js` (Task 1), `telemetry.js` (`cfg.key`, Task 2), `simulate.js` (Task 3) and `main.js` (Task 4). `targetInterval(eaten, cfg)` is defined in Task 1 and called with that signature in Tasks 3 and 4. `Board.refill(board, rng, maxValue, snakeCells, maxTiles, decay)` and `Board.spawnTile(board, rng, maxValue, snakeCells, decay)` change in Task 1 and every caller is inside `game.js`, updated in the same task.
- **Ordering hazard:** Task 1 removes `TIMING.tickStartMs` and the `SPAWN` knobs while `src/main.js` and `tools/simulate.js` still reference the old shapes, so the full suite is red between Task 1 and Task 4. Each task states which subset must pass.
