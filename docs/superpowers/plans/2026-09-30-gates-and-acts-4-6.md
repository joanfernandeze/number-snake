# Gates and Acts 4–6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Double the campaign to 24 levels in six acts and add gates — two sets of board cells that swap open/closed each time the snake eats.

**Architecture:** Gates are board data (`A`/`B` letters in the text boards), parsed in `src/boards.js`, held as state on the board object in `src/board.js` (`swapGates` on eat, `tickGates` every move), and consulted by `src/game.js` (death cause `gate`), `src/render.js` (drawn under the tiles) and the simulator's bot. Levels 13–24 are data in `src/campaign.js`; the map and the analytics Worker take small changes.

**Tech Stack:** Plain ES modules, no build; tests with `node --test` (run from the repo root, it also runs `analytics/test`); the simulator is `node tools/simulate.js --campaign`.

**Spec:** `docs/superpowers/specs/2026-09-30-gates-and-acts-4-6-design.md`. **Out of scope:** music (spec §7), which gets its own design next.

**Before you start:** `node --test` must be green (163 tests on 2026-09-30). Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The repo lives in OneDrive: if `git commit` fails with "unable to append to '.git/logs/HEAD'", run `git config windows.appendAtomically false` once and retry.

---

## File map

| File | Change |
| --- | --- |
| `src/constants.js` | `GATE` block; `SOUND.gateHz` |
| `src/boards.js` | parse `A`/`B`; validity rule with gates; five new boards |
| `src/board.js` | gate state, `gateAt`, `closedGateAt`, `swapGates`, `tickGates`, `reachableFrom`; spawns avoid gates and sealed regions |
| `src/game.js` | pass gates to the board; `gate` death; tick + swap in `step` |
| `src/render.js` | `drawGates`; tail clipped by closed gates; `gate` death flash |
| `src/fx.js` | comment: death types include `gate` |
| `src/sound.js` | `playGateSwap` |
| `src/main.js` | play the swap sound; map scrolls to the offered level |
| `style.css` | the map panel can scroll past the top of the screen |
| `src/campaign.js` | levels 13–24, six act names |
| `tools/simulate.js` | bot respects gates |
| `analytics/src/validate.js` | cause `gate` accepted |
| `analytics/README.md`, `docs/PLAYTEST.md`, the spec | deploy note, calibration table |
| tests | `test/boards.test.js`, `test/board.test.js`, `test/game.test.js`, `test/gates-draw.test.js` (new), `test/sound.test.js`, `test/campaign.test.js`, `analytics/test/validate.test.js` |

---

### Task 1: Parse gates and validate boards that have them

**Files:**
- Modify: `src/constants.js` (after the `WALL_COLORS` block)
- Modify: `src/boards.js` (`parseBoard`, `isValidBoard`, `BOARDS`)
- Test: `test/boards.test.js`

- [ ] **Step 1: Write the failing tests** — append to `test/boards.test.js`:

```js
const DOOR = ['.......', '.......', '.......', '##A#B##', '.......', '...S...',
  '.......', '.......', '.......', '.......', '.......'];

test('parseBoard reads A and B as gates in two sets, not as walls', () => {
  const b = parseBoard(DOOR);
  assert.deepEqual(b.gates, [{ x: 2, y: 3, set: 'A' }, { x: 4, y: 3, set: 'B' }]);
  assert.equal(b.walls.size, 5);
  assert.equal(b.walls.has('2,3'), false, 'a gate is not a wall');
  assert.deepEqual(parseBoard(BOARDS.open.rows).gates, []);
  assert.throws(() => parseBoard(DOOR.map((r, i) => (i === 0 ? 'C......' : r))), /bad board character/);
});

test('isValidBoard: every cell reachable with all gates open, and room to start with B closed', () => {
  assert.equal(isValidBoard(DOOR), true);
  // A 3x3 room around the start whose only way out is a B gate: 9 cells with B closed, under 20.
  const boxed = ['.......', '.......', '.......', '.#####.', '.#...#.', '.#.S.#.',
    '.#...#.', '.##B##.', '.......', '.......', '.......'];
  assert.equal(isValidBoard(boxed), false, 'start area too small while B is closed');
  assert.equal(isValidBoard(boxed.map(r => r.replace('B', 'A'))), true, 'the same room with an open A gate');
  // A gate may not stand directly ahead of the start.
  const blocked = BOARDS.open.rows.map((r, i) => (i === 4 ? '...A...' : r));
  assert.equal(isValidBoard(blocked), false);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/boards.test.js`
Expected: FAIL — `parseBoard` throws `bad board character 'A'`.

- [ ] **Step 3: Add the constants** — in `src/constants.js`, right after the `WALL_COLORS` block:

```js
// Gates: board cells in two sets that swap when the snake eats (spec 2026-09-30 §2). Set A starts
// open, set B closed; a closing gate can still be crossed for warnTicks moves.
export const GATE = {
  warnTicks: 2,       // moves a closing gate can still be crossed before it turns solid
  minStartArea: 20,   // free cells the start must reach with set A open and set B closed
  colors: { A: '#fde047', B: '#c4b5fd' }, // paler than every tile colour; a gate never carries a number
};
```

- [ ] **Step 4: Implement parsing and validity** — in `src/boards.js`:

Change the import line to:

```js
import { GRID, GATE } from './constants.js';
```

Replace `parseBoard` and `isValidBoard` (and the comments above them) with:

