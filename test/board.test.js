import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import {
  createBoard, tileAt, removeTile, pickValue, spawnTile, refill, spawnObstacle, obstacleAt,
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
