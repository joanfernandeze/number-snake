import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import {
  createBoard, tileAt, removeTile, pickValue, spawnTile, refill, spawnObstacle, obstacleAt,
  armedObstacleAt, armObstacles, wallAt, gateAt, closedGateAt, swapGates, tickGates, reachableFrom,
  ensureReachableTile,
} from '../src/board.js';
import { OBSTACLE, GATE } from '../src/constants.js';

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

test('spawnTile never lands on the snake or another tile', () => {
  const r = createRng(7);
  const b = createBoard(3, 3);
  const snakeCells = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  for (let i = 0; i < 5; i++) spawnTile(b, r, 2, snakeCells);
  for (const t of b.tiles) {
    assert.ok(!snakeCells.some(c => c.x === t.x && c.y === t.y), 'tile on snake');
  }
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

test('a new board has no obstacles and reports none anywhere', () => {
  const board = createBoard();
  assert.deepEqual(board.obstacles, []);
  assert.equal(obstacleAt(board, 3, 5), null);
});

test('spawnObstacle keeps its distance from the head', () => {
  const head = { x: 3, y: 5 };
  for (let i = 0; i < 60; i++) {
    const board = createBoard();
    const o = spawnObstacle(board, createRng(100 + i), [head], head, 4);
    assert.ok(o, 'somewhere always qualifies on an empty board');
    assert.ok(Math.abs(o.x - head.x) + Math.abs(o.y - head.y) >= 4, `too close: ${JSON.stringify(o)}`);
  }
});

test('spawnObstacle never lands on the snake, a tile or another obstacle', () => {
  const head = { x: 0, y: 0 };
  const board = createBoard();
  board.tiles = [{ x: 6, y: 10, value: 2 }];
  const snake = [head, { x: 0, y: 1 }, { x: 0, y: 2 }];
  for (let i = 0; i < 30; i++) {
    const o = spawnObstacle(board, createRng(200 + i), snake, head, 3);
    if (!o) continue;
    assert.ok(!board.tiles.some(t => t.x === o.x && t.y === o.y), 'not on a tile');
    assert.ok(!snake.some(c => c.x === o.x && c.y === o.y), 'not on the snake');
    assert.equal(board.obstacles.filter(q => q.x === o.x && q.y === o.y).length, 1, 'not stacked');
  }
});

test('spawnObstacle avoids sitting beside another obstacle while it can', () => {
  const head = { x: 0, y: 0 };
  const board = createBoard();
  board.obstacles = [{ x: 3, y: 5 }];
  const touching = (o) => Math.abs(o.x - 3) + Math.abs(o.y - 5) === 1;
  let neighbours = 0;
  for (let i = 0; i < 60; i++) {
    board.obstacles = [{ x: 3, y: 5 }];
    const o = spawnObstacle(board, createRng(300 + i), [head], head, 3);
    if (o && touching(o)) neighbours++;
  }
  assert.equal(neighbours, 0, 'an empty board always has somewhere better to go');
});

test('spawnObstacle returns null when nowhere at all qualifies', () => {
  const board = createBoard(2, 1);
  const snake = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  assert.equal(spawnObstacle(board, createRng(1), snake, snake[0], 1), null);
});

test('tiles never spawn on an obstacle', () => {
  const board = createBoard(3, 1);
  board.obstacles = [{ x: 1, y: 0 }];
  refill(board, createRng(5), 4, [], 5, 0.45);
  assert.ok(board.tiles.every(t => !(t.x === 1 && t.y === 0)), JSON.stringify(board.tiles));
  assert.equal(board.tiles.length, 2, 'only the two free cells get tiles');
});

test('a fresh obstacle lands unarmed, blocking spawns but harmless to touch', () => {
  const board = createBoard();
  const head = { x: 0, y: 0 };
  const o = spawnObstacle(board, createRng(4), [head], head, 3);
  assert.equal(o.armed, false);
  assert.equal(o.warn, OBSTACLE.warnTicks);
  assert.ok(obstacleAt(board, o.x, o.y), 'it occupies the cell for spawning');
  assert.equal(armedObstacleAt(board, o.x, o.y), null, 'but it cannot kill yet');
});

test('armObstacles counts a fresh obstacle down and then turns it solid', () => {
  const board = createBoard();
  board.obstacles = [{ x: 2, y: 3, armed: false, warn: 3 }];
  assert.deepEqual(armObstacles(board, []), []);
  assert.equal(board.obstacles[0].warn, 2);
  assert.deepEqual(armObstacles(board, []), []);
  const armed = armObstacles(board, []);
  assert.deepEqual(armed, [{ x: 2, y: 3 }], 'it reports the cell that just turned solid');
  assert.equal(board.obstacles[0].armed, true);
  assert.ok(armedObstacleAt(board, 2, 3), 'and now it kills');
  assert.deepEqual(armObstacles(board, []), [], 'an armed obstacle is left alone');
});

test('an obstacle about to arm under the snake is cancelled instead of killing', () => {
  const board = createBoard();
  board.obstacles = [{ x: 2, y: 3, armed: false, warn: 1 }];
  assert.deepEqual(armObstacles(board, [{ x: 2, y: 3 }]), []);
  assert.equal(board.obstacles.length, 0, 'it gives up rather than kill from underneath');
});

test('walls are stored, found, and never receive tiles or obstacles', () => {
  const walls = new Set(['1,2', '5,2']);
  const b = createBoard(7, 11, walls);
  assert.equal(wallAt(b, 1, 2), true);
  assert.equal(wallAt(b, 0, 0), false);
  assert.equal(createBoard(7, 11).walls.size, 0, 'no walls by default');
  const rng = createRng(7);
  // Fill the whole board: every free cell gets a tile, the walls stay bare.
  refill(b, rng, 4, [], 7 * 11, 0.5);
  assert.equal(b.tiles.length, 7 * 11 - 2);
  assert.ok(!b.tiles.some(t => walls.has(`${t.x},${t.y}`)));
  const b2 = createBoard(7, 11, walls);
  for (let i = 0; i < 200; i++) spawnObstacle(b2, rng, [], null);
  assert.ok(!b2.obstacles.some(o => walls.has(`${o.x},${o.y}`)));
});

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

test('reachableFrom: a closing gate blocks unless passClosing; armed obstacles block, the body does not', () => {
  const b = createBoard(5, 1, new Set(), [{ x: 2, y: 0, set: 'A' }]);
  swapGates(b); // A is now closing
  assert.equal(reachableFrom(b, { x: 0, y: 0 }).has('3,0'), false, 'a closing gate blocks');
  assert.equal(reachableFrom(b, { x: 0, y: 0 }, true).has('3,0'), true, 'passClosing lets it through');
  b.gates[0].state = 'closed';
  assert.equal(reachableFrom(b, { x: 0, y: 0 }, true).has('3,0'), false, 'a closed gate always blocks');

  const c = createBoard(5, 1);
  c.obstacles = [{ x: 2, y: 0, armed: true }];
  assert.equal(reachableFrom(c, { x: 0, y: 0 }).has('3,0'), false, 'an armed obstacle in a corridor blocks');
  c.obstacles = [{ x: 2, y: 0, armed: false, warn: 2 }];
  assert.equal(reachableFrom(c, { x: 0, y: 0 }).has('3,0'), true, 'a blinking one does not');
  // The body is not an input: a snake lying along the corridor leaves the far end reachable.
  c.obstacles = [];
  assert.equal(reachableFrom(c, { x: 0, y: 0 }).has('4,0'), true, 'the corridor beyond the body is reached');
});

test('spawnTile falls back to closing gates when the head is shut in with nothing free', () => {
  const b = createBoard(5, 1, new Set(), [{ x: 2, y: 0, set: 'A' }]);
  swapGates(b); // the gate beside the head's room is closing, so strictly nothing is reachable
  const snake = [{ x: 1, y: 0 }, { x: 0, y: 0 }];
  assert.equal(reachableFrom(b, snake[0]).size, 2, 'strictly the room is only the snake');
  const t = spawnTile(b, createRng(3), 2, snake);
  assert.ok(t, 'a tile still spawns');
  assert.ok(t.x >= 3, `it lands beyond the closing gate, got ${t.x}`);
});

test('spawnObstacle keeps clear of gates while anywhere else qualifies', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const b = createBoard(5, 1, new Set(), [{ x: 2, y: 0, set: 'A' }]);
    const o = spawnObstacle(b, createRng(seed), [], null, 0);
    assert.ok(o.x === 0 || o.x === 4, `seed ${seed}: obstacle at ${o.x} sits beside the gate`);
  }
});

