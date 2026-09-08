import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeDirection } from '../src/input.js';

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