```js
// rows -> { walls: Set<'x,y'>, gates: [{ x, y, set: 'A'|'B' }], start: {x, y}, cols, rows }. Throws
// only on a bad character or the wrong number of starts; a wrong size or an unreachable layout
// parses without complaint, so run isValidBoard first when the rows come from anywhere but this
// file's own validated BOARDS.
export function parseBoard(rows) {
  const walls = new Set();
  const gates = [];
  let start = null;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '#') walls.add(cellKey(x, y));
      else if (ch === 'A' || ch === 'B') gates.push({ x, y, set: ch });
      else if (ch === 'S') {
        if (start) throw new Error('board has two starts');
        start = { x, y };
      } else if (ch !== '.') throw new Error(`bad board character '${ch}'`);
    }
  });
  if (!start) throw new Error('board has no start');
  return { walls, gates, start, cols: rows[0].length, rows: rows.length };
}

// How many cells the start reaches without crossing a wall or a cell `blocked(key)` refuses.
function reachCount(b, blocked) {
  const seen = new Set([cellKey(b.start.x, b.start.y)]);
  const queue = [b.start];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = cellKey(nx, ny);
      if (nx < 0 || ny < 0 || nx >= GRID.cols || ny >= GRID.rows) continue;
      if (b.walls.has(k) || seen.has(k) || blocked(k)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen.size;
}

// 7x11, exactly one start, the cell ahead of the start free (no wall, no gate), every non-wall
// cell reachable from the start with all gates open, and — on a board with gates — at least
// GATE.minStartArea cells reachable in the opening position (A open, B closed). A board that fails
// this would spawn tiles the snake can never eat, start it facing a wall, or box it in.
export function isValidBoard(rows) {
  if (!Array.isArray(rows) || rows.length !== GRID.rows) return false;
  if (!rows.every(r => typeof r === 'string' && r.length === GRID.cols)) return false;
  let b;
  try { b = parseBoard(rows); } catch { return false; }
  const ahead = cellKey(b.start.x, b.start.y - 1);
  if (b.start.y === 0 || b.walls.has(ahead) || b.gates.some(g => cellKey(g.x, g.y) === ahead)) return false;
  const free = GRID.cols * GRID.rows - b.walls.size;
  if (reachCount(b, () => false) !== free) return false;
  if (b.gates.length === 0) return true;
  const closedB = new Set(b.gates.filter(g => g.set === 'B').map(g => cellKey(g.x, g.y)));
  return reachCount(b, k => closedB.has(k)) >= GATE.minStartArea;
}
```

In the `BOARDS` builder at the end of the file, keep the gates and update the message:

```js
export const BOARDS = Object.fromEntries(Object.entries(ROWS).map(([key, { name, rows }]) => {
  if (!isValidBoard(rows)) {
    throw new Error(`board '${key}' is not valid: 7x11, one start, free cell ahead, all cells reachable, room to start`);
  }
  const parsed = parseBoard(rows);
  return [key, { key, name, rows, walls: parsed.walls, gates: parsed.gates, start: parsed.start, cols: parsed.cols }];
}));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test`
Expected: PASS, every test (the five existing boards have no gates, so they validate as before).

- [ ] **Step 6: Commit**

```bash
git add src/constants.js src/boards.js test/boards.test.js
git commit -m "feat(boards): A and B parse as two sets of gates; validity checks all-open reach and the start area"
```

---

### Task 2: Gate state on the board

**Files:**
- Modify: `src/board.js`
- Test: `test/board.test.js`

- [ ] **Step 1: Write the failing tests** — in `test/board.test.js`, extend the import from `../src/board.js` with `gateAt, closedGateAt, swapGates, tickGates, reachableFrom`, change the constants import to `import { OBSTACLE, GATE } from '../src/constants.js';`, and append:

