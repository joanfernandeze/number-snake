# Number Snake v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable web prototype of Number Snake — a bounded-grid Snake whose numbered segments merge 2048-style — to test whether the eat → merge → cascade → don't-trap-yourself loop pulls voluntary retries.

**Architecture:** Plain HTML5 Canvas + vanilla **ES modules**, no build step. Pure-logic modules (`rng`, `snake`, `board`, `game`) are unit-tested with Node's built-in test runner (`node --test`, zero dependencies). View/wiring modules (`render`, `input`, `main`) are verified manually in the browser. The snake is modeled as **parallel `cells[]` and `values[]` arrays**: a normal move unshifts a head cell and pops the tail cell (values untouched); an eat unshifts both a head cell and a value; each merge doubles the front value and pops one tail cell — so the snake is always a contiguous chain.

**Tech Stack:** HTML5 Canvas, vanilla JavaScript (ES modules, `.js` + `package.json {"type":"module"}`), Node 18+ for tests, `python -m http.server` (or any static server) to run.

---

## File Structure

```
Number Snake/
  package.json        # {"type":"module"} so .js loads as ESM in Node for tests
  index.html          # canvas + HUD + game-over overlay; loads src/main.js as a module
  style.css           # layout, HUD, overlay
  src/
    constants.js      # ALL tunables: grid, timing/ramp, spawn, start, color palette, storage key
    rng.js            # seedable PRNG (mulberry32) + randInt
    snake.js          # cells/values model: create, direction, move, eat+merge cascade, collisions
    board.js          # grid tiles: create, tileAt, removeTile, pickValue, spawnTile, refill
    game.js           # createGame, step (ties snake+board), tickInterval, scoring/best
    render.js         # canvas draw: board, tiles, snake (color-by-power, glow, slide), HUD, FX, overlay
    input.js          # keyboard + swipe/drag -> direction; swipeDirection pure helper
    main.js           # composition root: rAF loop, restart, localStorage best
  test/
    rng.test.js
    snake.test.js
    board.test.js
    game.test.js
    input.test.js
```

Run the game: from the project folder, `python -m http.server 8000`, then open `http://localhost:8000/`.
Run tests: from the project folder, `node --test`.

---

### Task 1: Project scaffold + constants

**Files:**
- Create: `package.json`
- Create: `src/constants.js`
- Create: `index.html`
- Create: `style.css`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "number-snake",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Create `src/constants.js`** (single source of truth for every tunable; no logic)

```js
export const GRID = { cols: 7, rows: 11 };

export const TIMING = {
  tickStartMs: 200,   // tick interval at score 0 (gentle)
  tickFloorMs: 80,    // fastest tick interval
  tickPerPoint: 0.6,  // ms shaved off the interval per point of score
};

export const SPAWN = {
  maxTiles: 3,        // tiles kept on the board at once
  decay: 0.45,        // geometric weight per value step (lower value = far more common)
  baseValue: 2,       // smallest tile value
};

export const START = {
  snakeLength: 2,
  snakeValue: 2,                 // every starting segment holds this value
  direction: { x: 0, y: -1 },    // moving up (y grows downward on the grid)
};

// Color by power of two: index 0 -> value 2, index 1 -> value 4, ...
export const POWER_COLORS = [
  '#2dd4bf', // 2   teal
  '#3b82f6', // 4   blue
  '#8b5cf6', // 8   purple
  '#ec4899', // 16  pink
  '#f97316', // 32  orange
  '#ef4444', // 64  red
  '#f59e0b', // 128 amber
  '#22c55e', // 256 green
  '#06b6d4', // 512 cyan
  '#a855f7', // 1024 violet
];
export const FALLBACK_COLOR = '#e5e7eb';

export const STORAGE_KEY = 'numberSnake.best';
```