// Row 3 is a wall with one B gate at (3,3), closed; the head is below at (3,6).
function sealedBoard() {
  const walls = new Set(['0,3', '1,3', '2,3', '4,3', '5,3', '6,3']);
  return createBoard(7, 11, walls, [{ x: 3, y: 3, set: 'B' }]);
}

test('ensureReachableTile moves one sealed-off tile into the head\'s region', () => {
  const b = sealedBoard();
  b.tiles = [{ x: 0, y: 0, value: 2 }, { x: 5, y: 1, value: 4 }, { x: 2, y: 2, value: 8 }];
  const before = b.tiles.map(t => ({ ...t }));
  const snake = [{ x: 3, y: 6 }, { x: 3, y: 7 }];
  const moved = ensureReachableTile(b, createRng(5), snake);
  assert.ok(moved);
  const below = b.tiles.filter(t => t.y > 3);
  assert.equal(below.length, 1, 'exactly one tile is below the wall');
  assert.equal(below[0], moved);
  assert.equal(moved.value, 2, 'the first unreachable tile moved, keeping its value');
  assert.ok(!snake.some(c => c.x === moved.x && c.y === moved.y), 'not onto the snake');
  assert.deepEqual(b.tiles.slice(1), before.slice(1), 'the others are unchanged');
});

