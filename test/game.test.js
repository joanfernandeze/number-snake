import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import {
  createGame, step, startRun, targetInterval, smoothInterval, tickDue, nextTickTime, currentTarget,
  finish,
} from '../src/game.js';
import { SPAWN, TIMING, START, DIFFICULTIES, DEFAULT_DIFFICULTY, OBSTACLE, RELIEF } from '../src/constants.js';
import { parseBoard, BOARDS } from '../src/boards.js';

const UP = { x: 0, y: -1 }, DOWN = { x: 0, y: 1 };

test('targetInterval starts at the level opening speed and approaches its floor', () => {
  for (const cfg of Object.values(DIFFICULTIES)) {
    assert.equal(targetInterval(0, cfg), cfg.tickStartMs);
    const half = targetInterval(cfg.halfLifeEats, cfg);
    const gap = cfg.tickStartMs - cfg.tickFloorMs;
    assert.ok(Math.abs(half - (cfg.tickFloorMs + gap / 2)) < 1e-9, `${cfg.name} half life`);
    // Twelve half-lives is far past any real run (about 58 tiles) but still inside double
    // precision, where 10000 tiles would round the whole term away and hide the asymptote.
    const far = targetInterval(cfg.halfLifeEats * 12, cfg);
    assert.ok(far > cfg.tickFloorMs, 'the floor is an asymptote, never actually reached');
    assert.ok(far < cfg.tickFloorMs + 1, 'and the climb gets there for all practical purposes');
  }
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
  assert.equal(chill.matchHint, true, 'Chill rings the tiles that match your head');
  assert.equal(classic.matchHint, false);
  assert.equal(frenzy.matchHint, false);
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

test('an obstacle arrives every cfg.obstacleEvery tiles eaten', () => {
  const cfg = { ...DIFFICULTIES.classic, obstacleEvery: 2 };
  const g = createGame(createRng(9), cfg);
  startRun(g);
  const eat = () => {
    g.snake.cells = [{ x: 3, y: 9 }];
    g.snake.values = [2];
    g.snake.direction = { ...UP }; g.snake.queue = [];
    g.board.tiles = [{ x: 3, y: 8, value: 2 }];
    return step(g);
  };
  const first = eat();
  assert.equal(g.eaten, 1);
  assert.equal(first.obstacle, null, 'not yet');
  assert.equal(g.board.obstacles.length, 0);
  const second = eat();
  assert.equal(g.eaten, 2);
  assert.ok(second.obstacle, 'the second tile brings one');
  assert.equal(g.board.obstacles.length, 1);
});

test('obstacles stop arriving once the board has its fill', () => {
  const cfg = { ...DIFFICULTIES.classic, obstacleEvery: 1 };
  const g = createGame(createRng(11), cfg);
  startRun(g);
  for (let i = 0; i < OBSTACLE.max + 5; i++) {
    g.snake.cells = [{ x: 3, y: 9 }];
    g.snake.values = [2];
    g.snake.direction = { ...UP }; g.snake.queue = [];
    g.board.tiles = [{ x: 3, y: 8, value: 2 }];
    step(g);
  }
  assert.equal(g.board.obstacles.length, OBSTACLE.max);
});

test('running into an obstacle ends the run and names the cell', () => {
  const g = createGame(createRng(1));
  startRun(g);
  g.snake.cells = [{ x: 3, y: 5 }];
  g.snake.values = [2];
  g.snake.direction = { ...UP }; g.snake.queue = [];
  g.board.tiles = [];
  g.board.obstacles = [{ x: 3, y: 4 }];
  const ev = step(g);
  assert.equal(ev.over, true);
  assert.equal(g.over, true);
  assert.equal(g.lastCause.type, 'obstacle');
  assert.deepEqual(g.lastCause.cell, { x: 3, y: 4 });
});

test('every level drops obstacles, and Chill fills its board the most slowly', () => {
  const { chill, classic, frenzy } = DIFFICULTIES;
  for (const cfg of [chill, classic, frenzy]) {
    assert.ok(Number.isInteger(cfg.obstacleEvery) && cfg.obstacleEvery > 0, `${cfg.name} needs a cadence`);
  }
  assert.ok(chill.obstacleEvery > classic.obstacleEvery, 'Chill fills the board more slowly');
  // Frenzy keeps Classic's cadence on purpose: measured at every 7 the obstacles flattened
  // its climb from a median tile of 64 to 32, and a hard level should make the player fail,
  // not deny them the climb. Its difficulty comes from speed and from having two tiles.
  assert.equal(frenzy.obstacleEvery, classic.obstacleEvery);
});

test('a new obstacle is harmless until it has finished warning', () => {
  const g = createGame(createRng(1));
  startRun(g);
  g.board.tiles = [];
  g.board.obstacles = [{ x: 3, y: 4, armed: false, warn: 2 }];
  g.snake.cells = [{ x: 3, y: 5 }];
  g.snake.values = [2];
  g.snake.direction = { ...UP }; g.snake.queue = [];
  const ev = step(g);
  assert.equal(ev.over, false, 'driving through a blinking obstacle is safe');
  assert.deepEqual(g.snake.cells[0], { x: 3, y: 4 });
});

test('step reports the cells that just turned solid', () => {
  const g = createGame(createRng(1));
  startRun(g);
  g.board.tiles = [];
  g.board.obstacles = [{ x: 0, y: 0, armed: false, warn: 1 }];
  g.snake.cells = [{ x: 3, y: 5 }];
  g.snake.values = [2];
  g.snake.direction = { ...UP }; g.snake.queue = [];
  const ev = step(g);
  assert.deepEqual(ev.armed, [{ x: 0, y: 0 }]);
  assert.equal(step(g).armed.length, 0, 'only on the tick it happens');
});

test('an armed obstacle still ends the run', () => {
  const g = createGame(createRng(1));
  startRun(g);
  g.board.tiles = [];
  g.board.obstacles = [{ x: 3, y: 4, armed: true, warn: 0 }];
  g.snake.cells = [{ x: 3, y: 5 }];
  g.snake.values = [2];
  g.snake.direction = { ...UP }; g.snake.queue = [];
  const ev = step(g);
  assert.equal(ev.over, true);
  assert.equal(g.lastCause.type, 'obstacle');
});

test('a cascade buys breathing room, a single merge does not', () => {
  const g = createGame(createRng(1));
  startRun(g);
  assert.equal(g.relief, 0);
  assert.equal(currentTarget(g), targetInterval(g.eaten, g.cfg), 'no relief, no stretch');
  // Eating a 2 onto [2, 4, 8] cascades three times: 2+2 -> 4, 4+4 -> 8, 8+8 -> 16.
  g.snake.cells = [{ x: 3, y: 5 }, { x: 3, y: 6 }, { x: 3, y: 7 }];
  g.snake.values = [2, 4, 8];
  g.snake.direction = { ...UP }; g.snake.queue = [];
  g.board.tiles = [{ x: 3, y: 4, value: 2 }];
  const ev = step(g);
  assert.ok(ev.merges >= RELIEF.minMerges, `expected a cascade, got ${ev.merges}`);
  assert.equal(ev.relief, true);
  assert.equal(g.relief, RELIEF.ticks);
  assert.ok(Math.abs(currentTarget(g) - targetInterval(g.eaten, g.cfg) * RELIEF.factor) < 1e-9);
});

test('relief runs out after its ticks and the speed returns', () => {
  const g = createGame(createRng(1));
  startRun(g);
  g.board.tiles = [];
  g.relief = 2;
  g.snake.cells = [{ x: 3, y: 8 }];
  g.snake.values = [2];
  g.snake.direction = { ...UP }; g.snake.queue = [];
  step(g);
  assert.equal(g.relief, 1);
  step(g);
  assert.equal(g.relief, 0);
  assert.equal(currentTarget(g), targetInterval(g.eaten, g.cfg));
});

test('a game on a shaped board starts where the board says and dies on a wall cell', () => {
  const shaped = parseBoard(['.......', '.......', '.......', '...#...', '.......', '...S...',
    '.......', '.......', '.......', '.......', '.......']);
  const g = createGame(createRng(1), DIFFICULTIES.classic, { board: shaped });
  assert.deepEqual(g.snake.cells[0], { x: 3, y: 5 });
  assert.equal(g.board.walls.has('3,3'), true);
  assert.ok(!g.board.tiles.some(t => t.x === 3 && t.y === 3), 'no tile spawned on the wall');
  startRun(g);
  // Two steps up: (3,4) is free, (3,3) is the wall.
  let ev = step(g);
  assert.equal(ev.over, false);
  ev = step(g);
  assert.equal(ev.over, true);
  assert.equal(ev.cause.type, 'wall');
  assert.deepEqual(ev.cause.cell, { x: 3, y: 3 });
});

test('createGame without options is the open board with the centre start, as before', () => {
  const g = createGame(createRng(1), DIFFICULTIES.classic);
  assert.deepEqual(g.snake.cells[0], { x: 3, y: 5 });
  assert.equal(g.board.walls.size, 0);
  assert.equal(g.won, false);
});

test('finish ends a run in victory and step refuses to move afterwards', () => {
  const g = createGame(createRng(2), DIFFICULTIES.classic);
  startRun(g);
  const ev = finish(g);
  assert.equal(g.over, true);
  assert.equal(g.won, true);
  assert.deepEqual(ev, { over: true, won: true, cause: { type: 'won', cell: { x: 3, y: 5 } } });
  assert.deepEqual(step(g), { over: true });
});

test('finish refuses to overwrite a run that already ended in death', () => {
  const g = createGame(createRng(3), DIFFICULTIES.classic);
  startRun(g);
  // Straight up from the centre start with no turns queued: it reaches the frame in a few
  // ticks and can never hit itself on a straight line, so this ends in a wall death for any seed.
  for (let i = 0; i < 10 && !g.over; i++) step(g);
  assert.equal(g.over, true, 'the snake should have run into the frame by now');
  assert.equal(g.lastCause.type, 'wall');
  const deathCause = g.lastCause;
  const ev = finish(g);
  assert.deepEqual(ev, { over: true, won: false, cause: deathCause });
  assert.equal(g.won, false, 'a death stays a death');
  assert.equal(g.lastCause.type, 'wall');
});

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

test('every difficulty keeps its spawn decay strictly inside (0, 1): low end heaviest, top still reachable', () => {
  for (const cfg of Object.values(DIFFICULTIES)) {
    assert.ok(cfg.decay > 0 && cfg.decay < 1, `${cfg.name} decay ${cfg.decay}`);
  }
});

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
