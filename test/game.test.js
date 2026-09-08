import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { createGame, step, startRun, tickInterval, nextTickTime } from '../src/game.js';
import { SPAWN, TIMING } from '../src/constants.js';

const UP = { x: 0, y: -1 }, DOWN = { x: 0, y: 1 };

test('tickInterval starts at the configured gentle tick and clamps at the floor', () => {
  assert.equal(tickInterval(0), TIMING.tickStartMs);
  assert.equal(tickInterval(100000), TIMING.tickFloorMs); // clamped
  assert.ok(tickInterval(100) < tickInterval(0)); // speeds up with score
});

test('nextTickTime advances by one interval so leftover time carries into the next slide', () => {
  assert.equal(nextTickTime(1000, 200, 1216), 1200); // 16ms late: no one-frame pause
  assert.equal(nextTickTime(1000, 200, 1399), 1200); // still within one interval of catch-up
  assert.equal(nextTickTime(1000, 200, 1400), 1200); // exactly two intervals late: still keep the leftover
});

test('nextTickTime resyncs to now after a long gap instead of fast-forwarding', () => {
  assert.equal(nextTickTime(1000, 200, 1650), 1650); // e.g. the tab was hidden
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
  startRun(g);
  g.snake.cells = [{ x: 3, y: 5 }];
  g.snake.values = [2];
  g.snake.direction = { ...UP }; g.snake.queue = [];
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
  startRun(g);
  g.snake.cells = [{ x: 3, y: 0 }];
  g.snake.values = [2];
  g.snake.direction = { ...UP }; g.snake.queue = [];
  g.board.tiles = [];
  const ev = step(g);
  assert.equal(ev.over, true);
  assert.equal(g.over, true);
  assert.equal(g.lastCause.type, 'wall');
});

test('moving into your own body ends the run', () => {
  const g = createGame(createRng(1));
  startRun(g);
  g.snake.cells = [
    { x: 3, y: 5 }, { x: 3, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }, { x: 5, y: 5 },
  ];
  g.snake.values = [2, 2, 2, 2, 2];
  g.snake.direction = { ...DOWN }; g.snake.queue = [];
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

test('step waits until the run is started, then moves', () => {
  const g = createGame(createRng(1));
  const before = { ...g.snake.cells[0] };
  const ev = step(g);
  assert.equal(ev.waiting, true);
  assert.equal(ev.over, false);
  assert.equal(g.started, false);
  assert.deepEqual(g.snake.cells[0], before);
  assert.equal(g.ticks, 0);
  startRun(g);
  assert.equal(g.started, true);
  step(g);
  assert.notDeepEqual(g.snake.cells[0], before);
  assert.equal(g.ticks, 1);
});

test("SPAWN.window 'head' caps spawned tiles at the head value", () => {
  const prev = SPAWN.window;
  SPAWN.window = 'head';
  try {
    // 20 seeds x 3 spawns: with the default 'max' window (values up to 64) the odds
    // that all 60 tiles land <= 4 are ~1e-6, so this reliably fails before Step 4.
    for (let seed = 1; seed <= 20; seed++) {
      const g = createGame(createRng(seed));
      startRun(g);
      g.snake.cells = [{ x: 3, y: 5 }, { x: 3, y: 6 }];
      g.snake.values = [2, 64];
      g.snake.direction = { ...UP }; g.snake.queue = [];
      g.board.tiles = [{ x: 3, y: 4, value: 2 }];
      step(g); // eat 2 onto 2 -> head 4, body 64; refill spawns 3 tiles
      assert.deepEqual(g.snake.values, [4, 64]);
      assert.equal(g.board.tiles.length, 3);
      assert.ok(g.board.tiles.every(t => t.value <= 4), `seed ${seed}: tiles ${JSON.stringify(g.board.tiles)}`);
    }
  } finally {
    SPAWN.window = prev;
  }
});