```js
const GATES = [{ x: 2, y: 3, set: 'A' }, { x: 4, y: 3, set: 'B' }];

test('createBoard starts set A open and set B closed', () => {
  const b = createBoard(7, 11, new Set(), GATES);
  assert.equal(b.openSet, 'A');
  assert.equal(gateAt(b, 2, 3).state, 'open');
  assert.equal(gateAt(b, 4, 3).state, 'closed');
  assert.equal(closedGateAt(b, 2, 3), null, 'an open gate does not block');
  assert.ok(closedGateAt(b, 4, 3));
  assert.equal(gateAt(b, 0, 0), null);
  assert.deepEqual(createBoard(7, 11).gates, [], 'a board without gates has an empty list');
});

test('swapGates opens the closed set at once and starts the open set closing', () => {
  const b = createBoard(7, 11, new Set(), GATES);
  assert.equal(swapGates(b), true);
  assert.equal(b.openSet, 'B');
  assert.equal(gateAt(b, 4, 3).state, 'open');
  assert.equal(gateAt(b, 2, 3).state, 'closing');
  assert.equal(gateAt(b, 2, 3).warn, GATE.warnTicks);
  assert.equal(closedGateAt(b, 2, 3), null, 'a closing gate can still be crossed');
  swapGates(b); // eaten again before A finished closing: A reopens, B starts closing
  assert.equal(gateAt(b, 2, 3).state, 'open');
  assert.equal(gateAt(b, 4, 3).state, 'closing');
  assert.equal(swapGates(createBoard(7, 11)), false, 'nothing to swap on a board without gates');
});

test('tickGates turns a closing gate solid after warnTicks moves, never under the snake', () => {
  const b = createBoard(7, 11, new Set(), GATES);
  swapGates(b);
  const away = [{ x: 6, y: 10 }];
  for (let i = 1; i < GATE.warnTicks; i++) assert.deepEqual(tickGates(b, away), []);
  assert.deepEqual(tickGates(b, away), [{ x: 2, y: 3 }]);
  assert.equal(gateAt(b, 2, 3).state, 'closed');

  const c = createBoard(7, 11, new Set(), GATES);
  swapGates(c);
  const onGate = [{ x: 2, y: 3 }];
  for (let i = 0; i < GATE.warnTicks + 3; i++) tickGates(c, onGate);
  assert.equal(gateAt(c, 2, 3).state, 'closing', 'it waits while the body is on it');
  assert.deepEqual(tickGates(c, away), [{ x: 2, y: 3 }], 'and shuts on the first move it is free');
});

test('reachableFrom stops at walls, closed or closing gates and armed obstacles, not at the body', () => {
  // Row 3 is a wall with one B gate: with B closed the head cannot see the top three rows.
  const walls = new Set(['0,3', '1,3', '2,3', '4,3', '5,3', '6,3']);
  const b = createBoard(7, 11, walls, [{ x: 3, y: 3, set: 'B' }]);
  const r = reachableFrom(b, { x: 3, y: 6 });
  assert.equal(r.has('3,2'), false);
  assert.equal(r.has('3,3'), false);
  assert.equal(r.size, 7 * 7, 'rows 4-10');
  swapGates(b);
  assert.equal(reachableFrom(b, { x: 3, y: 6 }).has('3,2'), true, 'open B joins the halves');
});

test('tiles and obstacles never land on a gate, and tiles never in a sealed region', () => {
  const tiny = createBoard(2, 1, new Set(), [{ x: 1, y: 0, set: 'A' }]);
  assert.equal(spawnTile(tiny, createRng(1), 2, [{ x: 0, y: 0 }]), null, 'the only free cell is a gate');
  assert.equal(spawnObstacle(tiny, createRng(1), [{ x: 0, y: 0 }], { x: 0, y: 0 }, 0), null);

  const walls = new Set(['0,3', '1,3', '2,3', '4,3', '5,3', '6,3']);
  for (let seed = 1; seed <= 40; seed++) {
    const b = createBoard(7, 11, walls, [{ x: 3, y: 3, set: 'B' }]);
    refill(b, createRng(seed), 8, [{ x: 3, y: 6 }], 6, 0.5, 4);
    for (const t of b.tiles) assert.ok(t.y > 3, `seed ${seed}: tile at ${t.x},${t.y} is behind the closed gate`);
  }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/board.test.js`
Expected: FAIL — `gateAt` is not exported.

- [ ] **Step 3: Implement** — in `src/board.js`:

Change the import line to:

```js
import { GRID, SPAWN, OBSTACLE, GATE } from './constants.js';
```

Replace `createBoard` (and its comment) with:

```js
// walls: Set<'x,y'> of cells that are part of the board's shape. Lethal like the frame, and
// nothing ever spawns on them. gates: [{x, y, set}] from a parsed board; set A starts open and set
// B closed, eating swaps them (swapGates) and a closing gate turns solid a few moves later
// (tickGates). openSet names the set that is open now.
export function createBoard(cols = GRID.cols, rows = GRID.rows, walls = new Set(), gates = []) {
  return {
    cols, rows, tiles: [], obstacles: [], walls, // tiles: [{x, y, value}], obstacles: [{x, y}]
    gates: gates.map(g => ({ x: g.x, y: g.y, set: g.set, state: g.set === 'A' ? 'open' : 'closed', warn: 0 })),
    openSet: 'A',
  };
}
```

Add after `obstacleAt`:

```js
export function gateAt(board, x, y) {
  return (board.gates || []).find(g => g.x === x && g.y === y) || null;
}

// Only a closed gate stops the snake; an open or a closing one can be crossed.
export function closedGateAt(board, x, y) {
  const g = gateAt(board, x, y);
  return g && g.state === 'closed' ? g : null;
}

// Eating swaps the sets: the closed set opens at once and the open set starts closing, crossable
// for GATE.warnTicks more moves. A set still closing from the previous swap simply reopens.
// Returns whether anything swapped (false on a board without gates).
export function swapGates(board) {
  if (!board.gates || board.gates.length === 0) return false;
  board.openSet = board.openSet === 'A' ? 'B' : 'A';
  for (const g of board.gates) {
    if (g.set === board.openSet) { g.state = 'open'; g.warn = 0; }
    else { g.state = 'closing'; g.warn = GATE.warnTicks; }
  }
  return true;
}

// One move has passed: every closing gate counts down and turns solid once its count is spent and
// no part of the snake is on it. One under the snake keeps blinking until the cell is free, so a
// gate never shuts on the body. Returns the cells that just turned solid.
export function tickGates(board, snakeCells) {
  const closed = [];
  for (const g of board.gates || []) {
    if (g.state !== 'closing') continue;
    if (g.warn > 0) g.warn -= 1;
    if (g.warn > 0) continue;
    if (snakeCells.some(c => c.x === g.x && c.y === g.y)) continue;
    g.state = 'closed';
    closed.push({ x: g.x, y: g.y });
  }
  return closed;
}

// Cells the head can get to right now: walls, gates that are not open and armed obstacles block;
// the snake's own body does not, because it moves out of the way. Keeps a tile from spawning in a
// region a closed gate has sealed off.
export function reachableFrom(board, head) {
  const key = (x, y) => `${x},${y}`;
  const seen = new Set([key(head.x, head.y)]);
  const queue = [head];
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= board.cols || ny >= board.rows || seen.has(k)) continue;
      if (wallAt(board, nx, ny) || armedObstacleAt(board, nx, ny)) continue;
      const g = gateAt(board, nx, ny);
      if (g && g.state !== 'open') continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}
```

Replace `isOccupied` with:

