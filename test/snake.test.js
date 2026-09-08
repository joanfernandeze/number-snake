import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSnake, head, length, maxValue,
  setDirection, nextDirection, nextHeadCell, isWall, hitsSelf, move, eat,
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
  assert.deepEqual(nextDirection(s), UP); // reverse rejected
  setDirection(s, LEFT);
  assert.deepEqual(nextDirection(s), LEFT); // turn accepted
});

test('setDirection allows a reverse when the snake is a single segment', () => {
  const s = createSnake(1, 2, { x: 3, y: 5 }, UP);
  setDirection(s, DOWN);
  assert.deepEqual(nextDirection(s), DOWN); // nothing behind the head to crash into
});

test('nextHeadCell uses the queued direction', () => {
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

test('eat with no match grows the snake by one segment at the head', () => {
  const s = createSnake(2, 2, { x: 3, y: 5 }, UP);
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
  assert.equal(length(s), 4);
  assert.deepEqual(s.cells[0], { x: 3, y: 4 });
  assert.deepEqual(s.cells[3], { x: 3, y: 7 });
});

test('setDirection ignores a repeat of the current heading', () => {
  const s = createSnake(2, 2, { x: 3, y: 5 }, UP);
  setDirection(s, UP);
  assert.deepEqual(s.queue, []);
});

test('setDirection buffers two turns so a fast LEFT-then-DOWN lands both', () => {
  const s = createSnake(3, 2, { x: 3, y: 5 }, UP);
  setDirection(s, LEFT);
  setDirection(s, DOWN); // reverses the UP heading, but is a legal turn after LEFT
  assert.deepEqual(s.queue, [LEFT, DOWN]);
  assert.deepEqual(nextDirection(s), LEFT);
  move(s);
  assert.deepEqual(s.direction, LEFT);
  assert.deepEqual(head(s), { x: 2, y: 5 });
  move(s);
  assert.deepEqual(s.direction, DOWN);
  assert.deepEqual(head(s), { x: 2, y: 6 });
  assert.deepEqual(s.queue, []);
});

test('setDirection drops a third turn while two are buffered', () => {
  const s = createSnake(3, 2, { x: 3, y: 5 }, UP);
  setDirection(s, LEFT);
  setDirection(s, DOWN);
  setDirection(s, RIGHT);
  assert.deepEqual(s.queue, [LEFT, DOWN]);
});

test('setDirection ignores a reverse of the last queued turn', () => {
  const s = createSnake(3, 2, { x: 3, y: 5 }, RIGHT);
  setDirection(s, UP);
  setDirection(s, DOWN); // would reverse the queued UP
  assert.deepEqual(s.queue, [UP]);
});

test('move keeps the heading when nothing is queued', () => {
  const s = createSnake(2, 2, { x: 3, y: 5 }, UP);
  move(s);
  assert.deepEqual(s.direction, UP);
  assert.deepEqual(head(s), { x: 3, y: 4 });
});

test('eat consumes the queued turn like move does', () => {
  const s = createSnake(2, 2, { x: 3, y: 5 }, UP);
  setDirection(s, RIGHT);
  const cell = nextHeadCell(s);
  assert.deepEqual(cell, { x: 4, y: 5 });
  eat(s, cell, 8);
  assert.deepEqual(s.direction, RIGHT);
  assert.deepEqual(s.queue, []);
  assert.deepEqual(head(s), { x: 4, y: 5 });
});
