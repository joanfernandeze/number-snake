import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { createGame, step, startRun, targetInterval, smoothInterval, tickDue, nextTickTime } from '../src/game.js';
import { SPAWN, TIMING, START } from '../src/constants.js';

const UP = { x: 0, y: -1 }, DOWN = { x: 0, y: 1 };

test('targetInterval starts at the gentle tick and approaches the floor from above', () => {
  assert.equal(targetInterval(0), TIMING.tickStartMs);
  assert.ok(targetInterval(100) < targetInterval(0));             // speeds up with score
  // An asymptote, not a wall: still above the floor at a score no run will see, and
  // close enough to it there that the last stretch of the climb is imperceptible.
  const unreachable = TIMING.halfLifeScore * 12;
  assert.ok(targetInterval(unreachable) > TIMING.tickFloorMs);
  assert.ok(targetInterval(unreachable) - TIMING.tickFloorMs < 1);
});

test('targetInterval closes half the gap to the floor every halfLifeScore points', () => {
  const gap = (score) => targetInterval(score) - TIMING.tickFloorMs;
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);
  near(gap(TIMING.halfLifeScore), gap(0) / 2);
  near(gap(TIMING.halfLifeScore * 2), gap(0) / 4);
});

test('targetInterval shaves less off per point as the score grows', () => {
  // The whole point of the geometric curve: a 200-point cascade late in a run must not
  // move the speed the way the same 200 points did at the start.
  const early = targetInterval(0) - targetInterval(200);
  const late = targetInterval(1000) - targetInterval(1200);
  // The exact ratio is pinned by the half-life test above; this one guards the intent.
  assert.ok(late < early * 0.7, `late ${late} not much gentler than early ${early}`);
});

test('smoothInterval eases toward the target instead of snapping to it', () => {
  const step = smoothInterval(800, 600, 100, 1200); // one frame-ish of catching up
  assert.ok(step < 800 && step > 780, `moved too far in one frame: ${step}`);
  // A dt of one tau covers ~63% of the gap, whatever the framerate.
  const once = smoothInterval(800, 600, 1200, 1200);
  const twice = smoothInterval(smoothInterval(800, 600, 600, 1200), 600, 600, 1200);
  assert.ok(Math.abs(once - twice) < 1e-9, 'not framerate-independent');
  assert.ok(Math.abs(once - (600 + 200 * Math.exp(-1))) < 1e-9);
  assert.equal(smoothInterval(800, 600, 0, 1200), 800); // a zero-length frame changes nothing
});

test('tickDue fires on time, and early when a turn is waiting', () => {
  const iv = 800, early = iv * TIMING.turnEarlyFrac;
  assert.equal(tickDue(iv, iv, false), true);
  assert.equal(tickDue(iv - 1, iv, false), false);       // no turn: wait it out
  assert.equal(tickDue(early, iv, true), true);          // turn queued: land it now
  assert.equal(tickDue(early - 1, iv, true), false);     // ... but not before the slide has read
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
  assert.equal(g.snake.cells.length, START.snakeLength);
  assert.equal(START.snakeLength, 1); // a lone head: no permanent junk segment behind it
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
