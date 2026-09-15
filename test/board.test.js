import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import {
  createBoard, tileAt, removeTile, pickValue, spawnTile, refill, spawnObstacle, obstacleAt,
  armedObstacleAt, armObstacles, wallAt,
} from '../src/board.js';
import { OBSTACLE } from '../src/constants.js';

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