```js
function isOccupied(board, snakeCells, x, y) {
  if (wallAt(board, x, y) || gateAt(board, x, y) || tileAt(board, x, y) || obstacleAt(board, x, y)) return true;
  return snakeCells.some(c => c.x === x && c.y === y);
}
```

Replace the start of `spawnTile` (the comment, signature and the `empties` loop) with:

```js
// Spawn one tile on a random empty cell. Returns the tile, or null if the board is full. On a board
// with gates a tile only lands where the head can reach now; a board without gates skips that
// search, so its spawns — and every seeded run on it — are exactly what they were before gates.
export function spawnTile(board, rng, maxValue, snakeCells, decay, span) {
  const reach = board.gates && board.gates.length && snakeCells.length ? reachableFrom(board, snakeCells[0]) : null;
  const empties = [];
  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) {
      if (!isOccupied(board, snakeCells, x, y) && (!reach || reach.has(`${x},${y}`))) empties.push({ x, y });
    }
  }
```

(the rest of `spawnTile` stays as it is).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add src/board.js test/board.test.js
git commit -m "feat(board): gates hold state; eating swaps the sets, a closing gate turns solid when free; spawns avoid gates and sealed regions"
```

---

### Task 3: Gates in the game loop

**Files:**
- Modify: `src/game.js` (`createGame`, `step`)
- Test: `test/game.test.js`

- [ ] **Step 1: Write the failing tests** — append to `test/game.test.js` (it already imports `createGame`, `step`, `startRun`, `createRng`, `DIFFICULTIES` and `parseBoard`):

```js
// Row 3 holds one gate at (3,3) in the given set; the start is (3,5) heading up.
function gateGame(set) {
  const rows = ['.......', '.......', '.......', `...${set}...`, '.......', '...S...',
    '.......', '.......', '.......', '.......', '.......'];
  const g = createGame(createRng(1), DIFFICULTIES.classic, { board: parseBoard(rows) });
  g.board.tiles = []; // no accidental bite: these tests place every tile by hand
  startRun(g);
  return g;
}

test('a closed gate kills with cause gate', () => {
  const g = gateGame('B');
  assert.equal(step(g).over, false);        // (3,4)
  const ev = step(g);                        // (3,3) is closed
  assert.equal(ev.over, true);
  assert.equal(ev.cause.type, 'gate');
  assert.deepEqual(ev.cause.cell, { x: 3, y: 3 });
});

test('eating swaps the gates, so a closed gate ahead opens', () => {
  const g = gateGame('B');
  g.board.tiles = [{ x: 3, y: 4, value: 4 }];
  const ev = step(g);
  assert.equal(ev.ate, true);
  assert.equal(ev.swapped, true);
  g.board.tiles = [];
  assert.equal(step(g).over, false, 'B is open now');
  assert.deepEqual(g.snake.cells[0], { x: 3, y: 3 });
});

test('a closing gate can be crossed, and shuts only once the body has left it', () => {
  const g = gateGame('A');                      // A starts open
  g.board.tiles = [{ x: 3, y: 4, value: 4 }];   // value 4 on a head of 2: no merge, length 2
  step(g);                                      // eat at (3,4): A starts closing
  g.board.tiles = [];
  assert.equal(g.board.gates[0].state, 'closing');
  assert.equal(step(g).over, false, 'onto the closing gate'); // head (3,3)
  step(g);                                      // head (3,2), the tail still on (3,3)
  assert.equal(g.board.gates[0].state, 'closing', 'the body is on it');
  step(g);                                      // head (3,1): (3,3) is free
  assert.equal(g.board.gates[0].state, 'closed');
});

test('a board without gates never reports a swap', () => {
  const g = createGame(createRng(1), DIFFICULTIES.classic);
  g.board.tiles = [{ x: 3, y: 4, value: 2 }];
  startRun(g);
  assert.equal(step(g).swapped, false);
});
```

Note on the third test: the snake has two segments after the bite (a 4 on a head of 2 does not merge). The gate at `(3,3)` counts down at the end of each move: 2 → 1 as the head steps onto it, 1 → 0 as the head moves to `(3,2)` with the tail still on the gate (so it keeps blinking), and it shuts at the end of the next move, when `(3,3)` is free.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/game.test.js`
Expected: FAIL — the snake walks through the closed gate (`over` is `false`), and `ev.swapped` is `undefined`.

- [ ] **Step 3: Implement** — in `src/game.js`:

In `createGame`, replace the board line with:

```js
  const board = Board.createBoard(GRID.cols, GRID.rows,
    shaped ? new Set(shaped.walls) : new Set(), shaped && shaped.gates ? shaped.gates : []);
```

In `step`, add right after the armed-obstacle check:

```js
  if (Board.closedGateAt(b, next.x, next.y)) {
    game.over = true;
    game.lastCause = { type: 'gate', cell: next };
    return { over: true, cause: game.lastCause, armed };
  }
```

In the eat branch, right after the `bestTile` update and before the obstacle comment, add:

```js
    // Gates count down on the new position, then the bite swaps them — before the refill, so a new
    // tile only lands where the head can reach once the swap has happened.
    Board.tickGates(b, s.cells);
    const swapped = Board.swapGates(b);
```

and change the eat branch's return to:

```js
    return { over: false, ate: true, merges: r.merges, gained: r.gained, cell: next, obstacle, armed, relief, swapped };
```

Replace the move branch's end with:

```js
  Snake.move(s);
  Board.tickGates(b, s.cells);
  return { over: false, ate: false, merges: 0, gained: 0, cell: next, obstacle: null, armed, relief: false, swapped: false };
```

Update the comment above `step` to list the new field: `//   { over, ate, merges, gained, cell, cause, swapped }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add src/game.js test/game.test.js
git commit -m "feat(game): a closed gate kills with cause gate; eating swaps the gates; gates tick every move"
```

