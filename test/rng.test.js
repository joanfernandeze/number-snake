import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, randInt } from '../src/rng.js';

test('same seed produces the same sequence', () => {
  const a = createRng(123), b = createRng(123);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test('different seeds diverge', () => {
  const a = createRng(1), b = createRng(2);
  assert.notEqual(a(), b());
});

test('values are in [0, 1)', () => {
  const r = createRng(42);
  for (let i = 0; i < 100; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test('randInt stays in [0, n)', () => {
  const r = createRng(7);
  for (let i = 0; i < 100; i++) {
    const v = randInt(r, 5);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 5, `randInt ${v} out of range`);
  }
});