test('ensureReachableTile does nothing when a tile is already reachable', () => {
  const b = sealedBoard();
  b.tiles = [{ x: 0, y: 0, value: 2 }, { x: 1, y: 8, value: 4 }];
  assert.equal(ensureReachableTile(b, createRng(5), [{ x: 3, y: 6 }]), null);
  assert.deepEqual(b.tiles, [{ x: 0, y: 0, value: 2 }, { x: 1, y: 8, value: 4 }]);
});

test('ensureReachableTile returns at once on a gate-free board, without drawing from the rng', () => {
  const b = createBoard(7, 11, new Set(['0,3', '1,3', '2,3', '3,3', '4,3', '5,3', '6,3']));
  b.tiles = [{ x: 0, y: 0, value: 2 }];
  const rng = createRng(9);
  assert.equal(ensureReachableTile(b, rng, [{ x: 3, y: 6 }]), null);
  assert.equal(rng(), createRng(9)(), 'the rng was not consumed');
  assert.deepEqual(b.tiles, [{ x: 0, y: 0, value: 2 }]);
});

test('ensureReachableTile counts a closing gate as passable', () => {
  const b = sealedBoard();
  swapGates(b); // B opens...
  swapGates(b); // ...and is now closing
  assert.equal(gateAt(b, 3, 3).state, 'closing');
  b.tiles = [{ x: 0, y: 0, value: 2 }];
  assert.equal(ensureReachableTile(b, createRng(5), [{ x: 3, y: 6 }]), null);
  assert.deepEqual(b.tiles, [{ x: 0, y: 0, value: 2 }], 'nothing moved');
});

test('ensureReachableTile returns null when the head\'s region has no free cell', () => {
  // A 3x1 strip: the snake fills the left two cells, the B gate is the third, closed; tile beyond it.
  const b = createBoard(4, 1, new Set(), [{ x: 2, y: 0, set: 'B' }]);
  b.tiles = [{ x: 3, y: 0, value: 2 }];
  assert.equal(ensureReachableTile(b, createRng(5), [{ x: 1, y: 0 }, { x: 0, y: 0 }]), null);
  assert.deepEqual(b.tiles, [{ x: 3, y: 0, value: 2 }]);
});