- [ ] **Step 3: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>Number Snake</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div id="app">
    <header id="hud">
      <div class="stat"><span class="label">SCORE</span><span id="score">0</span></div>
      <div class="stat"><span class="label">BEST TILE</span><span id="bestTile">0</span></div>
    </header>
    <canvas id="game" width="420" height="660"></canvas>
    <div id="overlay" class="hidden">
      <div class="panel">
        <h1>Game Over</h1>
        <p>Tile <strong id="ovTile">0</strong> · Score <strong id="ovScore">0</strong> · Combo <strong id="ovCombo">0</strong></p>
        <p class="best">Best tile <strong id="ovBestTile">0</strong> · Best score <strong id="ovBestScore">0</strong></p>
        <button id="playAgain">Play Again</button>
      </div>
    </div>
    <p id="hint">Swipe or use arrow keys. Eat matching numbers to merge up. Don't hit yourself.</p>
  </div>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `style.css`**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  height: 100%;
  background: #0b1020;
  color: #e5e7eb;
  font-family: -apple-system, system-ui, 'Segoe UI', Roboto, sans-serif;
  touch-action: none;
  overflow: hidden;
}
#app {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
}
#hud {
  width: 100%;
  max-width: 420px;
  display: flex;
  justify-content: space-between;
}
.stat { display: flex; flex-direction: column; align-items: flex-start; }
.stat .label { font-size: 11px; letter-spacing: 1px; color: #93a4c3; }
.stat span:last-child { font-size: 26px; font-weight: 800; }
#game {
  width: 100%;
  max-width: 420px;
  height: auto;
  background: #111935;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0,0,0,.5);
  touch-action: none;
}
#hint { font-size: 12px; color: #93a4c3; text-align: center; max-width: 420px; }
#overlay {
  position: fixed; inset: 0;
  background: rgba(5,8,20,.78);
  display: flex; align-items: center; justify-content: center;
}
#overlay.hidden { display: none; }
.panel {
  background: #1a2348; border-radius: 18px; padding: 28px 32px; text-align: center;
  box-shadow: 0 20px 60px rgba(0,0,0,.6);
}
.panel h1 { font-size: 28px; margin-bottom: 12px; }
.panel p { color: #c7d2fe; margin-bottom: 8px; }
.panel .best { color: #93a4c3; font-size: 14px; }
#playAgain {
  margin-top: 16px; padding: 14px 28px; font-size: 18px; font-weight: 700;
  border: none; border-radius: 12px; background: #6366f1; color: white; cursor: pointer;
}
#playAgain:active { transform: scale(.97); }
```

- [ ] **Step 5: Commit**

```bash
git add package.json src/constants.js index.html style.css
git commit -m "chore: scaffold Number Snake project + constants"
```

(If the folder is not a git repo yet, run `git init` first — see the note at the end of the plan.)

---

### Task 2: Seedable RNG

**Files:**
- Create: `src/rng.js`
- Test: `test/rng.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/rng.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, randInt } from '../src/rng.js';