---

### Task 4: The five gate boards

**Files:**
- Modify: `src/boards.js` (`ROWS`)
- Test: `test/boards.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/boards.test.js`:

```js
test('the five gate boards ship, each with both sets', () => {
  const counts = { door: 2, locks: 2, halves: 2, rooms: 3, vault: 4 };
  for (const [key, n] of Object.entries(counts)) {
    const b = BOARDS[key];
    assert.ok(b, `${key} ships`);
    assert.equal(b.gates.length, n, `${key} gate count`);
    assert.ok(b.gates.some(g => g.set === 'A') && b.gates.some(g => g.set === 'B'), `${key} has both sets`);
  }
  for (const key of ['open', 'pillars', 'lanes', 'chambers', 'ring']) assert.deepEqual(BOARDS[key].gates, []);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/boards.test.js`
Expected: FAIL — `door ships`.

- [ ] **Step 3: Add the boards** — in `src/boards.js`, inside `ROWS`, after the `ring` entry:

```js
  door: {
    name: 'The door',
    rows: [
      '.......',
      '.......',
      '.......',
      '##A#B##',
      '.......',
      '...S...',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
    ],
  },
  locks: {
    name: 'The locks',
    rows: [
      '.......',
      '.......',
      '.......',
      '###A###',
      '.......',
      '...S...',
      '.......',
      '###B###',
      '.......',
      '.......',
      '.......',
    ],
  },
  halves: {
    name: 'The halves',
    rows: [
      '...#...',
      '...A...',
      '...#...',
      '...#...',
      '...#...',
      '..S#...',
      '...#...',
      '...#...',
      '...B...',
      '...#...',
      '...#...',
    ],
  },
  rooms: {
    name: 'The rooms',
    rows: [
      '...#...',
      '...B...',
      '...#...',
      '#A###B#',
      '.......',
      '...S...',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
    ],
  },
  vault: {
    name: 'The vault',
    rows: [
      '.......',
      '.#####.',
      '.#...#.',
      '.A...B.',
      '.#...#.',
      '.#.S.#.',
      '.#...#.',
      '.B...A.',
      '.#...#.',
      '.#####.',
      '.......',
    ],
  },
```

Also update the comment at the top of the file: the characters are now `'#' wall, 'S' where the snake starts (heading up), 'A'/'B' a gate of set A or B, '.' free`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: PASS. (`BOARDS` validates every board at load, so an invalid picture fails every test file that imports it.)

- [ ] **Step 5: Commit**

```bash
git add src/boards.js test/boards.test.js
git commit -m "feat(boards): the door, the locks, the halves, the rooms and the vault"
```

---

### Task 5: Draw the gates

**Files:**
- Modify: `src/render.js` (import, new `drawGates`, `drawTail`, `drawDeath`, `draw`)
- Modify: `src/fx.js` (comment only)
- Create: `test/gates-draw.test.js`

- [ ] **Step 1: Write the failing test** — create `test/gates-draw.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draw } from '../src/render.js';
import { createFx } from '../src/fx.js';
import { createBoard } from '../src/board.js';
import { GATE } from '../src/constants.js';

// Records the fillStyle of every fill() and the strokeStyle of every stroke(); every other call is
// a no-op, so draw() runs without a browser.
function styleCtx() {
  const t = { fills: [], strokes: [], fillStyle: null, strokeStyle: null };
  t.fill = () => t.fills.push(t.fillStyle);
  t.stroke = () => t.strokes.push(t.strokeStyle);
  return new Proxy(t, {
    get: (o, k) => (k in o ? o[k] : () => {}),
    set: (o, k, v) => { o[k] = v; return true; },
  });
}

function gateFrame() {
  const board = createBoard(7, 11, new Set(), [{ x: 2, y: 2, set: 'A' }, { x: 4, y: 2, set: 'B' }]);
  return {
    board,
    snake: { cells: [{ x: 3, y: 8 }], values: [2], direction: { x: 0, y: -1 }, queue: [] },
    started: true, over: false,
  };
}
const view = { width: 420, height: 660, dpr: 1 };
const rest = { kind: 'none', progress: 1 };

test('a closed gate is a solid block, an open one a dashed outline', () => {
  const ctx = styleCtx();
  draw(ctx, view, gateFrame(), createFx(), 0, rest);
  assert.ok(ctx.fills.includes(GATE.colors.B), 'B (closed) is filled');
  assert.ok(!ctx.fills.includes(GATE.colors.A), 'A (open) is not filled');
  assert.ok(ctx.strokes.includes(GATE.colors.A), 'A (open) is outlined');
});

test('a closing gate alternates between block and outline', () => {
  const game = gateFrame();
  game.board.gates[0].state = 'closing';
  const on = styleCtx();
  draw(on, view, game, createFx(), 0, rest);
  assert.ok(on.fills.includes(GATE.colors.A), 'blink on: filled');
  const off = styleCtx();
  draw(off, view, game, createFx(), 150, rest);
  assert.ok(!off.fills.includes(GATE.colors.A), 'blink off: not filled');
  assert.ok(off.strokes.includes(GATE.colors.A), 'blink off: outlined');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/gates-draw.test.js`
Expected: FAIL — `B (closed) is filled`.

- [ ] **Step 3: Implement** — in `src/render.js`:

Add `GATE` to the constants import:

```js
import { GRID, POWER_COLORS, FALLBACK_COLOR, FX, DEATH, OBSTACLE_COLORS, WALL_COLORS, GATE } from './constants.js';
```

Add after `drawWallCells`:

```js
// A gate: a solid block in its set's colour when closed, a dashed outline of the same colour when
// open — so the player sees where it will shut — and the two alternating while it closes. No
// stripes and no glow: those belong to obstacles and the frame.
function drawGates(ctx, L, board, now) {
  if (!board.gates || board.gates.length === 0) return;
  const cell = L.cell, pad = cell * 0.06, size = cell - pad * 2, r = cell * 0.16;
  const blinkOn = Math.floor(now / 150) % 2 === 0;
  ctx.save();
  for (const g of board.gates) {
    const px = L.ox + g.x * cell + pad, py = L.oy + g.y * cell + pad;
    const color = GATE.colors[g.set];
    const solid = g.state === 'closed' || (g.state === 'closing' && blinkOn);
    if (solid) {
      ctx.fillStyle = color;
      roundRect(ctx, px, py, size, size, r);
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, cell * 0.06);
      ctx.setLineDash([cell * 0.12, cell * 0.1]);
      roundRect(ctx, px, py, size, size, r);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}
```

In `drawTail`, right after the loop that punches out the wall cells (before `ctx.clip('evenodd');`), add:

```js
  if (board && board.gates) {
    for (const g of board.gates) {
      if (g.state === 'closed') ctx.rect(L.ox + g.x * cell, L.oy + g.y * cell, cell, cell);
    }
  }
```

and change the comment above that clip to say "every wall cell and every closed gate punched out".

In `drawDeath`, change the inside-cell condition to include gates:

```js
  if (d.type === 'self' || d.type === 'obstacle' || d.type === 'gate' || (d.type === 'wall' && inside)) {
```

In `draw`, add the gates right after the wall cells:

```js
  drawWallCells(ctx, L, game.board);
  drawGates(ctx, L, game.board, now);
```

In `src/fx.js`, update the `death` comment to `{type: 'wall'|'self'|'obstacle'|'gate', cell, born, life}`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: PASS, every test (including the existing `test/draw.test.js`).

- [ ] **Step 5: Commit**

```bash
git add src/render.js src/fx.js test/gates-draw.test.js
git commit -m "feat(render): gates drawn as blocks or dashed outlines, blinking while they close; the tail and the death flash know them"
```

---

### Task 6: The swap sound

**Files:**
- Modify: `src/constants.js` (`SOUND`), `src/sound.js`, `src/main.js`
- Test: `test/sound.test.js`

- [ ] **Step 1: Write the failing test** — in `test/sound.test.js`, add `playGateSwap` to the import from `../src/sound.js` and append:

```js
test('the gate swap sound is safe without an AudioContext and sits apart from the eat blip', () => {
  assert.doesNotThrow(() => playGateSwap());
  assert.ok(SOUND.gateHz > SOUND.eatHz, 'higher than the eat blip it follows');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/sound.test.js`
Expected: FAIL — `playGateSwap` is not exported.

- [ ] **Step 3: Implement**

In `src/constants.js`, add to `SOUND` after `winHz`:

```js
  gateHz: 520,       // the gates swapping: a latch-like click above the eat blip
```

In `src/sound.js`, add after `playEat`:

```js
// The gates swapping: two quick clicks, high then lower, like a latch — distinct from the eat blip
// it follows, so the ear learns that this bite moved the doors.
export function playGateSwap() {
  tone(SOUND.gateHz, 60, { type: 'square', gain: SOUND.gain * 0.5 });
  tone(SOUND.gateHz * 0.75, 60, { type: 'square', gain: SOUND.gain * 0.5, delay: 0.07 });
}
```

In `src/main.js`, in the frame loop's non-death branch, right after the line `if (ev.obstacle) Fx.addObstacle(fx, ev.obstacle, now);`, add:

```js
      if (ev.swapped) Sound.playGateSwap();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add src/constants.js src/sound.js src/main.js test/sound.test.js
git commit -m "feat(sound): a latch click when the gates swap"
```

---

### Task 7: Levels 13–24

**Files:**
- Modify: `src/campaign.js` (header comment, `ACTS`, `LEVELS`)
- Test: `test/campaign.test.js`

- [ ] **Step 1: Update the tests first**

In `test/campaign.test.js`, replace the first test's title and its first three assertions:

```js
test('twenty-four levels, numbered 1-24, four per act, on shipped boards and speeds', () => {
  assert.equal(LEVELS.length, 24);
  assert.deepEqual(ACTS, ['Learn', 'Pressure', 'Mastery', 'Gates', 'Crossings', 'Vault']);
```

In the same test replace `assert.equal(levelById(13), null);` with:

```js
  assert.equal(levelById(25), null);
  for (const l of LEVELS.filter(l => l.id >= 13)) {
    assert.ok(BOARDS[l.board].gates.length > 0, `level ${l.id} is played on a gate board`);
  }
  for (const l of LEVELS.filter(l => l.id <= 12)) {
    assert.equal(BOARDS[l.board].gates.length, 0, `level ${l.id} keeps its gate-free board`);
  }
```

In the `cfgFor`/`boardFor` test, after `assert.equal(boardFor(levelById(12)), BOARDS.ring);` add:

```js
  assert.equal(boardFor(levelById(13)), BOARDS.door);
  assert.equal(boardFor(levelById(24)), BOARDS.vault);
```

In the progress test, replace the last block (from `for (let id = 2; id <= 12; ...` to the `totalStars` line) with:

```js
  for (let id = 2; id <= 24; id++) recordResult(st, id, 1);
  assert.equal(nextLevel(st), 24, 'all cleared: the campaign points at the finale');
  assert.equal(totalStars(st), 3 + 23);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/campaign.test.js`
