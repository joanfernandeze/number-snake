import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeDirection, createSwipeTracker } from '../src/input.js';

const UP = { x: 0, y: -1 }, DOWN = { x: 0, y: 1 }, RIGHT = { x: 1, y: 0 };

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

test('an exact diagonal counts as vertical', () => {
  assert.deepEqual(swipeDirection(30, 30, 20), { x: 0, y: 1 });
});

test('tracker emits nothing before the threshold', () => {
  const t = createSwipeTracker(24);
  t.start(100, 100);
  assert.equal(t.move(110, 100), null);
  assert.equal(t.move(100, 120), null);
});

test('tracker emits when the finger crosses the threshold and re-anchors there', () => {
  const t = createSwipeTracker(24);
  t.start(100, 100);
  assert.deepEqual(t.move(130, 100), RIGHT);   // 30px right
  assert.equal(t.move(140, 100), null);        // only 10px from the new anchor
  assert.deepEqual(t.move(140, 130), DOWN);    // 30px down from the anchor
  assert.deepEqual(t.move(140, 100), UP);      // and back up without lifting
});

test('tracker ignores moves when not tracking', () => {
  const t = createSwipeTracker(24);
  assert.equal(t.move(200, 200), null);
  t.start(0, 0);
  t.end();
  assert.equal(t.move(200, 200), null);
});

test('tracker needs a clearly dominant axis to change heading mid-drag', () => {
  const t = createSwipeTracker(24, 1.5);
  t.start(0, 0);
  assert.deepEqual(t.move(30, 0), RIGHT);
  assert.equal(t.move(52, 30), null);      // 30 down vs 22 right: too diagonal to be a turn
  assert.deepEqual(t.move(52, 45), DOWN);  // 45 down vs 22 right: a real turn
});

test('tracker re-anchors on a same-axis repeat so a long drag keeps following the finger', () => {
  const t = createSwipeTracker(24, 1.5);
  t.start(0, 0);
  assert.deepEqual(t.move(30, 0), RIGHT);
  assert.deepEqual(t.move(60, 0), RIGHT);  // repeat is returned (the snake dedupes it)
  assert.deepEqual(t.move(60, 30), DOWN);  // measured from the latest anchor (60, 0)
});