test('same seed produces the same sequence', () => {
  const a = createRng(123), b = createRng(123);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test('different seeds diverge', () => {
  const a = createRng(1), b = createRng(2);
  assert.notEqual(a(), b());
});

test('values are in [0, 1)', () => {
  const r = createRng(42);
  for (let i = 0; i < 100; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test('randInt stays in [0, n)', () => {
  const r = createRng(7);
  for (let i = 0; i < 100; i++) {
    const v = randInt(r, 5);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 5, `randInt ${v} out of range`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/rng.test.js`
Expected: FAIL — cannot find module `../src/rng.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/rng.js
// Seedable PRNG (mulberry32). Deterministic for a given integer seed.
export function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer in [0, n).
export function randInt(rng, n) {
  return Math.floor(rng() * n);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/rng.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rng.js test/rng.test.js
git commit -m "feat: seedable rng"
```

---

### Task 3: Snake creation, direction, movement & collisions

**Files:**
- Create: `src/snake.js`
- Test: `test/snake.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/snake.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSnake, head, length, maxValue,
  setDirection, nextHeadCell, isWall, hitsSelf, move,
} from '../src/snake.js';

const UP = { x: 0, y: -1 }, DOWN = { x: 0, y: 1 }, LEFT = { x: -1, y: 0 }, RIGHT = { x: 1, y: 0 };

test('createSnake builds head + trailing body opposite the direction', () => {
  const s = createSnake(3, 2, { x: 3, y: 5 }, UP); // moving up => body extends downward
  assert.equal(length(s), 3);
  assert.deepEqual(head(s), { x: 3, y: 5 });
  assert.deepEqual(s.cells[1], { x: 3, y: 6 });
  assert.deepEqual(s.cells[2], { x: 3, y: 7 });
  assert.deepEqual(s.values, [2, 2, 2]);
  assert.equal(maxValue(s), 2);
});

test('setDirection ignores a 180-degree reverse when length > 1', () => {
  const s = createSnake(2, 2, { x: 3, y: 5 }, UP);
  setDirection(s, DOWN);
  assert.deepEqual(s.pending, UP); // reverse rejected
  setDirection(s, LEFT);
  assert.deepEqual(s.pending, LEFT); // turn accepted
});

test('nextHeadCell uses the pending direction', () => {
  const s = createSnake(2, 2, { x: 3, y: 5 }, UP);
  setDirection(s, RIGHT);
  assert.deepEqual(nextHeadCell(s), { x: 4, y: 5 });
});

test('isWall detects out-of-bounds', () => {
  assert.equal(isWall({ x: -1, y: 0 }, 7, 11), true);
  assert.equal(isWall({ x: 0, y: 11 }, 7, 11), true);
  assert.equal(isWall({ x: 6, y: 10 }, 7, 11), false);
});

test('move glides the whole snake forward by one cell, values unchanged', () => {
  const s = createSnake(3, 2, { x: 3, y: 5 }, UP);
  s.values = [4, 2, 8];
  move(s); // head goes up to y=4, body follows
  assert.deepEqual(s.cells[0], { x: 3, y: 4 });
  assert.deepEqual(s.cells[1], { x: 3, y: 5 });
  assert.deepEqual(s.cells[2], { x: 3, y: 6 });
  assert.deepEqual(s.values, [4, 2, 8]); // values ride along, order preserved
  assert.equal(length(s), 3);
});

test('hitsSelf allows entering the vacating tail on a normal move', () => {
  // U-shape where the next head cell is the current tail cell
  const s = createSnake(1, 2, { x: 3, y: 5 }, RIGHT);
  s.cells = [{ x: 3, y: 5 }, { x: 3, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }];
  s.values = [2, 2, 2, 2];
  // moving RIGHT from (3,5) -> (4,5) which IS the tail; tail vacates so it's allowed
  assert.equal(hitsSelf(s, { x: 4, y: 5 }, false), false);
  // but if eating (tail stays), the same move would collide
  assert.equal(hitsSelf(s, { x: 4, y: 5 }, true), true);
});

test('hitsSelf detects running into a mid-body cell', () => {
  const s = createSnake(1, 2, { x: 3, y: 5 }, RIGHT);
  s.cells = [{ x: 3, y: 5 }, { x: 3, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }, { x: 5, y: 5 }];
  s.values = [2, 2, 2, 2, 2];
  assert.equal(hitsSelf(s, { x: 4, y: 6 }, false), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/snake.test.js`
Expected: FAIL — cannot find module `../src/snake.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/snake.js
import { GRID } from './constants.js';

// A snake is parallel arrays:
//   cells:  [{x,y}, ...] head-first, always a contiguous path
//   values: [n, ...]     aligned by index to cells
//   direction / pending: current and queued {x,y} unit vectors
export function createSnake(len, value, start, direction) {
  const cells = [], values = [];
  for (let i = 0; i < len; i++) {
    cells.push({ x: start.x - direction.x * i, y: start.y - direction.y * i });
    values.push(value);
  }
  return { cells, values, direction: { ...direction }, pending: { ...direction } };
}

export const head = (s) => s.cells[0];
export const length = (s) => s.cells.length;

export function maxValue(s) {
  let m = 0;
  for (const v of s.values) if (v > m) m = v;
  return m;
}

export function setDirection(s, dir) {
  // Reject an exact 180-degree reverse while there is a body to crash into.
  if (s.cells.length > 1 && dir.x === -s.direction.x && dir.y === -s.direction.y) return;
  s.pending = { x: dir.x, y: dir.y };
}

export function nextHeadCell(s) {
  return { x: s.cells[0].x + s.pending.x, y: s.cells[0].y + s.pending.y };
}

export function isWall(cell, cols = GRID.cols, rows = GRID.rows) {
  return cell.x < 0 || cell.y < 0 || cell.x >= cols || cell.y >= rows;
}

// Would moving the head to `cell` hit the snake's own body?
// On a normal move the tail vacates, so the current tail cell is NOT a hazard.
// On an eat (willEat=true) the snake grows, so every current cell is a hazard.
export function hitsSelf(s, cell, willEat) {
  const last = willEat ? s.cells.length : s.cells.length - 1;
  for (let i = 0; i < last; i++) {
    if (s.cells[i].x === cell.x && s.cells[i].y === cell.y) return true;
  }
  return false;
}

// Normal forward move (no eat): unshift a new head cell, pop the tail. Values untouched.
export function move(s) {
  s.direction = { ...s.pending };
  s.cells.unshift({ x: s.cells[0].x + s.direction.x, y: s.cells[0].y + s.direction.y });
  s.cells.pop();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/snake.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/snake.js test/snake.test.js
git commit -m "feat: snake model, movement, collision detection"
```

---

### Task 4: Eat + cascading merge (the core mechanic)

**Files:**
- Modify: `src/snake.js` (add `eat`)
- Test: `test/snake.test.js` (add cases)

- [ ] **Step 1: Write the failing test** (append to `test/snake.test.js`)

```js
import { eat } from '../src/snake.js';

test('eat with no match grows the snake by one segment at the head', () => {
  const s = createSnake(2, 2, { x: 3, y: 5 }, UP); // cells (3,5),(3,6); values [2,2]
  s.values = [4, 8];
  const r = eat(s, { x: 3, y: 4 }, 2); // eat a 2 onto a head value of 4 -> no merge
  assert.equal(r.merges, 0);
  assert.equal(r.gained, 0);
  assert.equal(length(s), 3);
  assert.deepEqual(s.cells[0], { x: 3, y: 4 });
  assert.deepEqual(s.values, [2, 4, 8]);
});

test('eat with a single match merges, doubles, and pops the tail (net length unchanged)', () => {
  const s = createSnake(2, 2, { x: 3, y: 5 }, UP); // values [2,2]
  const startLen = length(s);
  const r = eat(s, { x: 3, y: 4 }, 2); // [2,2,2] -> front two merge -> [4,2]
  assert.equal(r.merges, 1);
  assert.equal(r.gained, 4);
  assert.equal(length(s), startLen); // +1 eat, -1 merge
  assert.equal(s.values[0], 4);
  assert.deepEqual(head(s), { x: 3, y: 4 });
});

test('eat triggers a cascade of merges from a single bite', () => {
  const s = createSnake(3, 2, { x: 3, y: 5 }, UP);
  s.values = [2, 4, 8]; // head 2
  const r = eat(s, { x: 3, y: 4 }, 2); // [2,2,4,8] -> [4,4,8] -> [8,8] -> [16]
  assert.equal(r.merges, 3);
  assert.equal(r.gained, 4 + 8 + 16);
  assert.deepEqual(s.values, [16]);
  assert.equal(length(s), 1);
  assert.deepEqual(head(s), { x: 3, y: 4 });
  assert.equal(maxValue(s), 16);
});

test('the snake stays a contiguous chain after a merge (tail pops, no gaps)', () => {
  const s = createSnake(3, 2, { x: 3, y: 5 }, UP); // cells (3,5),(3,6),(3,7)
  s.values = [2, 8, 8];
  eat(s, { x: 3, y: 4 }, 4); // [4,2,8,8]; head pair 4!=2 -> no merge here, length 4
  // cells must be contiguous, head-first, no popped gap beyond expected length
  assert.equal(length(s), 4);
  assert.deepEqual(s.cells[0], { x: 3, y: 4 });
  assert.deepEqual(s.cells[3], { x: 3, y: 7 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/snake.test.js`
Expected: FAIL — `eat` is not exported.

- [ ] **Step 3: Write minimal implementation** (add to `src/snake.js`)

```js
// Eat a tile of `value` at the head's next cell, then resolve cascading merges.
// Returns { merges, gained } for scoring and combo tracking.
//   - prepend the new head cell + value (grow by one)
//   - while the front two values are equal: double the front, drop the 2nd value,
//     and pop one tail cell so cells/values stay aligned and contiguous.
export function eat(s, cell, value) {
  s.direction = { ...s.pending };
  s.cells.unshift({ x: cell.x, y: cell.y });
  s.values.unshift(value);
  let merges = 0, gained = 0;
  while (s.values.length > 1 && s.values[0] === s.values[1]) {
    s.values[0] *= 2;
    s.values.splice(1, 1);
    s.cells.pop();
    merges += 1;
    gained += s.values[0];
  }
  return { merges, gained };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/snake.test.js`
Expected: PASS (11 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/snake.js test/snake.test.js
git commit -m "feat: eat with cascading 2048-style merge"
```

---

### Task 5: Board — tiles, value spawning, refill

**Files:**
- Create: `src/board.js`
- Test: `test/board.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/board.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import {
  createBoard, tileAt, removeTile, pickValue, spawnTile, refill,
} from '../src/board.js';

test('createBoard has the given size and no tiles', () => {
  const b = createBoard(7, 11);
  assert.equal(b.cols, 7);
  assert.equal(b.rows, 11);
  assert.deepEqual(b.tiles, []);
});

test('tileAt / removeTile work', () => {
  const b = createBoard(7, 11);
  b.tiles.push({ x: 2, y: 3, value: 4 });
  assert.deepEqual(tileAt(b, 2, 3), { x: 2, y: 3, value: 4 });
  assert.equal(tileAt(b, 0, 0), null);
  removeTile(b, 2, 3);
  assert.equal(tileAt(b, 2, 3), null);
});

test('pickValue never exceeds the current max and is a power of two >= 2', () => {
  const r = createRng(99);
  for (let i = 0; i < 200; i++) {
    const v = pickValue(r, 16);
    assert.ok([2, 4, 8, 16].includes(v), `unexpected value ${v}`);
  }
});

test('pickValue with maxValue 2 only ever returns 2', () => {
  const r = createRng(5);
  for (let i = 0; i < 50; i++) assert.equal(pickValue(r, 2), 2);
});

test('pickValue is weighted toward low values', () => {
  const r = createRng(123);
  let twos = 0, total = 1000;
  for (let i = 0; i < total; i++) if (pickValue(r, 64) === 2) twos++;
  assert.ok(twos / total > 0.4, `expected lots of 2s, got ${twos}/${total}`);
});

test('spawnTile never lands on the snake or another tile', () => {
  const r = createRng(7);
  const b = createBoard(3, 3);
  const snakeCells = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  for (let i = 0; i < 5; i++) spawnTile(b, r, 2, snakeCells);
  for (const t of b.tiles) {
    assert.ok(!snakeCells.some(c => c.x === t.x && c.y === t.y), 'tile on snake');
  }
  // no two tiles share a cell
  const seen = new Set();
  for (const t of b.tiles) {
    const k = `${t.x},${t.y}`;
    assert.ok(!seen.has(k), 'duplicate tile cell');
    seen.add(k);
  }
});

test('refill tops the board up to maxTiles', () => {
  const r = createRng(11);
  const b = createBoard(7, 11);
  refill(b, r, 2, [{ x: 3, y: 5 }], 3);
  assert.equal(b.tiles.length, 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/board.test.js`
Expected: FAIL — cannot find module `../src/board.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/board.js
import { GRID, SPAWN } from './constants.js';
import { randInt } from './rng.js';

export function createBoard(cols = GRID.cols, rows = GRID.rows) {
  return { cols, rows, tiles: [] }; // tiles: [{x, y, value}]
}

export function tileAt(board, x, y) {
  return board.tiles.find(t => t.x === x && t.y === y) || null;
}

export function removeTile(board, x, y) {
  board.tiles = board.tiles.filter(t => !(t.x === x && t.y === y));
}

// Pick a tile value: a power of two from base up to maxValue, weighted toward
// the low end by SPAWN.decay so 2s/4s dominate but high matches still appear.
export function pickValue(rng, maxValue, decay = SPAWN.decay, base = SPAWN.baseValue) {
  const maxExp = Math.max(1, Math.round(Math.log2(maxValue / base)) + 1);
  const weights = [];
  let total = 0;
  for (let e = 1; e <= maxExp; e++) {
    const w = Math.pow(decay, e - 1);
    weights.push(w);
    total += w;
  }
  let r = rng() * total;
  for (let e = 1; e <= maxExp; e++) {
    r -= weights[e - 1];
    if (r <= 0) return base * Math.pow(2, e - 1);
  }
  return base;
}

function isOccupied(board, snakeCells, x, y) {
  if (tileAt(board, x, y)) return true;
  return snakeCells.some(c => c.x === x && c.y === y);
}

// Spawn one tile on a random empty cell. Returns the tile, or null if board is full.
export function spawnTile(board, rng, maxValue, snakeCells) {
  const empties = [];
  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) {
      if (!isOccupied(board, snakeCells, x, y)) empties.push({ x, y });
    }
  }
  if (empties.length === 0) return null;
  const cell = empties[randInt(rng, empties.length)];
  const tile = { x: cell.x, y: cell.y, value: pickValue(rng, maxValue) };
  board.tiles.push(tile);
  return tile;
}

export function refill(board, rng, maxValue, snakeCells, maxTiles = SPAWN.maxTiles) {
  while (board.tiles.length < maxTiles) {
    if (!spawnTile(board, rng, maxValue, snakeCells)) break;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/board.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/board.js test/board.test.js
git commit -m "feat: board tiles, weighted value spawn, refill"
```

---

### Task 6: Game orchestration — step, scoring, speed ramp

**Files:**
- Create: `src/game.js`
- Test: `test/game.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/game.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { createGame, step, tickInterval } from '../src/game.js';
import { setDirection } from '../src/snake.js';

const UP = { x: 0, y: -1 }, DOWN = { x: 0, y: 1 }, LEFT = { x: -1, y: 0 }, RIGHT = { x: 1, y: 0 };

test('tickInterval starts gentle and clamps at the floor', () => {
  assert.equal(tickInterval(0), 200);
  assert.equal(tickInterval(100000), 80); // clamped
  assert.ok(tickInterval(100) < tickInterval(0)); // speeds up with score
});

test('createGame seeds a snake and fills the board', () => {
  const g = createGame(createRng(1));
  assert.ok(g.snake.cells.length >= 2);
  assert.equal(g.board.tiles.length, 3);
  assert.equal(g.over, false);
  assert.equal(g.score, 0);
});

test('eating a matching tile scores and raises bestTile', () => {
  const g = createGame(createRng(1));
  // Force a clean setup: a length-1 snake of value 2 and one matching tile ahead.
  g.snake.cells = [{ x: 3, y: 5 }];
  g.snake.values = [2];
  g.snake.direction = { ...UP }; g.snake.pending = { ...UP };
  g.board.tiles = [{ x: 3, y: 4, value: 2 }];
  const ev = step(g); // eat 2 onto 2 -> merge to 4
  assert.equal(ev.ate, true);
  assert.equal(ev.merges, 1);
  assert.equal(g.score, 4);
  assert.equal(g.bestTile, 4);
  assert.equal(g.board.tiles.length, 3); // refilled
});

test('moving into a wall ends the run', () => {
  const g = createGame(createRng(1));
  g.snake.cells = [{ x: 3, y: 0 }];
  g.snake.values = [2];
  g.snake.direction = { ...UP }; g.snake.pending = { ...UP };
  g.board.tiles = [];
  const ev = step(g);
  assert.equal(ev.over, true);
  assert.equal(g.over, true);
  assert.equal(g.lastCause.type, 'wall');
});

test('moving into your own body ends the run', () => {
  const g = createGame(createRng(1));
  g.snake.cells = [
    { x: 3, y: 5 }, { x: 3, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }, { x: 5, y: 5 },
  ];
  g.snake.values = [2, 2, 2, 2, 2];
  g.snake.direction = { ...DOWN }; g.snake.pending = { ...DOWN };
  g.board.tiles = [];
  const ev = step(g); // head (3,5) -> (3,6) which is its own body
  assert.equal(ev.over, true);
  assert.equal(g.lastCause.type, 'self');
});

test('step is a no-op once the game is over', () => {
  const g = createGame(createRng(1));
  g.over = true;
  const ev = step(g);
  assert.equal(ev.over, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/game.test.js`
Expected: FAIL — cannot find module `../src/game.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/game.js
import { GRID, TIMING, START } from './constants.js';
import * as Snake from './snake.js';
import * as Board from './board.js';

export function tickInterval(score) {
  return Math.max(TIMING.tickFloorMs, TIMING.tickStartMs - score * TIMING.tickPerPoint);
}

export function createGame(rng) {
  const board = Board.createBoard();
  const start = { x: Math.floor(GRID.cols / 2), y: Math.floor(GRID.rows / 2) };
  const snake = Snake.createSnake(START.snakeLength, START.snakeValue, start, START.direction);
  Board.refill(board, rng, Snake.maxValue(snake), snake.cells);
  return {
    rng, board, snake,
    score: 0,
    bestTile: Snake.maxValue(snake),
    bestCombo: 0,
    over: false,
    lastCause: null,
  };
}

// Advance the game by one tick. Returns an event object for render/FX:
//   { over, ate, merges, gained, cell, cause }
export function step(game) {
  if (game.over) return { over: true };
  const s = game.snake, b = game.board;
  const next = Snake.nextHeadCell(s);

  if (Snake.isWall(next, b.cols, b.rows)) {
    game.over = true;
    game.lastCause = { type: 'wall', cell: next };
    return { over: true, cause: game.lastCause };
  }

  const tile = Board.tileAt(b, next.x, next.y);
  const willEat = !!tile;

  if (Snake.hitsSelf(s, next, willEat)) {
    game.over = true;
    game.lastCause = { type: 'self', cell: next };
    return { over: true, cause: game.lastCause };
  }

  if (willEat) {
    const r = Snake.eat(s, next, tile.value);
    Board.removeTile(b, next.x, next.y);
    game.score += r.gained;
    if (r.merges > game.bestCombo) game.bestCombo = r.merges;
    const mv = Snake.maxValue(s);
    if (mv > game.bestTile) game.bestTile = mv;
    Board.refill(b, game.rng, mv, s.cells);
    return { over: false, ate: true, merges: r.merges, gained: r.gained, cell: next };
  }

  Snake.move(s);
  return { over: false, ate: false, merges: 0, gained: 0, cell: next };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/game.test.js`
Expected: PASS (6 tests). Then run the whole suite: `node --test` — expected all green.

- [ ] **Step 5: Commit**

```bash
git add src/game.js test/game.test.js
git commit -m "feat: game step, scoring, speed ramp"
```

---

### Task 7: Renderer (canvas) — verified manually

**Files:**
- Create: `src/render.js`

Rendering is view code, verified in the browser rather than by unit test.

- [ ] **Step 1: Write `src/render.js`**

```js
// src/render.js
import { GRID, POWER_COLORS, FALLBACK_COLOR } from './constants.js';

let shakeUntil = 0, shakeMag = 0;
let flashes = []; // {x, y, t} merge pops in grid coords, t = frames remaining

export function flash(ev) {
  if (ev && ev.cell) flashes.push({ x: ev.cell.x, y: ev.cell.y, t: 12 });
}

export function shake(ms = 220, mag = 8) {
  shakeUntil = performance.now() + ms;
  shakeMag = mag;
}

function colorFor(value) {
  const idx = Math.round(Math.log2(value / 2));
  return POWER_COLORS[idx] || FALLBACK_COLOR;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCell(ctx, px, py, cell, color, isHead) {
  const pad = cell * 0.08;
  if (isHead) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
  }
  ctx.fillStyle = color;
  roundRect(ctx, px + pad, py + pad, cell - pad * 2, cell - pad * 2, cell * 0.22);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawNumber(ctx, px, py, cell, value) {
  ctx.fillStyle = '#0b1020';
  ctx.font = `800 ${Math.floor(cell * (value >= 100 ? 0.32 : 0.42))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), px + cell / 2, py + cell / 2 + 1);
}

// Draw one frame.
//   progress: 0..1 fraction toward the next tick (for slide interpolation)
//   slide: the snake's direction to interpolate along, or null to snap (eat ticks)
export function draw(ctx, canvas, game, progress, slide) {
  const cols = GRID.cols, rows = GRID.rows;
  const cell = Math.floor(Math.min(canvas.width / cols, canvas.height / rows));
  const ox = Math.floor((canvas.width - cell * cols) / 2);
  const oy = Math.floor((canvas.height - cell * rows) / 2);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();

  // screen shake
  if (performance.now() < shakeUntil) {
    ctx.translate((Math.random() - 0.5) * shakeMag, (Math.random() - 0.5) * shakeMag);
  }

  // board background grid
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      roundRect(ctx, ox + x * cell + 2, oy + y * cell + 2, cell - 4, cell - 4, 6);
      ctx.fill();
    }
  }

  // tiles
  for (const t of game.board.tiles) {
    const px = ox + t.x * cell, py = oy + t.y * cell;
    drawCell(ctx, px, py, cell, colorFor(t.value), false);
    drawNumber(ctx, px, py, cell, t.value);
  }

  // snake (slide the whole body by the un-elapsed fraction on a normal move)
  const offx = slide ? -slide.x * (1 - progress) * cell : 0;
  const offy = slide ? -slide.y * (1 - progress) * cell : 0;
  for (let i = 0; i < game.snake.cells.length; i++) {
    const c = game.snake.cells[i];
    const px = ox + c.x * cell + offx;
    const py = oy + c.y * cell + offy;
    drawCell(ctx, px, py, cell, colorFor(game.snake.values[i]), i === 0);
    drawNumber(ctx, px, py, cell, game.snake.values[i]);
  }

  // merge flashes
  flashes = flashes.filter(f => f.t > 0);
  for (const f of flashes) {
    const px = ox + f.x * cell, py = oy + f.y * cell;
    ctx.strokeStyle = `rgba(255,255,255,${f.t / 12})`;
    ctx.lineWidth = 3;
    const grow = (12 - f.t) * 2;
    roundRect(ctx, px - grow, py - grow, cell + grow * 2, cell + grow * 2, cell * 0.3);
    ctx.stroke();
    f.t -= 1;
  }

  ctx.restore();
}
```

- [ ] **Step 2: Verify manually** — deferred until `main.js` exists (Task 9). No commit-blocking test here.

- [ ] **Step 3: Commit**

```bash
git add src/render.js
git commit -m "feat: canvas renderer with color-by-power, glow, slide, FX"
```

---

### Task 8: Input — keyboard + swipe

**Files:**
- Create: `src/input.js`
- Test: `test/input.test.js`

- [ ] **Step 1: Write the failing test** (pure swipe-to-direction helper)

```js
// test/input.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeDirection } from '../src/input.js';

test('small swipes below threshold are ignored', () => {
  assert.equal(swipeDirection(5, -5, 20), null);
});

test('dominant horizontal swipe -> left/right', () => {
  assert.deepEqual(swipeDirection(40, 5, 20), { x: 1, y: 0 });
  assert.deepEqual(swipeDirection(-40, 5, 20), { x: -1, y: 0 });
});

test('dominant vertical swipe -> up/down', () => {
  assert.deepEqual(swipeDirection(5, 40, 20), { x: 0, y: 1 });
  assert.deepEqual(swipeDirection(5, -40, 20), { x: 0, y: -1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/input.test.js`
Expected: FAIL — cannot find module `../src/input.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/input.js

// Pure helper: convert a swipe delta into a unit direction (or null if too small).
export function swipeDirection(dx, dy, threshold = 20) {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
  if (Math.abs(dx) > Math.abs(dy)) return { x: dx > 0 ? 1 : -1, y: 0 };
  return { x: 0, y: dy > 0 ? 1 : -1 };
}

const KEY_DIRS = {
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
};

// Wire DOM input. `onDir(dir)` is called with a unit direction vector.
export function initInput(target, onDir) {
  window.addEventListener('keydown', (e) => {
    const d = KEY_DIRS[e.key];
    if (d) { e.preventDefault(); onDir(d); }
  });

  let sx = 0, sy = 0, tracking = false;
  const startPt = (x, y) => { sx = x; sy = y; tracking = true; };
  const endPt = (x, y) => {
    if (!tracking) return;
    tracking = false;
    const d = swipeDirection(x - sx, y - sy);
    if (d) onDir(d);
  };

  target.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0]; startPt(t.clientX, t.clientY);
  }, { passive: true });
  target.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0]; endPt(t.clientX, t.clientY);
  }, { passive: true });
  target.addEventListener('mousedown', (e) => startPt(e.clientX, e.clientY));
  window.addEventListener('mouseup', (e) => endPt(e.clientX, e.clientY));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/input.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/input.js test/input.test.js
git commit -m "feat: keyboard + swipe input"
```

---

### Task 9: Main wiring — game loop, restart, persistence

**Files:**
- Create: `src/main.js`

- [ ] **Step 1: Write `src/main.js`**

```js
// src/main.js
import { createRng } from './rng.js';
import * as Game from './game.js';
import * as Render from './render.js';
import * as Snake from './snake.js';
import { initInput } from './input.js';
import { STORAGE_KEY } from './constants.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

function loadBest() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { tile: 0, score: 0 }; }
  catch { return { tile: 0, score: 0 }; }
}
function saveBest(b) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); } catch { /* ignore */ }
}

let best = loadBest();
let game, lastTick, lastWasEat;

function start() {
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  game = Game.createGame(createRng(seed));
  lastTick = performance.now();
  lastWasEat = false;
  $('overlay').classList.add('hidden');
}

function onGameOver() {
  Render.shake();
  if (game.bestTile > best.tile) best.tile = game.bestTile;
  if (game.score > best.score) best.score = game.score;
  saveBest(best);
  $('ovTile').textContent = game.bestTile;
  $('ovScore').textContent = game.score;
  $('ovCombo').textContent = game.bestCombo;
  $('ovBestTile').textContent = best.tile;
  $('ovBestScore').textContent = best.score;
  setTimeout(() => $('overlay').classList.remove('hidden'), 400);
}

function frame(now) {
  const interval = Game.tickInterval(game.score);
  let progress = Math.min(1, (now - lastTick) / interval);

  if (!game.over && now - lastTick >= interval) {
    const ev = Game.step(game);
    lastTick = now;
    progress = 0;
    lastWasEat = !!ev.ate;
    if (ev.ate && ev.merges > 0) Render.flash(ev);
    if (ev.over) onGameOver();
  }

  $('score').textContent = game.score;
  $('bestTile').textContent = Math.max(best.tile, game.bestTile);
  Render.draw(ctx, canvas, game, progress, lastWasEat ? null : game.snake.direction);
  requestAnimationFrame(frame);
}

initInput(canvas, (dir) => { if (game && !game.over) Snake.setDirection(game.snake, dir); });
$('playAgain').addEventListener('click', start);

start();
requestAnimationFrame(frame);
```

- [ ] **Step 2: Verify manually in the browser**

Run: `python -m http.server 8000` in the project folder, open `http://localhost:8000/`.
Expected:
- Snake of two `2`s sits center-board, gliding upward; three colored number tiles are on the board.
- Arrow keys / WASD turn the snake; you cannot instantly reverse 180°.
- Driving onto a matching number merges and the score jumps; the number on the head climbs.
- Driving the head into a wall or into your own body ends the run; the overlay shows tile/score/combo and a Play Again button that restarts instantly.
- Best tile persists across a page reload.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat: wire game loop, restart, and best-score persistence"
```

---

### Task 10: Playtest pass & tuning checklist

**Files:** (tuning only — edits to `src/constants.js` as needed)

- [ ] **Step 1: Run the full test suite**

Run: `node --test`
Expected: all tests pass (rng, snake, board, game, input).

- [ ] **Step 2: Play 5+ runs and check the validation targets** (from the spec §2)

Watch for:
- Did you understand merging without being told? (target: yes)
- First merge within ~20s? Did you replay voluntarily 5+ times?
- Did any death feel unfair (not your fault)? Note it.
- Does the climb stall (no reachable way to keep doubling)? If so, raise `SPAWN.decay` (more high tiles) or `SPAWN.maxTiles`.
- Too easy / never in danger? Lower `TIMING.tickStartMs` or `TIMING.tickFloorMs`, or shrink `GRID`.
- Too chaotic at speed? Raise `TIMING.tickFloorMs`, or lower `TIMING.tickPerPoint`.

- [ ] **Step 3: Apply at most a few tuning tweaks in `constants.js`, re-test feel, commit**

```bash
git add src/constants.js
git commit -m "tune: v0.1 feel pass (grid/timing/spawn)"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** §3 loop → Tasks 4,6,9; §4 board/movement → Tasks 3,9; §5 spawn window → Task 5 (`pickValue`); §6 merge rule → Task 4; §7 cascades/combo → Tasks 4,6,7; §8 fail states → Task 6 (wall/self) + Task 7 (shake/overlay) + Task 9 (overlay); §9 speed ramp → Task 6 (`tickInterval`); §10 scoring/best → Task 6 + Task 9 (localStorage); §11 look/feel → Task 7 (color-by-power, glow, slide, flashes, shake); §12 architecture → file structure + all tasks. Out-of-scope items (§13) are intentionally absent.
- **Placeholder scan:** none — every code/test step contains complete code and exact commands.
- **Type/name consistency:** the `{cells, values, direction, pending}` snake shape, the `eat → {merges, gained}` return, the `step → {over, ate, merges, gained, cell, cause}` event, and `tickInterval(score)` are used identically across `snake.js`, `game.js`, `render.js`, and `main.js`.

## Note on git

This folder may not be a git repo yet. If `git status` errors, run `git init` once before Task 1's commit (or skip the commit steps and commit at the end). Say the word if you'd prefer no git at all — the commits are optional checkpoints, not required for the game to run.