Expected: FAIL — `LEVELS.length` is 12.

- [ ] **Step 3: Implement** — in `src/campaign.js`:

Change the first line of the header comment to `// The campaign: twenty-four levels, each a board plus three conditions from one small vocabulary.`

Replace `ACTS`:

```js
export const ACTS = ['Learn', 'Pressure', 'Mastery', 'Gates', 'Crossings', 'Vault'];
```

Append to `LEVELS`, after level 12 (the eats/time values are starting points that Task 10 recalibrates):

```js
  { id: 13, act: 4, board: 'door',     speed: 'classic', obstacleEvery: 0,  goal: tile(64),     stars: [eats(18), chain(3)] },
  { id: 14, act: 4, board: 'door',     speed: 'classic', obstacleEvery: 0,  goal: tile(128),    stars: [eats(24), time(45)] },
  { id: 15, act: 4, board: 'locks',    speed: 'classic', obstacleEvery: 0,  goal: chain(3),     stars: [eats(14), tile(128)] },
  { id: 16, act: 4, board: 'locks',    speed: 'classic', obstacleEvery: 0,  goal: tile(256),    stars: [eats(30), chain(3)] },
  { id: 17, act: 5, board: 'halves',   speed: 'classic', obstacleEvery: 15, goal: tile(128),    stars: [eats(24), time(50)] },
  { id: 18, act: 5, board: 'halves',   speed: 'classic', obstacleEvery: 15, goal: collect(40),  stars: [tile(128), chain(3)] },
  { id: 19, act: 5, board: 'rooms',    speed: 'classic', obstacleEvery: 20, goal: chain(4),     stars: [eats(26), tile(128)] },
  { id: 20, act: 5, board: 'rooms',    speed: 'classic', obstacleEvery: 15, goal: tile(256),    stars: [eats(26), chain(3)] },
  { id: 21, act: 6, board: 'rooms',    speed: 'frenzy',  obstacleEvery: 15, goal: tile(128),    stars: [eats(24), time(40)] },
  { id: 22, act: 6, board: 'vault',    speed: 'frenzy',  obstacleEvery: 15, goal: collect(40),  stars: [tile(128), chain(3)] },
  { id: 23, act: 6, board: 'vault',    speed: 'frenzy',  obstacleEvery: 10, goal: chain(4),     stars: [eats(16), tile(128)] },
  { id: 24, act: 6, board: 'vault',    speed: 'frenzy',  obstacleEvery: 10, goal: tile(256),    stars: [eats(28), chain(4)] },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add src/campaign.js test/campaign.test.js
git commit -m "feat(campaign): acts 4-6 — twelve gate levels, starting star values"
```

---

### Task 8: A map that holds 24 levels

**Files:**
- Modify: `style.css` (`.panel.map`), `src/main.js` (`showMap`)

The map builds itself from `LEVELS` and `ACTS`, so the six acts already appear. Two things break at 24 tiles on a phone: the panel is taller than the screen, and `#mapOverlay` centres with `align-items: center`, which pushes the top of an overflowing panel out of reach; and the level on offer can sit below the fold.

- [ ] **Step 1: Let the panel scroll from its top** — in `style.css`, change the `.panel.map` rule to:

```css
.panel.map { max-width: min(94vw, 380px); padding: 20px 18px 18px; margin: auto 0; }
```

(An auto cross-axis margin wins over `align-items`: the panel still centres when it fits, and starts at the top, fully scrollable, when it does not.)

- [ ] **Step 2: Scroll the offered level into view** — in `src/main.js`, replace `showMap` with:

```js
function showMap() {
  paintMap();
  paintDaily();
  $('overlay').classList.add('hidden');
  $('mapOverlay').classList.remove('hidden');
  // Twenty-four tiles do not fit a phone screen at once: bring the level on offer into view.
  const offered = $('mapActs').querySelector('button[data-now="true"]');
  if (offered && offered.scrollIntoView) offered.scrollIntoView({ block: 'center' });
}
```

- [ ] **Step 3: Verify in the browser**

Start the preview (`.claude/launch.json` has `number-snake`: `python -m http.server 8765`), open it with a mobile viewport (375×812), and check: the map shows six acts; the panel's title is reachable by scrolling up; with some progress stored (DevTools: `localStorage.setItem('numberSnake.campaign', JSON.stringify({stars:{1:3,2:3,3:3,4:3,5:3,6:3,7:3,8:3,9:3,10:3,11:3,12:3,13:1}}))`, then reload) the tile for level 14 is centred on screen and highlighted. Also play level 13: the gates draw, eating swaps them with a click, and the closing gate blinks. `node --test` stays green.

- [ ] **Step 4: Commit**

```bash
git add style.css src/main.js
git commit -m "fix(map): the panel scrolls from its top and brings the offered level into view"
```

---

### Task 9: The bot understands gates

**Files:**
- Modify: `tools/simulate.js` (`isSafe`, `blockedCells`)

The simulator is a tool, not shipped code, and has no tests of its own; it is verified by running it.

- [ ] **Step 1: Make the immediate safety check respect closed gates** — in `isSafe`, after the obstacle line, add:

```js
  if (Board.closedGateAt(b, cell.x, cell.y)) return false; // a closed gate kills like a wall
```

- [ ] **Step 2: Make path-finding avoid gates that are not open** — in `blockedCells`, after the obstacle loop, add:

```js
  // A closing gate still lets the snake through, but it turns solid within a move or two — sooner
  // than a path through it would be walked — so the planner treats it as shut, like a closed one.
  for (const gt of b.gates || []) if (gt.state !== 'open') blocked.add(`${gt.x},${gt.y}`);
```

