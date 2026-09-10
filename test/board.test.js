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