and extend the comment above `blockedCells` to name gates that are not open.

- [ ] **Step 3: Run the simulator on one gate level to see it play**

Run: `node tools/simulate.js --campaign=13`
Expected: one line for level 13 with a win rate well above 0 %, and `gate` appearing (if at all) as a minority cause in the causes column.

- [ ] **Step 4: Commit**

```bash
git add tools/simulate.js
git commit -m "tune(simulate): the bot treats closed gates as walls and plans around closing ones"
```

---

### Task 10: Calibrate levels 13–24

**Files:**
- Modify: `src/campaign.js` (eats/time values of levels 13–24 only)
- Modify: `docs/PLAYTEST.md` (campaign calibration table), `docs/superpowers/specs/2026-09-30-gates-and-acts-4-6-design.md` (§4 table)

- [ ] **Step 1: Run the calibration**

Run: `node tools/simulate.js --campaign` (all 24 levels, 300 attempts each; a few minutes).

- [ ] **Step 2: Set every eats and time star of levels 13–24 from the output**, with the rule of the 2026-09-15 retune: an `eats(N)` star takes the level's `eats p50` rounded **up** to the next even number; a `time(T)` star takes `secs p50 × 1.4` rounded **up** to the next multiple of 5. Goals, boards, speeds, obstacle cadence and tile/chain stars do not change in this step. Example: `eats p50/p20  23/ 17` → `eats(24)`; `secs p50/p20  31/ 25` → 31 × 1.4 = 43.4 → `time(45)`.

- [ ] **Step 3: Rerun and check the targets** — `node tools/simulate.js --campaign` again. Spec §4 targets for levels 13–24: win ≥ 10 % on levels 13–20, ≥ 3 % on 21–24, and ★★★ ≥ 15 % of wins on every level. For a level that misses, change **that level only** and rerun: first its obstacle cadence (`obstacleEvery` 10 → 15 → 20 → 0), then its speed (`frenzy` → `classic`), last its goal one rung down the ladder (256 → 128). A ★★★ under 15 % that is a tile or chain star moves one rung down (tile 128 → 64, chain 4 → 3). Record every such change for Step 5.

- [ ] **Step 4: Run the tests**

Run: `node --test`
Expected: PASS (the campaign test checks shape and consistency, not the calibrated numbers).

- [ ] **Step 5: Update the docs** — in `docs/PLAYTEST.md`, under `### Campaign calibration`, retitle it `(2026-09-30, 300 greedy-bot attempts per level)` and replace the table with the 24 lines the final run printed (columns as in the existing table), adding one sentence per level changed in Step 3 saying what changed and why. In the spec, replace §4's table values with the shipped ones.

- [ ] **Step 6: Commit**

```bash
git add src/campaign.js docs/PLAYTEST.md docs/superpowers/specs/2026-09-30-gates-and-acts-4-6-design.md
git commit -m "tune(campaign): levels 13-24 calibrated by the simulator; playtest table covers 24 levels"
```

---

### Task 11: The Worker counts gate deaths

**Files:**
- Modify: `analytics/src/validate.js`, `analytics/README.md`, `src/telemetry.js` (comment)
- Test: `analytics/test/validate.test.js`

- [ ] **Step 1: Write the failing test** — append to `analytics/test/validate.test.js`:

```js
test('a run that ends on a gate is accepted with cause gate', () => {
  const r = validateRun({ ...good, mode: 'campaign', cause: 'gate', level: 13 });
  assert.ok(r);
  assert.equal(r.cause, 'gate');
  assert.equal(r.level, 13);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test analytics/test/validate.test.js`
Expected: FAIL — `validateRun` returns `null`.

- [ ] **Step 3: Implement** — in `analytics/src/validate.js`:

```js
const CAUSES = new Set(['wall', 'self', 'obstacle', 'gate', 'won']);
```

In `src/telemetry.js`, update the record comment's cause list to `'wall'|'self'|'obstacle'|'gate'|'won'`.

In `analytics/README.md`, add a section after the campaign upgrade:

```markdown
## Upgrading an existing deployment (gates, 2026-09-30)

Campaign levels 13-24 can end with `cause: 'gate'`. A Worker deployed before this rejects those
runs, so redeploy **before** pushing the game: `npm run deploy` from `analytics/`. No schema change:
`cause` is already a free-text column.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add analytics/src/validate.js analytics/README.md src/telemetry.js analytics/test/validate.test.js
git commit -m "feat(analytics): the Worker accepts cause gate"
```

---

### Task 12: Ship

- [ ] **Step 1: Full check** — `node --test` green; `node tools/simulate.js --campaign` matches the table committed in Task 10.

- [ ] **Step 2: Browser check** — repeat Task 8 Step 3 end to end on a mobile viewport: the map, level 13 (gates draw, swap on eat with the click, blink while closing, a gate death flashes the gate cell), and one old level (say 5) to confirm nothing changed on gate-free boards.

- [ ] **Step 3: Worker first** — ask Joan to run, from `analytics/`, `npm run deploy` (it needs his Cloudflare login). Do not push the game until he confirms the deploy; until then gate deaths would be rejected by the old validator.

- [ ] **Step 4: Push and confirm the deploy**

```bash
git push origin main
```

Then poll GitHub Pages until it serves the new code (it takes a couple of minutes; the phone caches aggressively, so tell Joan to hard-reload):

```bash
for i in $(seq 1 20); do n=$(curl -s "https://joanfernandeze.github.io/number-snake/src/boards.js?cb=$i$(date +%s)" | grep -c "The vault"); echo "try $i: $n"; [ "$n" -gt 0 ] && echo DEPLOYED && break; sleep 15; done
```
